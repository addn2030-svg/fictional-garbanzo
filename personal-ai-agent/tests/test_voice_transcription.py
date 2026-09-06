import types
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from connectors import aws_transcribe
from connectors import telegram_bot_legacy as bot


def fake_boto3(s3, transcribe):
    """Stand in for the boto3 module imported inside transcribe_file."""
    clients = {"s3": s3, "transcribe": transcribe}
    return types.SimpleNamespace(
        client=lambda name, region_name=None: clients[name]
    )


def job(status, transcript_uri=None, reason=None):
    payload = {"TranscriptionJobStatus": status}
    if transcript_uri:
        payload["Transcript"] = {"TranscriptFileUri": transcript_uri}
    if reason:
        payload["FailureReason"] = reason
    return {"TranscriptionJob": payload}


class ConfiguredTests(unittest.TestCase):
    """configured() gates the whole feature; BUCKET is read at import time."""

    def test_false_without_bucket(self):
        env = {"AWS_ACCESS_KEY_ID": "k", "AWS_SECRET_ACCESS_KEY": "s"}
        with patch.object(aws_transcribe, "BUCKET", ""), \
             patch.dict(aws_transcribe.os.environ, env, clear=True):
            self.assertFalse(aws_transcribe.configured())

    def test_false_without_credentials(self):
        with patch.object(aws_transcribe, "BUCKET", "bucket"), \
             patch.dict(aws_transcribe.os.environ, {}, clear=True):
            self.assertFalse(aws_transcribe.configured())

    def test_true_when_all_present(self):
        env = {"AWS_ACCESS_KEY_ID": "k", "AWS_SECRET_ACCESS_KEY": "s"}
        with patch.object(aws_transcribe, "BUCKET", "bucket"), \
             patch.dict(aws_transcribe.os.environ, env, clear=True):
            self.assertTrue(aws_transcribe.configured())

    def test_transcribe_file_refuses_when_unconfigured(self):
        with patch.object(aws_transcribe, "BUCKET", ""):
            with self.assertRaises(RuntimeError) as caught:
                aws_transcribe.transcribe_file("/tmp/x.ogg")
        self.assertIn("not configured", str(caught.exception))


class MediaFormatTests(unittest.TestCase):
    """Telegram sends .oga; Amazon Transcribe only accepts known formats."""

    def test_telegram_voice_suffix_maps_to_ogg(self):
        self.assertEqual(aws_transcribe._media_format("/tmp/note.oga"), "ogg")

    def test_opus_maps_to_ogg(self):
        self.assertEqual(aws_transcribe._media_format("/tmp/note.opus"), "ogg")

    def test_m4a_maps_to_mp4(self):
        self.assertEqual(aws_transcribe._media_format("/tmp/note.m4a"), "mp4")

    def test_known_formats_pass_through(self):
        self.assertEqual(aws_transcribe._media_format("/tmp/a.mp3"), "mp3")
        self.assertEqual(aws_transcribe._media_format("/tmp/a.ogg"), "ogg")

    def test_uppercase_suffix(self):
        self.assertEqual(aws_transcribe._media_format("/tmp/a.OGA"), "ogg")

    def test_missing_suffix_defaults_to_ogg(self):
        self.assertEqual(aws_transcribe._media_format("/tmp/noextension"), "ogg")


class TranscribeFileTestCase(unittest.TestCase):
    def setUp(self):
        self.s3 = MagicMock()
        self.transcribe = MagicMock()
        env = {"AWS_ACCESS_KEY_ID": "k", "AWS_SECRET_ACCESS_KEY": "s"}
        patches = [
            patch.object(aws_transcribe, "BUCKET", "bucket"),
            patch.dict(aws_transcribe.os.environ, env, clear=True),
            patch.dict("sys.modules", {"boto3": fake_boto3(self.s3, self.transcribe)}),
            patch.object(aws_transcribe.time, "sleep", lambda _s: None),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def _transcript(self, text):
        response = MagicMock()
        response.read.return_value = (
            '{"results": {"transcripts": [{"transcript": "%s"}]}}' % text
        ).encode("utf-8")
        return response


class HappyPathTests(TranscribeFileTestCase):
    def test_returns_stripped_transcript(self):
        self.transcribe.get_transcription_job.return_value = job(
            "COMPLETED", "https://example/t.json"
        )
        with patch.object(
            aws_transcribe.urllib.request, "urlopen",
            return_value=self._transcript("  \\u0645\\u0631\\u062d\\u0628\\u0627  "),
        ):
            result = aws_transcribe.transcribe_file("/tmp/note.oga")
        self.assertEqual(result, "\u0645\u0631\u062d\u0628\u0627")

    def test_polls_until_completed(self):
        self.transcribe.get_transcription_job.side_effect = [
            job("IN_PROGRESS"), job("IN_PROGRESS"),
            job("COMPLETED", "https://example/t.json"),
        ]
        with patch.object(aws_transcribe.urllib.request, "urlopen",
                          return_value=self._transcript("ok")):
            self.assertEqual(aws_transcribe.transcribe_file("/tmp/n.oga"), "ok")
        self.assertEqual(self.transcribe.get_transcription_job.call_count, 3)

    def test_upload_is_server_side_encrypted(self):
        """Voice notes may be clinical; the temporary object must be encrypted."""
        self.transcribe.get_transcription_job.return_value = job(
            "COMPLETED", "https://example/t.json"
        )
        with patch.object(aws_transcribe.urllib.request, "urlopen",
                          return_value=self._transcript("ok")):
            aws_transcribe.transcribe_file("/tmp/n.oga")
        _args, kwargs = self.s3.upload_file.call_args
        self.assertEqual(kwargs["ExtraArgs"], {"ServerSideEncryption": "AES256"})

    def test_media_format_is_sent(self):
        self.transcribe.get_transcription_job.return_value = job(
            "COMPLETED", "https://example/t.json"
        )
        with patch.object(aws_transcribe.urllib.request, "urlopen",
                          return_value=self._transcript("ok")):
            aws_transcribe.transcribe_file("/tmp/n.oga")
        kwargs = self.transcribe.start_transcription_job.call_args.kwargs
        self.assertEqual(kwargs["MediaFormat"], "ogg")


class LanguageTests(TranscribeFileTestCase):
    def _run(self):
        self.transcribe.get_transcription_job.return_value = job(
            "COMPLETED", "https://example/t.json"
        )
        with patch.object(aws_transcribe.urllib.request, "urlopen",
                          return_value=self._transcript("ok")):
            aws_transcribe.transcribe_file("/tmp/n.oga")
        return self.transcribe.start_transcription_job.call_args.kwargs

    def test_fixed_language_sets_language_code(self):
        with patch.object(aws_transcribe, "LANGUAGE", "ar-SA"):
            kwargs = self._run()
        self.assertEqual(kwargs["LanguageCode"], "ar-SA")
        self.assertNotIn("IdentifyLanguage", kwargs)

    def test_auto_enables_identification(self):
        with patch.object(aws_transcribe, "LANGUAGE", "auto"):
            kwargs = self._run()
        self.assertTrue(kwargs["IdentifyLanguage"])
        self.assertIn("ar-SA", kwargs["LanguageOptions"])
        self.assertNotIn("LanguageCode", kwargs)


class FailureAndCleanupTests(TranscribeFileTestCase):
    def test_failed_job_raises_with_reason(self):
        self.transcribe.get_transcription_job.return_value = job(
            "FAILED", reason="unsupported media"
        )
        with self.assertRaises(RuntimeError) as caught:
            aws_transcribe.transcribe_file("/tmp/n.oga")
        self.assertIn("unsupported media", str(caught.exception))

    def test_timeout_raises(self):
        self.transcribe.get_transcription_job.return_value = job("IN_PROGRESS")
        with patch.object(aws_transcribe, "TIMEOUT_SECONDS", 0):
            with self.assertRaises(RuntimeError) as caught:
                aws_transcribe.transcribe_file("/tmp/n.oga")
        self.assertIn("timed out", str(caught.exception))

    def test_cleanup_runs_after_failure(self):
        """No orphaned S3 object or Transcribe job, whatever went wrong."""
        self.transcribe.get_transcription_job.return_value = job("FAILED", reason="x")
        with self.assertRaises(RuntimeError):
            aws_transcribe.transcribe_file("/tmp/n.oga")
        self.s3.delete_object.assert_called_once()
        self.transcribe.delete_transcription_job.assert_called_once()

    def test_cleanup_runs_after_success(self):
        self.transcribe.get_transcription_job.return_value = job(
            "COMPLETED", "https://example/t.json"
        )
        with patch.object(aws_transcribe.urllib.request, "urlopen",
                          return_value=self._transcript("ok")):
            aws_transcribe.transcribe_file("/tmp/n.oga")
        self.s3.delete_object.assert_called_once()
        self.transcribe.delete_transcription_job.assert_called_once()

    def test_cleanup_failure_does_not_mask_the_transcript(self):
        self.transcribe.get_transcription_job.return_value = job(
            "COMPLETED", "https://example/t.json"
        )
        self.s3.delete_object.side_effect = RuntimeError("s3 down")
        self.transcribe.delete_transcription_job.side_effect = RuntimeError("api down")
        with patch.object(aws_transcribe.urllib.request, "urlopen",
                          return_value=self._transcript("ok")):
            self.assertEqual(aws_transcribe.transcribe_file("/tmp/n.oga"), "ok")

    def test_transcript_download_error_propagates(self):
        self.transcribe.get_transcription_job.return_value = job(
            "COMPLETED", "https://example/t.json"
        )
        with patch.object(aws_transcribe.urllib.request, "urlopen",
                          side_effect=urllib.error.URLError("boom")):
            with self.assertRaises(urllib.error.URLError):
                aws_transcribe.transcribe_file("/tmp/n.oga")
        self.s3.delete_object.assert_called_once()


class MessagePayloadTests(unittest.TestCase):
    """The webhook must classify a Telegram voice note before transcribing."""

    def test_voice_message(self):
        text, kind, attachment = bot._message_payload(
            {"voice": {"file_id": "AwACAgQ", "duration": 3}}
        )
        self.assertEqual(kind, "VOICE")
        self.assertEqual(attachment, "AwACAgQ")
        self.assertEqual(text, "[VOICE_PENDING_TRANSCRIPTION]")

    def test_audio_message(self):
        text, kind, attachment = bot._message_payload({"audio": {"file_id": "BQAC"}})
        self.assertEqual(kind, "AUDIO")
        self.assertEqual(attachment, "BQAC")
        self.assertEqual(text, "[AUDIO_PENDING_TRANSCRIPTION]")

    def test_caption_wins_over_placeholder(self):
        text, kind, _ = bot._message_payload(
            {"voice": {"file_id": "x"}, "caption": "\u0645\u0644\u0627\u062d\u0638\u0629"}
        )
        self.assertEqual(kind, "VOICE")
        self.assertEqual(text, "\u0645\u0644\u0627\u062d\u0638\u0629")

    def test_plain_text_is_not_voice(self):
        text, kind, attachment = bot._message_payload({"text": "hello"})
        self.assertEqual((text, kind, attachment), ("hello", "TEXT", ""))

    def test_voice_without_file_id(self):
        _text, kind, attachment = bot._message_payload({"voice": {"duration": 3}})
        self.assertEqual(kind, "VOICE")
        self.assertEqual(attachment, "")

    def test_empty_voice_object_falls_through_to_text(self):
        """Documents current behaviour: {} is falsy, so the voice branch is
        skipped. Telegram never sends an empty voice object, so this is an
        edge case rather than a defect - pinned here so a future refactor
        cannot change it silently."""
        self.assertEqual(bot._message_payload({"voice": {}}), ("", "TEXT", ""))


if __name__ == "__main__":
    unittest.main()
