# -*- coding: utf-8 -*-
"""State startup evidence — WO-2 acceptance.

Prints one line at boot proving where state actually lives and whether it is
writable, so 'the volume is attached' becomes 'the state is durable'.

    state: dir=/data exists=True version=41 writable=True backups=5 audit=1204

Import and call from telegram_webhook.py at startup:

    from connectors import state_evidence
    state_evidence.report()

Set AI_OS_REQUIRE_DURABLE_STATE=1 to fail loudly instead of degrading when the
directory is not writable.
"""
from __future__ import annotations

import glob
import json
import os

from engine import store


def _writable(directory: str) -> bool:
    probe = os.path.join(directory, ".write_probe")
    try:
        os.makedirs(directory, exist_ok=True)
        with open(probe, "w", encoding="utf-8") as handle:
            handle.write("ok")
        os.remove(probe)
        return True
    except OSError:
        return False


def snapshot() -> dict:
    """Facts about the state directory. Never raises."""
    data_dir = store.DATA_DIR
    state_path = store.STATE_PATH
    audit_path = store.AUDIT_PATH

    exists = os.path.exists(state_path)
    version = None
    records = None

    if exists:
        try:
            with open(state_path, encoding="utf-8") as handle:
                data = json.load(handle)
            version = int(data.get("meta", {}).get("version", 0) or 0)
            records = sum(
                len(data.get(section, [])) for section in store.SECTIONS
            )
        except Exception:  # noqa: BLE001
            version = -1

    audit_lines = 0
    if os.path.exists(audit_path):
        try:
            with open(audit_path, encoding="utf-8") as handle:
                audit_lines = sum(1 for _ in handle)
        except OSError:
            audit_lines = -1

    return {
        "dir": data_dir,
        "exists": exists,
        "version": version,
        "records": records,
        "writable": _writable(data_dir),
        "backups": len(glob.glob(os.path.join(store.BACKUP_DIR, "state-*.json"))),
        "audit_entries": audit_lines,
        "mount_path": os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", ""),
        "durable": bool(os.environ.get("RAILWAY_VOLUME_MOUNT_PATH")),
    }


def report() -> dict:
    """Print the startup evidence line. Returns the snapshot."""
    facts = snapshot()

    print(
        "state: dir={dir} exists={exists} version={version} writable={writable} "
        "backups={backups} audit={audit_entries}".format(**facts),
        flush=True,
    )

    if not facts["writable"]:
        print(
            "state: WARNING — directory is NOT writable. "
            "Every state change will be lost.",
            flush=True,
        )
        if os.environ.get("AI_OS_REQUIRE_DURABLE_STATE", "").strip() == "1":
            raise RuntimeError(f"State directory {facts['dir']} is not writable")

    elif not facts["durable"]:
        print(
            "state: WARNING — no Railway volume detected. "
            "State is ephemeral and resets on every deploy.",
            flush=True,
        )

    return facts
