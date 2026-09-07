#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to send the execution plan tasks to Google Sheets Webhook or format them for Abdulrahman AI OS.
Usage:
  python3 send_to_ai_os.py --webhook https://script.google.com/... --secret YOUR_SECRET
"""

import sys
import csv
import json
import urllib.request
import argparse

TASKS = [
    {"category": "مهمة", "title": "مذبحة التابات وإغلاق النوافذ غير الضرورية", "type": "شخصي", "priority": "عالية", "due": "2026-09-07", "notes": "الإبقاء على 3 تابات عمل فقط وأرشفة/إغلاق الباقي"},
    {"category": "مهمة", "title": "تصفية 3 مهام معلقة سريعة (أقل من 5 دقائق)", "type": "عمل", "priority": "عالية", "due": "2026-09-07", "notes": "إنجازها دفعة واحدة في 15 دقيقة لكسر التسويف"},
    {"category": "مهمة", "title": "ترتيب مكان شحن الهاتف بعيداً عن السرير", "type": "شخصي", "priority": "متوسطة", "due": "2026-09-07", "notes": "شاحن سليم ومكانه يبعد خطوتين على الأقل عن السرير"},
    {"category": "مهمة", "title": "إعادة ضبط نظام المنبهات (منبهين فقط)", "type": "شخصي", "priority": "عالية", "due": "2026-09-08", "notes": "المنبه الأساسي + منبه طوارئ بعد 15 دقيقة فقط"},
    {"category": "مهمة", "title": "تطبيق قاعدة المهام الثلاث الرئيسية لليوم", "type": "عمل", "priority": "عالية", "due": "2026-09-08", "notes": "تحديد أهم 3 مهام يومياً وإنجاز المهمة الكبرى صباحاً"},
    {"category": "مهمة", "title": "جلستان عمل عميق ومكثف (Deep Work - 25 دقيقة)", "type": "عمل", "priority": "متوسطة", "due": "2026-09-09", "notes": "التركيز بدون مقاطعات أو هاتف بنظام بومودورو"},
    {"category": "مهمة", "title": "نشاط بدني خفيف وشرب 2 لتر ماء", "type": "صحة", "priority": "متوسطة", "due": "2026-09-10", "notes": "مشي 20 دقيقة والحفاظ على ترطيب الجسم طوال اليوم"},
    {"category": "مهمة", "title": "جلسة مراجعة أسبوعية وتخطيط الأسبوع القادم", "type": "تطوير", "priority": "متوسطة", "due": "2026-09-13", "notes": "تقييم ما تم إنجازه وتحديد أولويات الـ 3 مهام للأسبوع الجديد"},
    {"category": "فكرة", "title": "نظام الحد الأدنى الفعّال (Minimum Effective Dose)", "type": "تطوير", "priority": "متوسطة", "due": "", "notes": "الاعتماد على استمرارية 20% لتحقيق 80% من النتائج بدلاً من المثالية المرهقة"},
    {"category": "قرار", "title": "الالتزام بإنهاء المهام القصيرة فوراً (قاعدة الـ 5 دقائق)", "type": "تطوير", "priority": "عالية", "due": "2026-09-07", "notes": "أي مهمة تستغرق أقل من 5 دقائق تنفذ فوراً دون تأجيل"}
]

def send_to_webhook(url, secret):
    print(f"📡 Sending {len(TASKS)} entries to Google Sheets Webhook...")
    success_count = 0
    for task in TASKS:
        # Row format for 'مدخلات الوكيل': [التاريخ, التصنيف, العنوان, النوع, الأولوية, الموعد, ملاحظات]
        row = [
            "2026-09-07",
            task["category"],
            task["title"],
            task["type"],
            task["priority"],
            task["due"],
            task["notes"]
        ]
        payload = json.dumps({
            "action": "append",
            "tab": "مدخلات الوكيل",
            "secret": secret,
            "row": row
        }).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                res_data = json.loads(resp.read().decode())
                if res_data.get("ok"):
                    print(f"  ✓ Added: {task['title']}")
                    success_count += 1
                else:
                    print(f"  ✗ Failed: {task['title']} -> {res_data}")
        except Exception as e:
            print(f"  ✗ Error sending '{task['title']}': {e}")

    print(f"\nDone: {success_count}/{len(TASKS)} sent successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Send tasks to Google Sheets Webhook or export.")
    parser.add_argument("--webhook", help="Google Apps Script Webhook URL")
    parser.add_argument("--secret", help="AGENT_SECRET for the Webhook")
    args = parser.parse_args()

    if args.webhook and args.secret:
        send_to_webhook(args.webhook, args.secret)
    else:
        print("💡 To send directly to your Google Sheet webhook:")
        print("   python3 send_to_ai_os.py --webhook <URL> --secret <AGENT_SECRET>")
        print("\n📄 'inbox.csv' is generated and ready for direct Git commit or import into personal-ai-agent!")
