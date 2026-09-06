# PATCH — `addn2030-svg/personal-ai-agent`

Two new files + three edits. I cannot push or fork that repo (my GitHub token has
`push: false` on it, and `POST /forks` returns 403), so these are paste-through
the GitHub web editor.

Verified against commit fetched 2026-09-06. Line numbers below are from that commit.

---

## Step 1 — new file `connectors/sheets_write_guard.py`

Paste `connectors/sheets_write_guard.py` from this folder. Commit.

## Step 2 — new file `connectors/state_evidence.py`

Paste `connectors/state_evidence.py` from this folder. Commit.

---

## Step 3 — `connectors/telegram_webhook.py`

### 3a. Delete the old retry wrapper — lines 61–78

Remove this whole block:

```python
# Keep the original write implementation, then add bounded retry around it.
_raw_append = bot._append


def _append_with_retry(tab: str, row: list):
    last = None
    for attempt, delay in enumerate((0, 1, 2, 4), start=1):
        if delay:
            time.sleep(delay)
        try:
            return _raw_append(tab, row)
        except Exception as exc:  # noqa: BLE001 - intentional connector boundary
            last = exc
            print(f"Sheets write attempt {attempt}/4 failed for {tab}: {str(exc)[:180]}", flush=True)
    raise RuntimeError(f"Sheets write failed after retry: {last}")


bot._append = _append_with_retry
```

Replace it with **nothing**. The guard is installed in `telegram_webhook_runtime.py`
instead — see Step 4 and the note below.

> `time.sleep` on line 69 is the only use of `time` in this file. After deleting the
> block, `import time` on line 20 is unused. Harmless at runtime; remove it if the
> linter is enforced.

### 3b. Startup evidence — above line 314

In `run()`, find `manager_fast_canary.start_if_enabled()` and insert directly above it:

```python
    from connectors import state_evidence
    state_evidence.report()
```

Four spaces — it is inside `run()`.

---

## Step 4 — `connectors/telegram_webhook_runtime.py`  ← the step the original plan missed

`Dockerfile` line 13 is:

```
CMD ["python3", "-u", "connectors/telegram_webhook_runtime.py"]
```

This module imports `telegram_webhook` and then **reassigns `bot._append` again**
at line 84. Installing the guard only in `telegram_webhook.py` leaves the
production direct-write path completely unguarded.

### 4a. Add the import

Next to the existing imports near line 19:

```python
from connectors import sheets_write_guard
```

### 4b. Replace `_append_direct_first` (lines 57–84)

Replace the function *and* the assignment that follows it:

```python
def _append_direct_first(tab: str, row: list):
    """One attempt per route. Retry policy belongs to sheets_write_guard."""
    direct_error = None
    if _direct_ready():
        try:
            return _direct_append(tab, row)
        except Exception as exc:  # connector boundary
            direct_error = exc
            print(f"Sheets direct write failed for {tab}: {str(exc)[:180]}", flush=True)

    try:
        return _fallback_append(tab, row)
    except Exception as fallback_error:
        if direct_error is not None:
            raise RuntimeError(
                "Google Sheets direct write failed; Apps Script fallback also failed: "
                + str(fallback_error)[:220]
            ) from fallback_error
        raise


bot._append = sheets_write_guard.install(bot, _append_direct_first)
```

The inner `for attempt, delay in enumerate((0, 1, 2), start=1)` loop is gone. That
loop was the real source of E4 and E5 in production: three blanket retries on the
direct Sheets API, under `except Exception`, with no idempotency.

Commit. Railway redeploys on push.

---

## Step 5 — tests and CI (optional, recommended)

Create `tests/test_state_evidence.py` and `tests/test_sheets_write_guard.py` from
this folder's `tests/`. They are `unittest`, matching the repo — not pytest.

Then add them to the runner in `.github/workflows/production-model-router.yml`,
at the end of the `python -m unittest` module list (~line 79):

```yaml
          tests.test_state_evidence
          tests.test_sheets_write_guard
```

Without this the files exist but never execute: that workflow enumerates modules
explicitly rather than discovering them.

Verified locally: 183 tests pass — 148 existing plus 35 new.

---

## What you should see at boot


```
Sheets production route: direct-first | service_account=... valid=True
[sheets_guard] installed: verify=on dedupe=off keys={'مدخلات الوكيل': 0, 'محادثات الوكيل': 1, 'حالة الوكيل': None}
state: dir=/data exists=True version=N writable=True backups=5 audit=NNN
```

**WO-2 acceptance:** send a Telegram message, then redeploy. `version` must increment,
not reset.

If instead you see:

```
state: WARNING — volume is mounted at /data but state lives in /app/data. …
```

then the volume is attached but `engine.store` is not using it. `store.DATA_DIR` is
`AI_OS_DATA_DIR or <repo>/data` — a Railway mount does **not** redirect it, and
`/app/data` exists in the image (`data/master-sheet.xlsx` is committed), so writes
succeed and vanish on deploy. Fix: set `AI_OS_DATA_DIR=/data`.

---

## Environment variables

| Variable | Default | Effect |
| --- | --- | --- |
| `SHEETS_GUARD_VERIFY` | `1` | Post-timeout verification. The rule that prevents E4. |
| `SHEETS_GUARD_DEDUPE` | `0` | Pre-write remote duplicate check. Off by default — one Sheets read per append on the hot path. |
| `SHEETS_GUARD_RECENT_MAX` | `2000` | In-process written-key cache size. Always on, free. |
| `AI_OS_DATA_DIR` | `<repo>/data` | Point at the volume mount. |
| `AI_OS_REQUIRE_DURABLE_STATE` | unset | `1` = refuse to boot when state is not writable or not on the volume. |

## Behaviour changes

| Case | Before | After |
| --- | --- | --- |
| 4xx (E5) | direct 3× + fallback 4× = up to 7 attempts | raised on the first response |
| Timeout (E4) | retried blindly → duplicate rows | key re-read; retry only if confirmed absent, raise if unverifiable |
| Re-append of a key this process already wrote | duplicate row | suppressed, no API call |
| 5xx / connection | retried across two backends | 4 attempts, backoff 1s → 2s → 4s |
| Status rows | n/a | no natural key, so never deduped |

Expect more *visible* errors. Silent duplicates became loud failures — that is the trade.

## Last step

Once the startup line looks right, set `MANAGER_FAST_CANARY_ENABLED=1`.
