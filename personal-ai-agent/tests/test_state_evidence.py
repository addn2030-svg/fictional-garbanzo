import json
import os
import tempfile
import unittest
from unittest.mock import patch

from connectors import state_evidence


class UnderTests(unittest.TestCase):
    """_under decides whether state actually lives on the mounted volume."""

    def test_root_parent(self):
        # startswith(parent + os.sep) built "//" here and wrongly returned False.
        self.assertTrue(state_evidence._under("/data", "/"))

    def test_exact_match(self):
        self.assertTrue(state_evidence._under("/data", "/data"))

    def test_nested(self):
        self.assertTrue(state_evidence._under("/data/state", "/data"))

    def test_trailing_slash(self):
        self.assertTrue(state_evidence._under("/data/", "/data"))

    def test_dotdot_inside_stays_inside(self):
        self.assertTrue(state_evidence._under("/data/sub/../x", "/data"))

    def test_sibling_prefix_is_not_inside(self):
        # /database must not count as being under /data.
        self.assertFalse(state_evidence._under("/database", "/data"))

    def test_production_trap(self):
        # Volume at /data, state at /app/data -> not durable.
        self.assertFalse(state_evidence._under("/app/data", "/data"))

    def test_dotdot_escape(self):
        self.assertFalse(state_evidence._under("/data/../other", "/data"))

    def test_empty_arguments(self):
        self.assertFalse(state_evidence._under("", "/data"))
        self.assertFalse(state_evidence._under("/data", ""))


class WritableTests(unittest.TestCase):
    def test_writable_directory_leaves_no_probe_behind(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(state_evidence._writable(tmp))
            self.assertEqual(os.listdir(tmp), [])

    def test_unwritable_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = os.path.join(tmp, "nested")
            os.makedirs(target)
            os.chmod(target, 0o500)
            try:
                if os.geteuid() == 0:
                    self.skipTest("root ignores directory permissions")
                self.assertFalse(state_evidence._writable(target))
            finally:
                os.chmod(target, 0o700)


class SnapshotTests(unittest.TestCase):
    def _store(self, tmp, version=7, tasks=2):
        os.makedirs(os.path.join(tmp, "backups"), exist_ok=True)
        with open(os.path.join(tmp, "state.json"), "w", encoding="utf-8") as handle:
            json.dump(
                {"meta": {"version": version, "schema": "state/1"},
                 "tasks": [{"id": i} for i in range(tasks)]},
                handle,
            )
        with open(os.path.join(tmp, "audit.jsonl"), "w", encoding="utf-8") as handle:
            handle.write('{"event": "a"}\n{"event": "b"}\n')
        for name in ("state-1.json", "state-2.json"):
            open(os.path.join(tmp, "backups", name), "w").close()

    def _patched(self, tmp):
        return patch.multiple(
            state_evidence.store,
            DATA_DIR=tmp,
            STATE_PATH=os.path.join(tmp, "state.json"),
            AUDIT_PATH=os.path.join(tmp, "audit.jsonl"),
            BACKUP_DIR=os.path.join(tmp, "backups"),
        )

    def test_reads_version_records_backups_and_audit(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._store(tmp)
            with self._patched(tmp), patch.dict(os.environ, {}, clear=True):
                facts = state_evidence.snapshot()
        self.assertEqual(facts["version"], 7)
        self.assertEqual(facts["records"], 2)
        self.assertEqual(facts["backups"], 2)
        self.assertEqual(facts["audit_entries"], 2)
        self.assertTrue(facts["exists"])
        self.assertTrue(facts["writable"])

    def test_corrupt_state_reports_minus_one_and_does_not_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "state.json"), "w", encoding="utf-8") as handle:
                handle.write("{not json")
            with self._patched(tmp), patch.dict(os.environ, {}, clear=True):
                facts = state_evidence.snapshot()
        self.assertEqual(facts["version"], -1)

    def test_missing_state_is_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self._patched(tmp), patch.dict(os.environ, {}, clear=True):
                facts = state_evidence.snapshot()
        self.assertFalse(facts["exists"])
        self.assertIsNone(facts["version"])

    def test_durable_only_when_state_is_on_the_volume(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._store(tmp)
            with self._patched(tmp):
                with patch.dict(os.environ, {"RAILWAY_VOLUME_MOUNT_PATH": tmp}, clear=True):
                    self.assertTrue(state_evidence.snapshot()["durable"])
                with patch.dict(os.environ, {"RAILWAY_VOLUME_MOUNT_PATH": "/data"}, clear=True):
                    self.assertFalse(state_evidence.snapshot()["durable"])
                with patch.dict(os.environ, {}, clear=True):
                    self.assertFalse(state_evidence.snapshot()["durable"])


class ReportTests(unittest.TestCase):
    def test_require_durable_raises_when_not_on_volume(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = {"RAILWAY_VOLUME_MOUNT_PATH": "/data",
                   "AI_OS_REQUIRE_DURABLE_STATE": "1"}
            with patch.multiple(state_evidence.store, DATA_DIR=tmp,
                                STATE_PATH=os.path.join(tmp, "state.json"),
                                AUDIT_PATH=os.path.join(tmp, "audit.jsonl"),
                                BACKUP_DIR=os.path.join(tmp, "backups")), \
                 patch.dict(os.environ, env, clear=True):
                with self.assertRaises(RuntimeError):
                    state_evidence.report()

    def test_report_returns_snapshot_without_the_flag(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.multiple(state_evidence.store, DATA_DIR=tmp,
                                STATE_PATH=os.path.join(tmp, "state.json"),
                                AUDIT_PATH=os.path.join(tmp, "audit.jsonl"),
                                BACKUP_DIR=os.path.join(tmp, "backups")), \
                 patch.dict(os.environ, {}, clear=True):
                facts = state_evidence.report()
        self.assertEqual(facts["dir"], tmp)


if __name__ == "__main__":
    unittest.main()
