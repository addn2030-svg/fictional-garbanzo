# Step-by-step: applying this yourself

Target repo: **`addn2030-svg/personal-ai-agent`**
Time: ~15 minutes. No terminal needed — all of it is the GitHub website.

---

## Before you start — three things that matter

**1. Order is not optional.** Create the two new files *first*. Step 4 adds
`from connectors import sheets_write_guard`. If that import runs before the file
exists, the app crashes on boot and Railway loops. Files first, edits second.

**2. Every commit triggers a Railway deploy.** You will make 4 commits, so 4
deploys. That is fine — Steps 1 and 2 add files nothing imports yet, so those two
deploys change no behaviour. Step 3 leaves the app working (just with no retry).
Only Step 4 switches the guard on.

**3. Know your rollback before you need it.** Railway → Deployments → find the
last deploy before today → **Redeploy**. That is your undo. It takes ~60 seconds.

---

## Copy sources

Open these two in a browser tab. Click **Raw**, then Ctrl+A / Ctrl+C.

- Guard: https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/connectors/sheets_write_guard.py
- Evidence: https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/connectors/state_evidence.py

---

## STEP 1 — create `connectors/sheets_write_guard.py`

1. Go to https://github.com/addn2030-svg/personal-ai-agent
2. **Add file** (button, top right) → **Create new file**
3. In the filename box type exactly:
   ```
   connectors/sheets_write_guard.py
   ```
   Typing the `/` turns `connectors` into a folder. It should already exist, and
   GitHub will show you are inside it.
4. Paste the full guard file into the editor.
5. Scroll down → commit message: `Add Sheets write guard (WO-5)`
6. Leave **Commit directly to the main branch** selected → **Commit new file**

✅ Check: the file appears at `connectors/sheets_write_guard.py` and is about
300 lines.

---

## STEP 2 — create `connectors/state_evidence.py`

Same again:

1. **Add file** → **Create new file**
2. Filename:
   ```
   connectors/state_evidence.py
   ```
3. Paste the evidence file.
4. Commit message: `Add state startup evidence (WO-2)` → **Commit new file**

✅ Check: both new files now sit in `connectors/`.

> Nothing has changed in how the app behaves yet. Two deploys will have run. If
> either failed, stop and read the log — a failure here means a paste problem
> (truncated file, or the editor mangled the indentation), not a logic problem.

---

## STEP 3 — edit `connectors/telegram_webhook.py`

Open https://github.com/addn2030-svg/personal-ai-agent/blob/main/connectors/telegram_webhook.py
and click the **pencil** icon.

### 3a. Delete the old retry wrapper

Find this block — it starts at **line 61**, just under
`install_mobile_calendar_confirm(bot)`:

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

**Select all of it — from the `#` comment down to and including
`bot._append = _append_with_retry` — and delete it.**

Leave exactly **two blank lines** between `install_mobile_calendar_confirm(bot)`
and the next line, `def _clinical_minimize(text: str):`.

> Do **not** put the guard here. This is the file the original plan pointed at,
> and it is the wrong one — see the note at the end of Step 4.

### 3b. Add the startup evidence line

Still in the same file, scroll to the `def run():` function near the bottom
(around line 305). Find:

```python
    manager_fast_canary.start_if_enabled()
```

Insert **two lines directly above it**, indented with **4 spaces**:

```python
    from connectors import state_evidence
    state_evidence.report()
```

The result should read:

```python
    _start_calendar_alert_worker()
    print(
        f"Calendar reminder worker active: heartbeat={CALENDAR_ALERT_LOOP_SECONDS}s",
        flush=True,
    )
    from connectors import state_evidence
    state_evidence.report()
    manager_fast_canary.start_if_enabled()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
```

Commit message: `Remove blanket retry wrapper; print state evidence at boot`
→ **Commit changes**

✅ Check: the app still boots. It now has *no* Sheets retry at all, which is
safe for a few minutes.

> Optional tidy-up: `time.sleep` on old line 69 was the only use of `time` in
> this file, so `import time` at line 20 is now unused. Harmless — remove it only
> if you run a linter.

---

## STEP 4 — edit `connectors/telegram_webhook_runtime.py`

**This is the step the original plan left out, and the one that makes the fix
real.** `Dockerfile` runs *this* file, not `telegram_webhook.py`.

Open https://github.com/addn2030-svg/personal-ai-agent/blob/main/connectors/telegram_webhook_runtime.py
and click the **pencil**.

### 4a. Add the import

Find line 19:

```python
from connectors import google_credentials
```

Add directly below it:

```python
from connectors import sheets_write_guard
```

### 4b. Replace `_append_direct_first`

Find this block — it starts at **line 57** and ends at **line 84**:

```python
def _append_direct_first(tab: str, row: list):
    direct_error = None
    if _direct_ready():
        for attempt, delay in enumerate((0, 1, 2), start=1):
            if delay:
                time.sleep(delay)
            try:
                _direct_append(tab, row)
                return
            except Exception as exc:  # connector boundary
                direct_error = exc
                print(
                    f"Sheets direct write attempt {attempt}/3 failed for {tab}: {str(exc)[:180]}",
                    flush=True,
                )

    try:
        return _fallback_append(tab, row)
    except Exception as fallback_error:
        if direct_error is not None:
            raise RuntimeError(
                "Google Sheets direct write failed; Apps Script fallback also failed: "
                + str(fallback_error)[:220]
            ) from fallback_error
        raise


bot._append = _append_direct_first
```

**Replace the whole thing** (function *and* the `bot._append = ...` line at the
bottom) with:

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

What changed: the `for attempt, delay in enumerate((0, 1, 2), start=1)` loop is
gone, and the last line now wraps the function in the guard.

Commit message: `Install Sheets write guard at the production entrypoint`
→ **Commit changes**

> Why here: this module imports `telegram_webhook` and then **reassigns
> `bot._append` again**. Anything installed in `telegram_webhook.py` gets wrapped
> by this one and only protects the Apps Script fallback. The direct Sheets path
> — what production actually uses — would stay unguarded.

---

## STEP 4.5 — tests (optional, recommended)

Two test files, written in `unittest` style to match the repo. 35 tests covering
the retry rules, the timeout paths, the key-column mapping, and the durability
logic.

1. **Add file** → **Create new file** → `tests/test_sheets_write_guard.py` → paste
   from https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/tests/test_sheets_write_guard.py
2. **Add file** → **Create new file** → `tests/test_state_evidence.py` → paste
   from https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/tests/test_state_evidence.py

Then wire them into CI, or they will never run. Edit
`.github/workflows/production-model-router.yml`, find the `python -m unittest`
list (around line 79), and add two lines at the end of it:

```yaml
          tests.test_state_evidence
          tests.test_sheets_write_guard
```

Match the existing indentation exactly — YAML is strict about it.

✅ Check: the Actions tab shows the workflow running 183 tests instead of 148.

---

## STEP 5 — Railway variables


Railway → your service → **Variables**.

### 5a. Check the volume mount path first

Railway → **Volumes**. Note the mount path. It is usually `/data`.

### 5b. Set the state directory

Add:

```
AI_OS_DATA_DIR = /data
```

Use whatever your mount path actually is. **This one matters more than it looks.**
`engine/store.py` line 25 reads:

```python
DATA_DIR = os.environ.get("AI_OS_DATA_DIR", os.path.join(BASE, "data"))
```

Mounting a volume does **not** redirect that. Without this variable the app
writes to `/app/data` inside the container — which exists, and is writable, and
is destroyed on every deploy. That is the silent failure WO-2 was written to find.

### 5c. Optional, leave alone for now

| Variable | Set it to | When |
| --- | --- | --- |
| `SHEETS_GUARD_VERIFY` | `0` | Emergency only — disables timeout verification |
| `SHEETS_GUARD_DEDUPE` | `1` | If you want a remote duplicate check before every write. Costs one Sheets read per append. Off by default on purpose. |
| `AI_OS_REQUIRE_DURABLE_STATE` | `1` | Once state is confirmed durable, makes a misconfigured volume a hard boot failure instead of a warning |

---

## STEP 6 — read the deploy log

Railway → **Deployments** → newest → **View Logs**. You want three lines:

```
Sheets production route: direct-first | service_account=env valid=True
[sheets_guard] installed: verify=on dedupe=off keys={'مدخلات الوكيل': 0, 'محادثات الوكيل': 1, 'حالة الوكيل': None}
state: dir=/data exists=True version=N writable=True backups=5 audit=NNN
```

Reading the third line: `dir` must be your volume mount path. `writable=True`.
`version` is a number — on a first boot with no state yet you will see
`exists=False version=None`, which is normal.

---

## STEP 7 — the WO-2 acceptance test

This is the whole point. Do it deliberately.

1. Note the `version=N` in the log. Say it says `version=12`.
2. Send your bot a Telegram message. Wait for a reply.
3. Railway → **Redeploy** (no code change needed).
4. Read the new `state:` line.

| Result | Meaning |
| --- | --- |
| `version=13` or higher | ✅ **State is durable.** The volume question is closed. |
| `version=12` again | State is saved but the message did not mutate it — send a message that creates a task, then retry |
| `version=0` or `exists=False` | ❌ State was wiped. `AI_OS_DATA_DIR` does not match the mount. Recheck Step 5. |

If you instead see this warning, the answer is in the message itself:

```
state: WARNING — volume is mounted at /data but state lives in /app/data.
Writes succeed and are wiped on every deploy. Set AI_OS_DATA_DIR=/data
```

---

## STEP 8 — only after Step 7 passes

Railway → Variables → `MANAGER_FAST_CANARY_ENABLED = 1`

Watch the first hour. `[sheets_guard]` lines in the log tell you what the guard
decided and why.

---

## What the new log lines mean

| Line | Meaning | Action |
| --- | --- | --- |
| `duplicate suppressed (in-process)` | Same key written twice by this process. Working as designed. | None |
| `timeout but write landed` | A timeout that the old code would have turned into a duplicate row. | None — this is the E4 fix earning its keep |
| `timeout and write absent, retrying` | Verified the row is missing, so retrying is safe | None |
| `timeout unverifiable, NOT retrying` | Could not check, so refused to guess | Investigate if frequent — the verification client may be misconfigured |
| `non-retryable HTTP 404` | A contract error. Wrong tab name or sheet ID. | Fix the config — retrying never helped |
| `attempt N failed … retrying` | A real 5xx or connection fault | None unless it repeats |

---

## Expect more visible errors

That is the trade, and it is deliberate. The old code hid failures by retrying
blindly and writing duplicates. The guard raises instead. A row that used to
appear three times now either appears once or raises an error you can see.

If it becomes too loud, `SHEETS_GUARD_VERIFY=0` restores the permissive
behaviour without a code change — but you get duplicates back with it.

---

## If something breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| Boot loop, `ModuleNotFoundError: sheets_write_guard` | Step 4 committed before Step 1 | Create the file, or revert the Step 4 commit |
| Boot loop, `IndentationError` | The web editor mixed tabs and spaces | Re-edit; use 4 spaces |
| `ImportError: cannot import name 'store'` | `engine/` missing from `sys.path` | Should not happen — `telegram_webhook.py` lines 25–27 add it. Report it. |
| Sheets writes all fail with "outcome unknown" | Verification client cannot reach Sheets | Check `GOOGLE_SERVICE_ACCOUNT_JSON`; `SHEETS_GUARD_VERIFY=0` as a stopgap |
| Everything is worse | — | Railway → Deployments → last good one → **Redeploy** |

---

## Faster alternative: one commit instead of four

If you are comfortable with VS Code: open the repo and press the **`.`** key.
That launches github.dev, a full editor in the browser. Make all four changes
across the files, then use the Source Control panel on the left to commit
everything **once**. One deploy, no ordering hazard at all.

Same edits, same result — just one deploy instead of four.
