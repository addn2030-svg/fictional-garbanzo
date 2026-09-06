# Handing this to an AI agent instead of doing it by hand

Short answer: **yes for VS Code Copilot agent mode or Claude Code, cautiously yes
for GitHub's Copilot coding agent, and no for plain Claude/ChatGPT chat.**

But read this first, because it decides which one you pick.

---

## The thing to understand before delegating

This task is **not** "implement a write guard." It is "paste two finished files
and make two surgical edits at known line numbers."

That difference matters. The original version of these files was written by an
agent that reasoned about the code without reading all of it, and it produced six
defects — including a guard installed in the wrong file, and a duplicate-prevention
check that recreated duplicates. Those were not sloppiness; they were the
predictable result of an agent filling gaps with plausible assumptions.

So: **give the agent the finished artefacts and forbid improvisation.** Every
prompt below is written that way. If an agent starts "improving" the guard, stop it.

An honest comparison, since you have the option of just doing it:

| Route | Time | Risk |
| --- | --- | --- |
| github.dev by hand (`.` key, one commit) | ~10 min | Lowest. You see every change. |
| VS Code Copilot / Claude Code | ~5 min | Low, if you review the diff |
| GitHub Copilot coding agent (issue → PR) | ~15 min wait | Medium. It may reinterpret the task. |
| Claude/ChatGPT chat window | — | Cannot edit your repo at all |

The mechanical nature of this work means an agent saves you maybe five minutes and
adds a review burden. Your call — but do not skip reading the diff either way.

---

## Option A — VS Code with Copilot agent mode, or Claude Code

**Best option.** The agent edits real files on your machine, you see the diff
before anything is pushed.

### Setup

```bash
git clone https://github.com/addn2030-svg/personal-ai-agent
cd personal-ai-agent
code .
```

In VS Code: open Copilot Chat → switch the dropdown from **Ask** to **Agent**.
For Claude Code: run `claude` in that directory.

### Paste this prompt

```
Apply a prepared patch to this repository. Do not design anything — the files
already exist and are verified. Do not refactor, rename, or "improve" anything
beyond exactly what is listed.

STEP 1. Create connectors/sheets_write_guard.py with the exact contents of:
https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/1f45dcd60f673e42aaf185117063c0bb60dbce6b/personal-ai-agent/connectors/sheets_write_guard.py

STEP 2. Create connectors/state_evidence.py with the exact contents of:
https://raw.githubusercontent.com/addn2030-svg/fictional-garbanzo/1f45dcd60f673e42aaf185117063c0bb60dbce6b/personal-ai-agent/connectors/state_evidence.py

Copy both byte for byte. Do not reformat, do not reorder imports, do not change
default values, do not translate the Arabic tab names.

STEP 3. In connectors/telegram_webhook.py:
  (a) Delete the block from the comment
      "# Keep the original write implementation, then add bounded retry around it."
      through and including the line "bot._append = _append_with_retry".
      That is the _raw_append assignment and the whole _append_with_retry
      function. Leave exactly two blank lines where it was.
  (b) In def run(), directly above "manager_fast_canary.start_if_enabled()",
      insert these two lines indented by 4 spaces:
          from connectors import state_evidence
          state_evidence.report()

STEP 4. In connectors/telegram_webhook_runtime.py:
  (a) After the line "from connectors import google_credentials", add:
      from connectors import sheets_write_guard
  (b) In _append_direct_first, delete the
      "for attempt, delay in enumerate((0, 1, 2), start=1):" retry loop and its
      body, replacing it with a single direct attempt:

        if _direct_ready():
            try:
                return _direct_append(tab, row)
            except Exception as exc:  # connector boundary
                direct_error = exc
                print(f"Sheets direct write failed for {tab}: {str(exc)[:180]}", flush=True)

      Leave the Apps Script fallback block below it unchanged.
  (c) Change the last line of that section from
        bot._append = _append_direct_first
      to
        bot._append = sheets_write_guard.install(bot, _append_direct_first)

CONSTRAINTS
- Do not modify any other file.
- Do not add tests, docs, type hints, or logging beyond the above.
- Do not "fix" anything you think is wrong elsewhere.
- telegram_webhook_runtime.py is the Railway entrypoint (see Dockerfile). The
  guard MUST be installed there, not in telegram_webhook.py. If you think it
  belongs in telegram_webhook.py, you have misread the import order — the runtime
  reassigns bot._append after the webhook module runs.

VERIFY, then report results to me:
1. python3 -m py_compile connectors/sheets_write_guard.py connectors/state_evidence.py connectors/telegram_webhook.py connectors/telegram_webhook_runtime.py
2. grep -n "_append_with_retry" connectors/telegram_webhook.py     -> must be empty
3. grep -n "enumerate((0, 1, 2)" connectors/telegram_webhook_runtime.py -> must be empty
4. grep -n "sheets_write_guard.install" connectors/telegram_webhook_runtime.py -> must show one line
5. grep -n "state_evidence.report" connectors/telegram_webhook.py  -> must show one line
6. git diff --stat -> must show exactly 2 files changed and 2 files added

Do not commit or push. Stop and show me the diff.
```

### Then

Review the diff yourself, especially that Step 4 landed in the *runtime* file.
Then:

```bash
git add -A
git commit -m "Sheets write guard (WO-5) + state startup evidence (WO-2)"
git push
```

One commit, one Railway deploy.

---

## Option B — GitHub Copilot coding agent

You own the repo, so you can assign an issue to Copilot and it will open a PR.
Requires a Copilot Pro/Business seat with the coding agent enabled.

**Risk:** it works from an issue with no chance for you to course-correct
mid-flight, and this task has a counter-intuitive part (the guard goes in the file
that is *not* named `telegram_webhook.py`). Copilot may well "correct" that.
Read its PR carefully.

### How

1. Repo → **Issues** → **New issue**
2. Title: `Apply prepared Sheets write guard + state evidence patch`
3. Body: paste the Option A prompt above, but change the last paragraph from
   "Do not commit or push. Stop and show me the diff." to
   "Commit the changes and open a pull request. Do not merge."
4. On the issue, under **Assignees**, pick **Copilot**
5. Wait ~10–15 minutes, then review the PR

**Before merging, check these four things:**

- [ ] `sheets_write_guard.install` appears in `telegram_webhook_runtime.py`, not `telegram_webhook.py`
- [ ] `SHEETS_GUARD_DEDUPE` still defaults to `"0"` and `SHEETS_GUARD_VERIFY` to `"1"`
- [ ] The status tab still maps to `None` in `KEY_COLUMN_BY_TAB`, not `0`
- [ ] The Arabic tab names are intact and not mangled to `?????`

Those are the four places a well-meaning agent is most likely to "help."

---

## Option C — Claude or ChatGPT in a chat window

They cannot write to your repo. You would paste the files back and forth by hand,
which is strictly more work than doing it yourself in github.dev.

The one thing chat is genuinely good for: **paste the final diff and ask it to
review.** A second opinion on a diff costs nothing.

---

## After any route

The code being merged is not the finish line. Still to do, from `STEPS.md`:

1. Railway → Variables → `AI_OS_DATA_DIR=/data` (match your actual volume mount).
   No agent can do this for you, and without it state still silently resets.
2. Check the boot log for the three expected lines.
3. Run the version-increment acceptance test.
4. Only then `MANAGER_FAST_CANARY_ENABLED=1`.

Rollback is unchanged: Railway → Deployments → last good → **Redeploy**.
