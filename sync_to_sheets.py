#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sync inbox tasks and execution plan to Google Sheets via Webhook or Service Account.
"""

import os
import sys
import json
import csv
import urllib.request
import urllib.error

WEBHOOK_URL = os.environ.get("GOOGLE_SHEETS_WEBHOOK_URL", "https://script.google.com/macros/s/AKfycbzukkMQpo6fpBKfuzHDNl82b-BoFKRokVI6N_baejWul9hVgMzNoC4zBf4vv1OpQiQ_/exec").strip()
WEBHOOK_SECRET = os.environ.get("GOOGLE_SHEETS_WEBHOOK_SECRET", "Iamthe@best555").strip()

def sync_csv_to_sheets(csv_path="inbox.csv"):
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found")
        sys.exit(1)

    print(f"🔄 Reading tasks from {csv_path}...")
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"📋 Found {len(rows)} items to sync.")
    success_count = 0

    for idx, r in enumerate(rows, 1):
        category = (r.get("التصنيف") or "مهمة").strip()
        title = (r.get("العنوان") or "").strip()
        kind = (r.get("النوع") or "عام").strip()
        prio = (r.get("الأولوية") or "متوسطة").strip()
        due = (r.get("الموعد") or "").strip()
        notes = (r.get("ملاحظة") or "").strip()

        if not title:
            continue

        # Target sheet format: [التاريخ, التصنيف, العنوان, النوع, الأولوية, الموعد, ملاحظات]
        row_data = [
            "2026-09-07",
            category,
            title,
            kind,
            prio,
            due,
            notes
        ]

        payload = {
            "action": "append",
            "tab": "مدخلات الوكيل",
            "secret": WEBHOOK_SECRET,
            "row": row_data
        }

        data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            WEBHOOK_URL,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                if res.get("ok"):
                    print(f"  [{idx}/{len(rows)}] ✓ Added: {title} ({category})")
                    success_count += 1
                else:
                    print(f"  [{idx}/{len(rows)}] ✗ Failed: {title} -> Response: {res}")
        except Exception as e:
            print(f"  [{idx}/{len(rows)}] ✗ Connection error on '{title}': {e}")

    print("\n" + "="*50)
    print(f"🎯 Total synced successfully: {success_count}/{len(rows)}")
    print("="*50)

if __name__ == "__main__":
    sync_csv_to_sheets()
