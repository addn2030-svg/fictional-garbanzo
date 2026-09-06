import types
import unittest
from unittest.mock import patch

from connectors import sheets_write_guard as guard


class FakeHttpError(Exception):
    """Shaped like googleapiclient.errors.HttpError: carries resp.status."""

    def __init__(self, status):
        super().__init__(f"HTTP {status}")
        self.resp = types.SimpleNamespace(status=status)


def wrapped(inner):
    """Reproduce telegram_webhook_runtime's `raise RuntimeError(...) from err`."""
    error = RuntimeError("direct write failed; Apps Script fallback also failed")
    error.__cause__ = inner
    return error


class FakeBot:
    GOOGLE_SHEET_ID = "sheet"
    INTAKE_TAB = "intake"
    CONVERSATION_TAB = "conversations"
    STATUS_TAB = "status"

    def __init__(self, raiser=None):
        self.rows = []
        self._raiser = raiser

    def _append(self, tab, row):
        self.rows.append((tab, row))
        if self._raiser:
            raise self._raiser()
        return {"ok": True}


def fake_service(column_values):
    """Sheets client whose values().get() returns a single column."""
    execute = types.SimpleNamespace(
        execute=lambda: {"values": [[v] for v in column_values]}
    )
    values = types.SimpleNamespace(get=lambda spreadsheetId, range: execute)
    return types.SimpleNamespace(
        spreadsheets=lambda: types.SimpleNamespace(values=lambda: values)
    )


class GuardTestCase(unittest.TestCase):
    def setUp(self):
        guard.KEY_COLUMN_BY_TAB.clear()
        guard._recent.clear()
        guard._SERVICE = None
        patcher = patch.object(guard.time, "sleep", lambda _s: None)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(guard._recent.clear)
        self.addCleanup(guard.KEY_COLUMN_BY_TAB.clear)


class ErrorClassificationTests(GuardTestCase):
    def test_4xx_is_never_retryable(self):
        for code in (400, 403, 404, 429):
            self.assertFalse(guard._is_retryable(FakeHttpError(code)), code)

    def test_5xx_is_retryable(self):
        for code in (500, 502, 503):
            self.assertTrue(guard._is_retryable(FakeHttpError(code)), code)

    def test_status_code_found_through_cause_chain(self):
        self.assertEqual(guard._status_code(wrapped(FakeHttpError(404))), 404)

    def test_timeout_detected_through_cause_chain(self):
        self.assertTrue(guard._is_timeout(wrapped(TimeoutError("timed out"))))

    def test_connection_errors_are_retryable(self):
        self.assertTrue(guard._is_retryable(ConnectionResetError("reset")))


class KeyColumnTests(GuardTestCase):
    def test_install_maps_tabs_to_their_natural_key(self):
        bot = FakeBot()
        guard.install(bot)
        self.assertEqual(guard.KEY_COLUMN_BY_TAB["intake"], 0)
        self.assertEqual(guard.KEY_COLUMN_BY_TAB["conversations"], 1)
        self.assertIsNone(guard.KEY_COLUMN_BY_TAB["status"])

    def test_status_rows_have_no_key(self):
        bot = FakeBot()
        guard.install(bot)
        # A status row starts with a timestamp, which is not an identifier.
        self.assertIsNone(guard._key_of("status", ["2026-09-06 10:00:00", "BOOT"]))

    def test_conversation_key_is_intake_id_not_chat_id(self):
        bot = FakeBot()
        guard.install(bot)
        self.assertEqual(guard._key_of("conversations", ["chat-1", "TG-9", "ts"]), "TG-9")


class RetryPolicyTests(GuardTestCase):
    def test_404_attempted_once(self):
        bot = FakeBot(lambda: FakeHttpError(404))
        append = guard.install(bot)
        with self.assertRaises(FakeHttpError):
            append("intake", ["TG-1"])
        self.assertEqual(len(bot.rows), 1)

    def test_wrapped_404_attempted_once(self):
        bot = FakeBot(lambda: wrapped(FakeHttpError(404)))
        append = guard.install(bot)
        with self.assertRaises(RuntimeError):
            append("intake", ["TG-2"])
        self.assertEqual(len(bot.rows), 1)

    def test_503_retries_then_fails(self):
        bot = FakeBot(lambda: FakeHttpError(503))
        append = guard.install(bot)
        with self.assertRaises(RuntimeError):
            append("intake", ["TG-3"])
        self.assertEqual(len(bot.rows), len(guard.BACKOFF_SECONDS) + 1)

    def test_success_returns_underlying_value(self):
        bot = FakeBot()
        append = guard.install(bot)
        self.assertEqual(append("intake", ["TG-4"]), {"ok": True})


class TimeoutVerificationTests(GuardTestCase):
    def test_timeout_but_write_landed_does_not_duplicate(self):
        bot = FakeBot(lambda: TimeoutError("timed out"))
        append = guard.install(bot)
        # Key present at row 380, far past sheet_intelligence's 150-row window.
        guard._SERVICE = fake_service([f"TG-{i}" for i in range(400)])
        append("intake", ["TG-380"])
        self.assertEqual(len(bot.rows), 1)

    def test_timeout_with_absent_key_retries(self):
        bot = FakeBot(lambda: TimeoutError("timed out"))
        append = guard.install(bot)
        guard._SERVICE = fake_service(["TG-1", "TG-2"])
        with self.assertRaises(RuntimeError):
            append("intake", ["TG-999"])
        self.assertEqual(len(bot.rows), len(guard.BACKOFF_SECONDS) + 1)

    def test_unverifiable_timeout_does_not_retry(self):
        bot = FakeBot(lambda: TimeoutError("timed out"))
        append = guard.install(bot)
        guard._SERVICE = None
        with patch.object(guard, "_key_exists", return_value=None):
            with self.assertRaises(RuntimeError) as caught:
                append("intake", ["TG-5"])
        self.assertIn("outcome unknown", str(caught.exception))
        self.assertEqual(len(bot.rows), 1)


class DedupeTests(GuardTestCase):
    def test_reappend_of_written_key_is_suppressed(self):
        bot = FakeBot()
        append = guard.install(bot)
        append("intake", ["TG-6"])
        append("intake", ["TG-6"])
        self.assertEqual(len(bot.rows), 1)

    def test_status_rows_are_never_deduped(self):
        bot = FakeBot()
        append = guard.install(bot)
        row = ["2026-09-06 10:00:00", "BOOT", "OK"]
        append("status", list(row))
        append("status", list(row))
        self.assertEqual(len(bot.rows), 2)

    def test_search_fallback_never_reports_absent(self):
        """search() only sees the first 150 rows, so it cannot prove absence."""
        bot = FakeBot()
        guard.install(bot)
        guard._SERVICE = None
        module = types.ModuleType("sheet_intelligence")
        module.configured = lambda: True
        module.search = lambda query, max_results=25: []
        with patch.dict("sys.modules", {"connectors.sheet_intelligence": module}):
            with patch.object(guard, "_service", return_value=None):
                self.assertIsNone(guard._key_exists(bot, "intake", "TG-380"))


if __name__ == "__main__":
    unittest.main()
