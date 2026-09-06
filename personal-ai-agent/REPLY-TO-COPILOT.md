# Reply to Copilot — complete the branch

## Verified state of `fix/state-evidence-commonpath` (sha 8c71bb9)

I was wrong in my previous message when I said no branch existed — GitHub's API
paginates at 30 and the repo has 74 branches, so `fix/*` fell off page one. The
branch is real. Apologies.

What is on it, checked against the live branch:

| | |
| --- | --- |
| `connectors/state_evidence.py` | ✅ functionally **identical** to the verified file — only comment wording differs, plus a harmless `os.path.exists(probe)` guard. My 17 tests pass against Copilot's copy unchanged. |
| `tests/test_state_evidence.py` | ✅ 8 tests, all pass |
| `STEPS.md` (repo root) | ❌ malformed — see below |

## Problem 1 — the branch changes no behaviour

```
$ grep -rn "state_evidence" --include=*.py .   # excluding the module itself
>>> nothing
```

Nothing imports it. `report()` is never called, so merging this branch produces
**no boot line and no WO-2 acceptance test**. The file is correct and inert.

## Problem 2 — the WO-5 work is absent entirely

Still on the branch, unchanged from `main`:

```
connectors/telegram_webhook.py:65   def _append_with_retry(...)
connectors/telegram_webhook.py:67       for attempt, delay in enumerate((0, 1, 2, 4), start=1):
connectors/telegram_webhook_runtime.py:60   for attempt, delay in enumerate((0, 1, 2), start=1):
```

Both blanket retry loops are intact, so E4 (duplicate rows) and E5 (404 retried
repeatedly) are both still live. `connectors/sheets_write_guard.py` and
`tests/test_sheets_write_guard.py` are not on the branch at all.

## Problem 3 — the CI note was not applied, and `STEPS.md` is malformed

```
$ grep -c test_state_evidence .github/workflows/production-model-router.yml
0
```

The workflow was not touched. Instead a new `STEPS.md` was created at the repo
root containing a diff fragment rather than a document:

```
@@
 Step 4
   - Run the unit test suite.

+Step 4.5
+  - Ensure the new state evidence test module is included in the CI enumerated test list:
+    - tests.test_state_evidence
+
Step 5
  - ...
```

That is patch text committed as a file. It should not be merged.

---

## Paste this to Copilot

```
Do not open the PR yet — the branch is about a quarter of the change and would
merge as a no-op. Please extend fix/state-evidence-commonpath with the rest.

Keep connectors/state_evidence.py exactly as it is. It is correct.

1. DELETE the STEPS.md you added at the repo root. It contains a diff fragment
   ("@@", "+Step 4.5", "Step 5\n  - ...") rather than a document, and no STEPS.md
   existed in this repo before.

2. ADD connectors/sheets_write_guard.py, byte for byte from:
   https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/connectors/sheets_write_guard.py

3. ADD tests/test_sheets_write_guard.py, byte for byte from:
   https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/tests/test_sheets_write_guard.py

4. EDIT connectors/telegram_webhook.py:
   (a) Delete the block from the comment
       "# Keep the original write implementation, then add bounded retry around it."
       through and including "bot._append = _append_with_retry" — that is the
       _raw_append assignment and the whole _append_with_retry function. Leave
       exactly two blank lines in its place.
   (b) In def run(), directly above "manager_fast_canary.start_if_enabled()",
       insert these two lines indented by 4 spaces:
           from connectors import state_evidence
           state_evidence.report()

5. EDIT connectors/telegram_webhook_runtime.py:
   (a) After "from connectors import google_credentials" add:
       from connectors import sheets_write_guard
   (b) In _append_direct_first, delete the
       "for attempt, delay in enumerate((0, 1, 2), start=1):" loop and its body,
       replacing it with a single attempt:

         if _direct_ready():
             try:
                 return _direct_append(tab, row)
             except Exception as exc:  # connector boundary
                 direct_error = exc
                 print(f"Sheets direct write failed for {tab}: {str(exc)[:180]}", flush=True)

       Leave the Apps Script fallback block below unchanged.
   (c) Change the final line of that section from
         bot._append = _append_direct_first
       to
         bot._append = sheets_write_guard.install(bot, _append_direct_first)

6. EDIT .github/workflows/production-model-router.yml. In the "python -m unittest"
   module list (around line 79), append two entries with the same indentation as
   the existing ones:
           tests.test_state_evidence
           tests.test_sheets_write_guard

CONSTRAINTS
- Do not modify any other file.
- Do not rewrite sheets_write_guard.py. In particular do not change
  SHEETS_GUARD_DEDUPE's "0" default, do not change the status tab's key column
  from None to 0, and do not translate or reformat the Arabic tab names.
- The guard MUST be installed in telegram_webhook_runtime.py, not
  telegram_webhook.py. Dockerfile runs the runtime module, and the runtime
  reassigns bot._append after the webhook module executes. Installing it in
  telegram_webhook.py leaves the production direct-write path unguarded.

VERIFY and report:
  python -m unittest tests.test_state_evidence tests.test_sheets_write_guard
  grep -n "_append_with_retry" connectors/telegram_webhook.py           # empty
  grep -n "enumerate((0, 1, 2)" connectors/telegram_webhook_runtime.py  # empty
  grep -n "sheets_write_guard.install" connectors/telegram_webhook_runtime.py  # 1 line
  grep -n "state_evidence.report" connectors/telegram_webhook.py        # 1 line
  ls STEPS.md   # should not exist

Then push to the same branch and open the PR.
```

---

## Review the PR before merging

- [ ] `STEPS.md` is gone from the repo root
- [ ] `sheets_write_guard.install` appears in **`telegram_webhook_runtime.py`**
- [ ] `SHEETS_GUARD_DEDUPE` still defaults to `"0"`
- [ ] Status tab still maps to `None`, not `0`
- [ ] Arabic tab names intact, not `?????`
- [ ] CI run shows 183 tests

## Then, and only then

Railway → Variables → `AI_OS_DATA_DIR=/data` (match your real mount path), then
the version-increment acceptance test in `STEPS.md`, then
`MANAGER_FAST_CANARY_ENABLED=1`. No agent can do those three for you.
