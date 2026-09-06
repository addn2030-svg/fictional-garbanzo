# -*- coding: utf-8 -*-
"""Sheets write guard — WO-5 idempotency and error-class-aware retry.

Replaces the blanket `except Exception: retry 4x` wrapper that caused E4
(duplicate rows) and E5 (a 404 retried four times).

Rules enforced here:
  1. Never retry a 4xx. A 4xx is a contract error, not a transient fault.
  2. A timeout means UNKNOWN, not FAILED. Re-read the target to find out
     whether the write landed, then act on the answer.
  3. Before appending, check the natural key. If the row already exists,
     treat it as success and log `duplicate suppressed`.
  4. Retry only 5xx and connection errors, with bounded backoff.

Import and install from telegram_webhook.py:

    from connectors import sheets_write_guard
    bot._append = sheets_write_guard.install(bot)
"""
from __future__ import annotations

import os
import socket
import time
import urllib.error

# ---------------------------------------------------------------- configuration

# Column index (0-based) holding the natural key, per tab.
# Intake rows start with Intake_ID; conversation rows start with chat_id,
# so their natural key is the second column.
KEY_COLUMN_BY_TAB = {}

DEFAULT_KEY_COLUMN = 0
BACKOFF_SECONDS = (1, 2, 4)
VERIFY_ENABLED = os.environ.get("SHEETS_GUARD_VERIFY", "1").strip() == "1"
DEDUPE_ENABLED = os.environ.get("SHEETS_GUARD_DEDUPE", "1").strip() == "1"


def _log(message: str):
    print(f"[sheets_guard] {message}", flush=True)


# ---------------------------------------------------------------- error classes

def _status_code(exc: Exception):
    """Return an HTTP status code when the exception carries one."""
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code
    # googleapiclient HttpError carries resp.status
    resp = getattr(exc, "resp", None)
    status = getattr(resp, "status", None)
    if isinstance(status, int):
        return status
    try:
        status = int(status)
        return status
    except (TypeError, ValueError):
        return None


def _is_timeout(exc: Exception) -> bool:
    if isinstance(exc, socket.timeout):
        return True
    if isinstance(exc, TimeoutError):
        return True
    if isinstance(exc, urllib.error.URLError):
        return isinstance(getattr(exc, "reason", None), (socket.timeout, TimeoutError))
    return "timed out" in str(exc).lower()


def _is_retryable(exc: Exception) -> bool:
    """5xx and connection-level faults only. Never 4xx."""
    code = _status_code(exc)
    if code is not None:
        return 500 <= code < 600
    if isinstance(exc, urllib.error.URLError):
        return True
    if isinstance(exc, (ConnectionError, socket.gaierror)):
        return True
    return False


# ---------------------------------------------------------------- key lookup

def _key_of(tab: str, row: list):
    if not row:
        return None
    index = KEY_COLUMN_BY_TAB.get(tab, DEFAULT_KEY_COLUMN)
    if index >= len(row):
        return None
    value = row[index]
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _key_exists(tab: str, key: str) -> bool | None:
    """True / False if determinable, None if the check itself failed.

    None is important: an unverifiable check must not be read as 'absent'.
    """
    if not key:
        return None
    try:
        from connectors import sheet_intelligence as si

        if not si.configured():
            return None
        results = si.search(key, max_results=10)
        rows = results.get("results", results) if isinstance(results, dict) else results
        for entry in rows or []:
            if not isinstance(entry, dict):
                continue
            if entry.get("sheet") and entry.get("sheet") != tab:
                continue
            values = [str(v).strip() for v in (entry.get("values") or [])]
            if key in values:
                return True
        return False
    except Exception as exc:  # noqa: BLE001 - verification must never raise
        _log(f"verify failed for {key}: {str(exc)[:150]}")
        return None


# ---------------------------------------------------------------- guarded write

def install(bot):
    """Wrap bot._append. Returns the guarded callable."""
    raw_append = bot._append

    KEY_COLUMN_BY_TAB.setdefault(getattr(bot, "INTAKE_TAB", "مدخلات الوكيل"), 0)
    KEY_COLUMN_BY_TAB.setdefault(getattr(bot, "CONVERSATION_TAB", "محادثات الوكيل"), 1)
    KEY_COLUMN_BY_TAB.setdefault(getattr(bot, "STATUS_TAB", "حالة الوكيل"), 0)

    def guarded_append(tab: str, row: list):
        key = _key_of(tab, row)

        # Rule 3 — pre-write duplicate check.
        if DEDUPE_ENABLED and key:
            if _key_exists(tab, key) is True:
                _log(f"duplicate suppressed: {tab} key={key}")
                return

        last_error = None
        for attempt in range(1, len(BACKOFF_SECONDS) + 2):
            try:
                return raw_append(tab, row)

            except Exception as exc:  # noqa: BLE001 - connector boundary
                last_error = exc
                code = _status_code(exc)

                # Rule 2 — timeout means UNKNOWN. Verify before deciding.
                if _is_timeout(exc):
                    if VERIFY_ENABLED and key:
                        landed = _key_exists(tab, key)
                        if landed is True:
                            _log(f"timeout but write landed: {tab} key={key}")
                            return
                        if landed is False:
                            _log(f"timeout and write absent, retrying: {tab} key={key}")
                        else:
                            _log(
                                f"timeout and verification unavailable, NOT retrying: "
                                f"{tab} key={key}"
                            )
                            raise RuntimeError(
                                f"Sheets write outcome unknown for {tab} key={key}: {exc}"
                            ) from exc
                    else:
                        raise RuntimeError(
                            f"Sheets write timed out and cannot be verified for {tab}: {exc}"
                        ) from exc

                # Rule 1 — never retry a 4xx.
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
