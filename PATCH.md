# PATCH — `connectors/telegram_webhook.py`

The two new modules (`connectors/sheets_write_guard.py`, `connectors/state_evidence.py`)
are self-contained and land as new files. The third edit is a modification to
`connectors/telegram_webhook.py`, which **does not exist in this repository** —
apply it in the repo that actually holds the bot (GitHub web editor → pencil icon).

---

## Edit 1 — replace the blanket retry wrapper

**Delete** the block starting at `_raw_append = bot._append` and ending at
`bot._append = _append_with_retry` (roughly lines 62–78), i.e. the old
`except Exception: retry 4x` wrapper.

**Replace it with:**

```python
from connectors import sheets_write_guard
bot._append = sheets_write_guard.install(bot)
```

Match the indentation of the code you deleted (module level = column 0).

---

## Edit 2 — print the state evidence line at startup

Find `manager_fast_canary.start_if_enabled()` (around line 314) and insert
**directly above it**:

```python
    from connectors import state_evidence
    state_evidence.report()
```

Four spaces of indentation — this sits inside a function.

---

## Expected boot log

```
state: dir=/data exists=True version=N writable=True backups=5 audit=NNN
```

**WO-2 acceptance test:** send a Telegram message, then redeploy. If `version`
increments rather than resetting to 0, state is durable and the volume question
is closed.

---

## Behaviour change (intentional)

The guard is stricter than the code it replaces:

| Case | Old | New |
| --- | --- | --- |
| 4xx (e.g. 404) | retried 4× | raised immediately, no retry |
| Timeout | retried blindly → duplicate rows | re-read the natural key; retry only if the write is confirmed absent, raise if unverifiable |
| Duplicate natural key | appended again | suppressed, logged `duplicate suppressed` |
| 5xx / connection error | retried | retried, bounded backoff 1s → 2s → 4s (4 attempts total) |

Expect a few more *visible* errors. Silent duplicates became loud failures — that
is the trade.

## Kill switches (Railway variables, no code redeploy)

- `SHEETS_GUARD_DEDUPE=0` — disable the pre-write duplicate check
- `SHEETS_GUARD_VERIFY=0` — disable post-timeout verification
- `AI_OS_REQUIRE_DURABLE_STATE=1` — crash at boot instead of degrading when the
  state directory is not writable

## Dependencies assumed by the new modules

`state_evidence` imports `engine.store` and reads `DATA_DIR`, `STATE_PATH`,
`AUDIT_PATH`, `BACKUP_DIR`, `SECTIONS`.
`sheets_write_guard` lazily imports `connectors.sheet_intelligence` and calls
`configured()` and `search(key, max_results=...)`; if that module is missing or
unconfigured, verification returns "unknown" and the guard fails closed rather
than writing blindly.

## Last step

Once the startup line appears and looks right, set `MANAGER_FAST_CANARY_ENABLED=1`.
