# -*- coding: utf-8 -*-
"""Sheets write guard — WO-5 idempotency and error-class-aware retry.

Replaces the blanket `except Exception: retry` wrappers that caused E4
(duplicate rows) and E5 (a 404 retried four times).

Rules enforced here:
  1. Never retry a 4xx. A 4xx is a contract error, not a transient fault.
  2. A timeout means UNKNOWN, not FAILED. Re-read the target to find out
     whether the write landed, then act on the answer. If the answer cannot
     be obtained, raise — never retry blindly.
  3. Suppress a re-append of a natural key this process already wrote.
  4. Retry only 5xx and connection errors, with bounded backoff.

INSTALL AT THE OUTERMOST LAYER. In this repo the Railway entrypoint is
connectors/telegram_webhook_runtime.py, which reassigns bot._append *after*
connectors/telegram_webhook.py does. Installing anywhere else leaves the
production direct-write path unguarded. See PATCH.md.

    from connectors import sheets_write_guard
    bot._append = sheets_write_guard.install(bot)
"""
from __future__ import annotations

import os
import socket
import threading
import time
import urllib.error
from collections import OrderedDict

# ---------------------------------------------------------------- configuration

# Column index (0-based) holding the natural key, per tab. None = no natural
# key, so the row is written without dedupe or verification.
#
#   intake row       [Intake_ID, ts, "TELEGRAM", chat_id, ...]   -> 0
#   conversation row [chat_id, Intake_ID, ts, ...]               -> 1
#   status row       [ts, component, status, ...]                -> None
#
# A status row's first column is a timestamp, not an identifier. Treating it
# as a key would silently drop two status events logged in the same second.
KEY_COLUMN_BY_TAB: dict = {}

DEFAULT_KEY_COLUMN = 0
BACKOFF_SECONDS = (1, 2, 4)

# Post-timeout verification. Runs only on the rare timeout path. This is the
# rule that actually prevents E4, so it defaults on.
VERIFY_ENABLED = os.environ.get("SHEETS_GUARD_VERIFY", "1").strip() == "1"

# Pre-write remote duplicate check. Costs one Sheets read on every single
# append, on the Telegram hot path, so it defaults OFF. The in-process cache
# below is free and catches the retry-storm duplicates that caused E4.
DEDUPE_ENABLED = os.environ.get("SHEETS_GUARD_DEDUPE", "0").strip() == "1"

# Remember keys this process has successfully written.
_RECENT_MAX = int(os.environ.get("SHEETS_GUARD_RECENT_MAX", "2000") or 2000)
_recent: OrderedDict = OrderedDict()
_recent_lock = threading.Lock()

_SERVICE = None
_service_lock = threading.Lock()


def _log(message: str):
    print(f"[sheets_guard] {message}", flush=True)


def _remember(tab: str, key: str):
    with _recent_lock:
        _recent[(tab, key)] = True
        while len(_recent) > _RECENT_MAX:
            _recent.popitem(last=False)


def _seen(tab: str, key: str) -> bool:
    with _recent_lock:
        return (tab, key) in _recent


# ---------------------------------------------------------------- error classes

def _chain(exc: BaseException, depth: int = 4):
    """Yield exc and its __cause__/__context__ chain.

    telegram_webhook_runtime wraps a failed write in
    `RuntimeError(...) from fallback_error`, which hides the HTTP status on the
    outer object. Classifying only the outer exception would demote every 404
    to 'unknown' and every 503 to 'non-retryable'.
    """
    seen = set()
    current = exc
    while current is not None and depth > 0 and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__
        depth -= 1


def _own_status_code(exc: BaseException):
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    # googleapiclient HttpError carries resp.status
    status = getattr(getattr(exc, "resp", None), "status", None)
    if isinstance(status, int):
        return status
    try:
        return int(status)
    except (TypeError, ValueError):
        return None


def _status_code(exc: Exception):
    """Return an HTTP status code from the exception or its cause chain."""
    for item in _chain(exc):
        code = _own_status_code(item)
        if code is not None:
            return code
    return None


def _is_timeout(exc: Exception) -> bool:
    for item in _chain(exc):
        if isinstance(item, (socket.timeout, TimeoutError)):
            return True
        if isinstance(item, urllib.error.URLError):
            if isinstance(getattr(item, "reason", None), (socket.timeout, TimeoutError)):
                return True
        if "timed out" in str(item).lower():
            return True
    return False


def _is_retryable(exc: Exception) -> bool:
    """5xx and connection-level faults only. Never 4xx."""
    code = _status_code(exc)
    if code is not None:
        return 500 <= code < 600
    for item in _chain(exc):
        if isinstance(item, urllib.error.HTTPError):
            return False
        if isinstance(item, urllib.error.URLError):
            return True
        if isinstance(item, (ConnectionError, socket.gaierror)):
            return True
    return False


# ---------------------------------------------------------------- key lookup

def _key_of(tab: str, row: list):
    if not row:
        return None
    index = KEY_COLUMN_BY_TAB.get(tab, DEFAULT_KEY_COLUMN)
    if index is None or index >= len(row):
        return None
    value = row[index]
    if value is None:
        return None
    return str(value).strip() or None


def _column_letter(number: int) -> str:
    out = ""
    while number > 0:
        number, rest = divmod(number - 1, 26)
        out = chr(65 + rest) + out
    return out


def _service(bot):
    """Read-side Sheets client. None when a direct route is unavailable."""
    global _SERVICE
    if _SERVICE is not None:
        return _SERVICE
    with _service_lock:
        if _SERVICE is not None:
            return _SERVICE
        try:
            from connectors import google_credentials

            info = google_credentials.service_account_info()
            if not info or not getattr(bot, "GOOGLE_SHEET_ID", ""):
                return None
            from google.oauth2 import service_account
            from googleapiclient.discovery import build

            credentials = service_account.Credentials.from_service_account_info(
                info, scopes=["https://www.googleapis.com/auth/spreadsheets"]
            )
            _SERVICE = build("sheets", "v4", credentials=credentials, cache_discovery=False)
            return _SERVICE
        except Exception as exc:  # noqa: BLE001
            _log(f"verification client unavailable: {str(exc)[:150]}")
            return None


def _key_exists(bot, tab: str, key: str):
    """True / False if determinable, None if the check itself is unreliable.

    None is load-bearing: an unverifiable check must never be read as 'absent',
    because 'absent' authorises a retry, and a wrong retry is a duplicate row.

    Primary route reads the key column only -- one cheap call, and correct no
    matter how many rows the tab holds.
    """
    if not key:
        return None

    index = KEY_COLUMN_BY_TAB.get(tab, DEFAULT_KEY_COLUMN)
    service = _service(bot)
    if service is not None and index is not None:
        column = _column_letter(index + 1)
        safe_tab = str(tab).replace("'", "''")
        a1 = f"'{safe_tab}'!{column}:{column}"
        try:
            values = service.spreadsheets().values().get(
                spreadsheetId=bot.GOOGLE_SHEET_ID, range=a1,
            ).execute().get("values", [])
            present = {str(cell[0]).strip() for cell in values if cell}
            return key in present
        except Exception as exc:  # noqa: BLE001 - verification must never raise
            _log(f"column verify failed for {tab} key={key}: {str(exc)[:150]}")

    # Fallback: sheet_intelligence.search reads only the first 150 rows of each
    # tab, and appends land at the bottom. It can therefore confirm presence but
    # can NEVER prove absence. Return True or None -- never False.
    try:
        from connectors import sheet_intelligence as si

        if not si.configured():
            return None
        for entry in si.search(key, max_results=25) or []:
            if not isinstance(entry, dict):
                continue
            if entry.get("sheet") and entry.get("sheet") != tab:
                continue
            if key in [str(v).strip() for v in (entry.get("values") or [])]:
                return True
        return None
    except Exception as exc:  # noqa: BLE001
        _log(f"search verify failed for {key}: {str(exc)[:150]}")
        return None


# ---------------------------------------------------------------- guarded write

def install(bot, raw_append=None):
    """Wrap the current bot._append. Returns the guarded callable."""
    raw_append = raw_append or bot._append

    KEY_COLUMN_BY_TAB.setdefault(getattr(bot, "INTAKE_TAB", "مدخلات الوكيل"), 0)
    KEY_COLUMN_BY_TAB.setdefault(getattr(bot, "CONVERSATION_TAB", "محادثات الوكيل"), 1)
    KEY_COLUMN_BY_TAB.setdefault(getattr(bot, "STATUS_TAB", "حالة الوكيل"), None)

    _log(
        "installed: verify={} dedupe={} keys={}".format(
            "on" if VERIFY_ENABLED else "off",
            "on" if DEDUPE_ENABLED else "off",
            {k: v for k, v in KEY_COLUMN_BY_TAB.items()},
        )
    )

    def guarded_append(tab: str, row: list):
        key = _key_of(tab, row)

        # Rule 3 -- this process already wrote this key. Free, no API call.
        if key and _seen(tab, key):
            _log(f"duplicate suppressed (in-process): {tab} key={key}")
            return

        # Optional remote pre-write check. Costs one read per append.
        if DEDUPE_ENABLED and key and _key_exists(bot, tab, key) is True:
            _log(f"duplicate suppressed (remote): {tab} key={key}")
            _remember(tab, key)
            return

        last_error = None
        for attempt in range(1, len(BACKOFF_SECONDS) + 2):
            try:
                result = raw_append(tab, row)
                if key:
                    _remember(tab, key)
                return result

            except Exception as exc:  # noqa: BLE001 - connector boundary
                last_error = exc
                code = _status_code(exc)

                # Rule 2 -- timeout means UNKNOWN. Verify before deciding.
                if _is_timeout(exc):
                    landed = _key_exists(bot, tab, key) if (VERIFY_ENABLED and key) else None
                    if landed is True:
                        _log(f"timeout but write landed: {tab} key={key}")
                        _remember(tab, key)
                        return
                    if landed is False:
                        _log(f"timeout and write absent, retrying: {tab} key={key}")
                    else:
                        _log(f"timeout unverifiable, NOT retrying: {tab} key={key}")
                        raise RuntimeError(
                            f"Sheets write outcome unknown for {tab} key={key}: {exc}"
                        ) from exc

                # Rule 1 -- never retry a 4xx.
                elif code is not None and 400 <= code < 500:
                    _log(f"non-retryable HTTP {code} for {tab}: {str(exc)[:160]}")
                    raise

                elif not _is_retryable(exc):
                    _log(f"non-retryable error for {tab}: {str(exc)[:160]}")
                    raise

                if attempt > len(BACKOFF_SECONDS):
                    break
                delay = BACKOFF_SECONDS[attempt - 1]
                _log(f"attempt {attempt} failed for {tab}, retrying in {delay}s: {str(exc)[:140]}")
                time.sleep(delay)

        raise RuntimeError(f"Sheets write failed after retry: {last_error}")

    return guarded_append
