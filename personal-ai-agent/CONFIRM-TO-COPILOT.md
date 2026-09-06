# Confirmation to Copilot — paste this back

## Correction first

**Do not add `REPLY-TO-COPILOT.md` to the branch.** It is an instruction
document for you, not a repository file. Committing it would repeat exactly the
mistake `STEPS.md` made — a working note landing in the product repo. Only two
new files go in, plus the edits.

---

## Paste from here down

```
Confirmed. Two files to copy, four edits, one file to delete. Do not add any
markdown documents to the repo.

RAW URLS — copy byte for byte, do not reformat, do not reorder imports, do not
change default values, do not translate the Arabic tab names.

1) connectors/sheets_write_guard.py   (326 lines, md5 1f7a08189f8cc3aa23142dccdc814e54)
https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/connectors/sheets_write_guard.py

2) tests/test_sheets_write_guard.py   (188 lines, md5 fbc6482254fb628a88ed26bdb507cc41)
https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/49cb795ef0fff097c3ed79ed39c322639cbfcf77/personal-ai-agent/tests/test_sheets_write_guard.py

Repo: addn2030-svg/fictional-garbanzo
Commit: 49cb795ef0fff097c3ed79ed39c322639cbfcf77
Paths: personal-ai-agent/connectors/sheets_write_guard.py
       personal-ai-agent/tests/test_sheets_write_guard.py
Note the source path has a personal-ai-agent/ prefix; the destination in this
repo does NOT. Destinations are connectors/ and tests/.

3) There is no third file. Do NOT add REPLY-TO-COPILOT.md or any other .md.

DELETE: STEPS.md at the repo root (the diff-fragment file). Remove it entirely;
do not replace it.

--------------------------------------------------------------------------
EDIT 1 of 3 — connectors/telegram_webhook.py   TWO changes, both required
--------------------------------------------------------------------------

1a. DELETE the old retry wrapper. It begins at line 61 with the comment
    "# Keep the original write implementation, then add bounded retry around it."
    and ends at line 78 with "bot._append = _append_with_retry". Delete the
    comment, the "_raw_append = bot._append" line, the entire _append_with_retry
    function, and the assignment. Leave exactly two blank lines between
    "install_mobile_calendar_confirm(bot)" and "def _clinical_minimize(text: str):".

    This deletion is NOT optional. telegram_webhook_runtime.py captures
    _fallback_append = bot._append at import time. If the wrapper survives, the
    guard ends up wrapping a fallback path that still retries 4x blindly, and
    the duplicate-row bug survives on that route.

1b. ADD the boot call. In "def run():" near the bottom, directly above the line
    "manager_fast_canary.start_if_enabled()" (line 314 on main), insert two
    lines indented by exactly 4 spaces:

        from connectors import state_evidence
        state_evidence.report()

--------------------------------------------------------------------------
EDIT 2 of 3 — connectors/telegram_webhook_runtime.py
--------------------------------------------------------------------------

Yes, the file path is connectors/telegram_webhook_runtime.py and the function
name is _append_direct_first. Confirmed.

2a. After line 19, "from connectors import google_credentials", add:

        from connectors import sheets_write_guard

2b. Replace lines 57 to 84 — the whole _append_direct_first function AND the
    "bot._append = _append_direct_first" assignment that follows it — with:

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

    The "for attempt, delay in enumerate((0, 1, 2), start=1):" loop and its body
    are gone. The Apps Script fallback block is unchanged. The assignment is at
    module level, not inside a function and not inside run().

--------------------------------------------------------------------------
EDIT 3 of 3 — .github/workflows/production-model-router.yml
--------------------------------------------------------------------------

Yes, please update it. In the job named "test", step "Test production model
routing", there is a "run: >-" block starting "python -m unittest" at about
line 79, followed by one module per line. The list currently ends with
"tests.test_manager_wo8_compat" at about line 100.

Append two lines immediately after it, with the same 10-space indentation as
the existing entries:

          tests.test_state_evidence
          tests.test_sheets_write_guard

Do not touch the "Compile production entrypoints" step below it.

--------------------------------------------------------------------------
CONSTRAINTS
--------------------------------------------------------------------------
- Do not modify connectors/state_evidence.py. It is already correct.
- Do not modify any file not listed above.
- Do not rewrite sheets_write_guard.py. Specifically: SHEETS_GUARD_DEDUPE must
  keep its "0" default, SHEETS_GUARD_VERIFY its "1" default, and the status tab
  must map to None rather than 0 in KEY_COLUMN_BY_TAB.
- The guard is installed in telegram_webhook_runtime.py, never in
  telegram_webhook.py. Dockerfile runs the runtime module, and the runtime
  reassigns bot._append after the webhook module executes.

--------------------------------------------------------------------------
VERIFY, then report each result
--------------------------------------------------------------------------
python -m unittest tests.test_state_evidence tests.test_sheets_write_guard
    -> expect 35 tests, OK

grep -n "_append_with_retry" connectors/telegram_webhook.py
    -> expect no output

grep -n "enumerate((0, 1, 2)" connectors/telegram_webhook_runtime.py
    -> expect no output

grep -n "sheets_write_guard.install" connectors/telegram_webhook_runtime.py
    -> expect exactly one line

grep -n "state_evidence.report" connectors/telegram_webhook.py
    -> expect exactly one line

ls STEPS.md
    -> expect "No such file or directory"

md5sum connectors/sheets_write_guard.py
    -> expect 1f7a08189f8cc3aa23142dccdc814e54

md5sum tests/test_sheets_write_guard.py
    -> expect fbc6482254fb628a88ed26bdb507cc41

Push to fix/state-evidence-commonpath and open the PR. Do not merge.
```

---

## Review checklist before you merge

- [ ] No `.md` files added anywhere
- [ ] `STEPS.md` deleted from the repo root
- [ ] Both md5 sums match
- [ ] `sheets_write_guard.install` in **`telegram_webhook_runtime.py`**
- [ ] `connectors/state_evidence.py` untouched in the diff
- [ ] CI run shows **183 tests**, green

## Then the three things no agent can do

1. Railway → Variables → `AI_OS_DATA_DIR=/data` (match your real mount path)
2. Boot log shows `state: dir=/data ... writable=True`
3. Version-increment acceptance test, then `MANAGER_FAST_CANARY_ENABLED=1`
