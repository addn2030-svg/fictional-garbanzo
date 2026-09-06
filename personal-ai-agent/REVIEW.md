# Code review — the two files as originally written

Read against `addn2030-svg/personal-ai-agent` (fetched 2026-09-06), not assumed.
Corrected versions are in `connectors/`; the paste-in guide is `PATCH.md`.

## Verdict

`state_evidence.py` was nearly right — every `engine.store` attribute it touches
exists. One defect, in the flag that WO-2 is actually about.

`sheets_write_guard.py` was well-shaped but installed at the wrong layer and
relying on a verification primitive that cannot do what it was asked to do. As
written it would have **recreated E4 while reporting confidence.**

---

## What checked out

| Assumption | Reality |
| --- | --- |
| `telegram_webhook.py` lines 62–78 are the retry wrapper | correct, exactly |
| `manager_fast_canary.start_if_enabled()` at line 314 | correct, inside `run()` |
| `store.DATA_DIR/STATE_PATH/AUDIT_PATH/BACKUP_DIR/SECTIONS` | all exist (store.py 25–31) |
| `meta.version` increments per commit | correct (store.py 200–202) |
| backups named `state-*.json`, last 5 kept | correct (store.py 233, 239) |
| intake natural key = column 0 | correct — `[iid, ts, "TELEGRAM", chat_id, …]` |
| conversation natural key = column 1 | correct — `[cid, iid, ts, …]` |
| `sheet_intelligence.configured()` exists | correct |
| `search()` may return a list | correct — it returns a list, and the code handled both |
| `bot.INTAKE_TAB` etc. resolvable | correct — `telegram_bot` swaps itself for `telegram_bot_legacy` via `sys.modules`, which defines all three, env-overridable |

---

## D1 — Guard installed on the wrong layer (blocker)

`Dockerfile` line 13 runs `connectors/telegram_webhook_runtime.py`, not
`telegram_webhook.py`. The runtime imports the webhook module, captures the
result as `_fallback_append`, and **reassigns `bot._append` again** (line 84) to
`_append_direct_first` — which carries its own blanket
`for attempt, delay in enumerate((0, 1, 2))` retry over the direct Sheets API.

Final production chain:

```
_append_direct_first          <- outermost, blanket retry x3, unguarded
  └── direct Sheets API
  └── _fallback_append        <- where the patch would have put the guard
        └── legacy _append    <- Apps Script
```

So the guard would protect the Apps Script fallback while the direct path — the
one production actually uses — kept retrying 404s three times and duplicating on
timeout. A single logical write could attempt 3 direct + 4 fallback = 7 writes
across two backends.

**Fixed by** installing at the outermost layer and stripping the runtime's inner
retry loop (PATCH.md Step 4).

## D2 — Verification cannot prove absence (blocker)

`_key_exists` used `sheet_intelligence.search()`. That calls `snapshot(150, 20)`,
which reads `A1:T150` — the **first 150 rows from the top** of at most 18 tabs.
Appends land at the bottom.

For any tab past 150 rows — which intake and conversation logs reach quickly — a
freshly written row is invisible, so `search` returns `[]` and the original code
returned `False`, meaning *"absent, safe to retry."*

Reproduced, write landed at row 380, ack timed out:

```
ORIGINAL: [sheets_guard] timeout and write absent, retrying   x4
          rows written to the sheet: 4   -> 3 duplicates
CORRECTED: [sheets_guard] timeout but write landed
          rows written to the sheet: 1
```

E4 recreated by the code written to prevent it, and worse than the old blanket
retry because the log claims verification succeeded.

**Fixed by** verifying with a targeted read of the key column only
(`'tab'!A:A`) — one cheap call, correct at any row count — and demoting the
`search` fallback so it can return `True` or `None` but **never** `False`.

## D3 — Status rows keyed on a timestamp (data loss)

`KEY_COLUMN_BY_TAB[STATUS_TAB] = 0`, but a status row is
`[_now(), component, status, …]` (telegram_bot_legacy 275–282). Column 0 is a
timestamp, not an identifier. Two status events in the same second → the second
one silently suppressed as a duplicate.

**Fixed by** mapping the status tab to `None` — written without dedupe.

## D4 — Pre-write dedupe on the hot path (cost)

Dedupe defaulted on, and each check ran a full `snapshot()` across up to 18 tabs.
Every intake and conversation write — 2+ per Telegram message — would have
triggered a full-workbook read. Seconds of added latency and a fast route to the
Sheets read quota.

**Fixed by** a free in-process written-key cache (always on, catches the
retry-storm duplicates that caused E4) plus an opt-in remote check
(`SHEETS_GUARD_DEDUPE=1`) that now costs one column read rather than a workbook
scan.

## D5 — Status code hidden by exception wrapping

The runtime wraps failures as `RuntimeError(...) from fallback_error`.
`_status_code` inspected only the outer exception, so a wrapped 404 read as
"no code" → treated as unknown, and a wrapped 503 as non-retryable.

**Fixed by** walking the `__cause__` / `__context__` chain in all three
classifiers. Verified: wrapped 404 → 1 attempt, wrapped 503 → 4 attempts,
wrapped timeout → no blind retry.

## D6 — `durable` was a false positive (WO-2's own acceptance flag)

```python
"durable": bool(os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")),
```

`store.DATA_DIR` is `AI_OS_DATA_DIR or <repo>/data`. A Railway volume at `/data`
does **not** redirect it. And `data/` is committed to the repo
(`data/master-sheet.xlsx`), so `<repo>/data` exists in the image and is writable.

Mount the volume, forget `AI_OS_DATA_DIR`, and the original prints
`writable=True` with `durable=True` while every state change is wiped on the next
deploy — the precise failure WO-2 exists to detect, reported as a pass.

**Fixed by** testing whether `DATA_DIR` actually lives under the mount, and
naming the remedy in the warning. Verified against the real `engine.store`:

```
A (AI_OS_DATA_DIR == mount): durable True,  no warning
B (mount /data, state /tmp/…): durable False,
  "volume is mounted at /data but state lives in /tmp/… Set AI_OS_DATA_DIR=/data"
```

## D7 — `_under` and the filesystem root (found by GitHub Copilot review)

```python
return path == parent or path.startswith(parent + os.sep)
```

When `parent` is `/`, `parent + os.sep` is `//`, and no path starts with that —
so `_under("/data", "/")` returned `False`. Copilot's report was correct and its
suggested fix (`os.path.commonpath`) is the right one; applied verbatim.

Practical impact here is low, because Railway will not let you mount a volume at
`/`. But commonpath is strictly better anyway: it normalises trailing slashes and
`..` segments, and still rejects sibling prefixes such as `/database` vs `/data`.
Verified across 9 cases — the old implementation was wrong in 1, the new one in 0.

Copilot's two secondary suggestions were also taken: `_writable` now removes its
probe file in a `finally` block, and `snapshot`/`report` are annotated
`dict[str, Any]`.

One suggestion was **declined**: narrowing `except Exception` in `snapshot()`.
This runs at boot, before the HTTP server starts, and its job is to describe a
possibly-broken state file. An unexpected exception type there would crash the
container instead of printing `version=-1`. Breadth is the point.

One was **corrected**: Copilot proposed a pytest file. This repo uses `unittest`,
and `.github/workflows/production-model-router.yml` runs an explicit module list
— a pytest file would never have executed in CI. Tests are written as `unittest`
and the workflow list needs the two new entries (PATCH.md Step 5).

---

## Test evidence


Run against the real `engine.store` and the real `sheet_intelligence`, with the
Sheets client faked at the transport boundary.

| Scenario | Result |
| --- | --- |
| 404 | 1 attempt, raised |
| 404 wrapped in RuntimeError | 1 attempt, raised |
| 503 | 4 attempts, backoff 1/2/4s |
| 503 wrapped | 4 attempts |
| timeout, write landed at row 380 | 1 write, returns success |
| timeout, key genuinely absent | retries, then fails |
| timeout, verification unavailable | 1 attempt, raises — no blind retry |
| re-append of a key already written | 0 API calls |
| two status rows, same timestamp | both written |
| success | return value passed through |

Not covered: live Google API behaviour. `googleapiclient` is not installed in this
sandbox, so the direct client is exercised through a fake — the transport is
faked, the guard logic is real.
