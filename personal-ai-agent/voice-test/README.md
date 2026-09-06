# Voice test

Two things here: an Arabic audio sample to send to the live bot, and a unit test
file for the transcription code.

---

## 1. The audio sample — `voice-test-ar.mp3`

Spoken content:

> مرحبًا، هذه رسالة صوتية تجريبية لاختبار خاصية تفريغ الصوت في الوكيل. من فضلك
> أضف مهمة جديدة: مراجعة تقرير المشروع يوم الأربعاء الساعة العاشرة صباحًا،
> وذكّرني قبل الموعد بساعة واحدة. شكرًا لك.

Chosen deliberately: it is Modern Standard Arabic (matching the `ar-SA` default
in `AWS_TRANSCRIBE_LANGUAGE_CODE`), it contains a date, a time and a duration —
the parts of ASR most likely to fail — and it ends with **وذكّرني**, which
`telegram_bot_legacy.py:912` matches to route the transcript into
`command_remind`. So a single message exercises transcription *and* intent.

### How to send it

**Option A — as an audio file.** Attach the mp3 in Telegram. `_message_payload`
classifies it `AUDIO`, `_transcribe_telegram` downloads it with an `.mp3`
suffix, and `_media_format` passes `mp3` to Transcribe. This is the fastest way
to prove the AWS half works.

**Option B — as a real voice note.** Play the mp3 on a second device and hold
the microphone button in Telegram to record it. Telegram sends `.oga`, which
`_message_payload` classifies `VOICE` and `_media_format` maps to `ogg`. Only
this path tests the `.oga → ogg` mapping.

Do both if you can. They take different branches.

### What you should see

```
🎙️ تم استلام الصوت، جارٍ التفريغ والتحليل...
📝 التفريغ:
مرحبا هذه رسالة صوتية تجريبية لاختبار خاصية تفريغ الصوت ...
```

Then, because the transcript contains **ذكّرني**, a reminder confirmation.

### Prerequisites

Four Railway variables. Run `/selftest` first and look for
`✅ Voice / Transcribe: مهيأ`:

| Variable | Notes |
| --- | --- |
| `AWS_S3_AUDIO_BUCKET` | The one usually missing. `configured()` returns False without it and nothing is transcribed. |
| `AWS_ACCESS_KEY_ID` | Needs `s3:PutObject`, `s3:DeleteObject`, `transcribe:*` on that bucket |
| `AWS_SECRET_ACCESS_KEY` | |
| `AWS_TRANSCRIBE_LANGUAGE_CODE` | Defaults `ar-SA`. Set `auto` to identify between `ar-SA`, `ar-AE`, `en-US`. |

### Reading a failure

| Symptom | Cause |
| --- | --- |
| `❌ Voice / Transcribe: غير مهيأ` in `/selftest` | One of the four variables is missing |
| Silence, no 🎙️ acknowledgement | Not the voice path — the message was classified `TEXT` or `DOCUMENT` |
| `AWS Transcribe/S3 variables are not configured` | `configured()` is False; `BUCKET` is read at import, so a variable added after boot needs a redeploy |
| `Amazon Transcribe timed out` | Longer than `AWS_TRANSCRIBE_TIMEOUT_SECONDS` (default 120) |
| `AccessDenied` | IAM policy missing S3 or Transcribe permissions |
| Transcript is English gibberish | `AWS_TRANSCRIBE_LANGUAGE_CODE` is not an Arabic locale |

---

## 2. The unit test — `tests/test_voice_transcription.py`

28 tests, `unittest` style, boto3 fully mocked — no AWS calls, no cost, safe in CI.

```bash
python -m unittest tests.test_voice_transcription
```

Covers:

- `configured()` gating, including that `transcribe_file` refuses to run unconfigured
- `_media_format`: `.oga`/`.opus` → `ogg`, `.m4a` → `mp4`, uppercase suffixes, no suffix
- Happy path, polling until `COMPLETED`, transcript stripping
- `LanguageCode` vs `IdentifyLanguage` when the language is `auto`
- **S3 upload asserts `ServerSideEncryption: AES256`** — voice notes may carry clinical content, so an unencrypted temporary object would be a privacy regression
- **Cleanup on every exit path** — S3 object and Transcribe job deleted after success, after `FAILED`, and after a download error, so no orphaned recordings accumulate
- A cleanup failure does not mask a good transcript
- `_message_payload` classification of `VOICE`, `AUDIO`, captions and plain text

One test pins current behaviour rather than asserting a preference: an empty
`{"voice": {}}` object is falsy, so it falls through to `TEXT`. Telegram never
sends that, so it is an edge case, not a defect — pinned so a refactor cannot
change it silently.

### To run it in CI

Add to the `python -m unittest` list in
`.github/workflows/production-model-router.yml`, same indentation as the others:

```yaml
          tests.test_voice_transcription
```

Worth doing **after** the Sheets guard PR lands, so the two changes do not
collide in the same workflow file.
