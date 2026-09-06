#!/usr/bin/env python3
"""
source_truth.py — تحقق حتمي من ثوابت الكود (جزء Prove من قاعدة الأسبوع).

هذا السكربت لا يختبر الإنتاج (ذلك P0 من Telegram)، بل يثبت ثوابت المصدر
التي اعتمد عليها سجل القدرات: حدود Commerce، وجود/غياب أوامر، وطبيعة
ذاكرة Drive (قراءة فقط). كل فحص يطبع PASS/FAIL.

الاستخدام:
    python3 ops/verify/source_truth.py                 # يستنسخ المستودعين إلى /tmp
    PAI_DIR=/path/to/personal-ai-agent PT_DIR=/path/to/pt \
        python3 ops/verify/source_truth.py             # يستخدم نسخًا محلية موجودة

يحتاج: git + وصول شبكة للاستنساخ (أو متغيرات المسار).
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PAI_REPO = "https://github.com/addn2030-svg/personal-ai-agent.git"
PT_REPO = "https://github.com/addn2030-svg/physicaltherapy-assistance.git"
PT_BRANCH = "feat/telegram-drive-memory-video-service"

GREEN, RED, DIM, RESET = "\033[32m", "\033[31m", "\033[90m", "\033[0m"
results: list[tuple[bool, str, str]] = []


def check(cond: bool, name: str, detail: str = "") -> None:
    results.append((bool(cond), name, detail))
    mark = f"{GREEN}PASS{RESET}" if cond else f"{RED}FAIL{RESET}"
    print(f"  [{mark}] {name}" + (f" {DIM}— {detail}{RESET}" if detail else ""))


def run(cmd: list[str], cwd: str | None = None) -> str:
    out = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return out.stdout + out.stderr


def clone_or_use(repo: str, env_dir: str, dest: Path, branch: str | None = None) -> Path:
    if env_dir and Path(env_dir).exists():
        return Path(env_dir)
    cmd = ["git", "clone", "--depth", "1"]
    if branch:
        cmd += ["--branch", branch]
    cmd += [repo, str(dest)]
    run(cmd)
    return dest


def grep(path: Path, pattern: str, glob: str = "*.py") -> list[str]:
    hits: list[str] = []
    for f in path.rglob(glob):
        if ".git" in f.parts:
            continue
        try:
            text = f.read_text(errors="ignore")
        except Exception:
            continue
        if re.search(pattern, text, re.IGNORECASE):
            hits.append(str(f.relative_to(path)))
    return hits


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="truth-"))
    pai = clone_or_use(PAI_REPO, os.environ.get("PAI_DIR", ""), work / "pai")
    pt = clone_or_use(PT_REPO, os.environ.get("PT_DIR", ""), work / "pt", PT_BRANCH)

    section("personal-ai-agent @ main — القدرات المدموجة")
    # الأوامر موزعة عبر ملفات البوت/الـ runtime (telegram_bot.py هو البوت الحي polling،
    # telegram_webhook*.py وengine/telegram_bot.py و*_runtime.py تحمل أيضًا معالجات).
    py_files = [f for f in pai.rglob("*.py") if ".git" not in f.parts]
    code_corpus = "\n".join(f.read_text(errors="ignore") for f in py_files)
    for cmd in ["/brief", "/approve_action", "/reject_action", "/action_status",
                "/shop", "/prepare_order", "/approve_order", "/books",
                "/capabilities", "/selftest"]:
        check(cmd in code_corpus, f"الأمر {cmd} موجود في شجرة الكود المدموجة")

    comm = (pai / "connectors" / "commerce_agent.py").read_text(errors="ignore")
    check('Decimal("375.00")' in comm and "PILOT_MAX_ORDER_SAR" in comm,
          "حد Commerce: 375 SAR/طلب ثابت في الكود")
    check("PILOT_MAX_DAILY_SAR" in comm and 'Decimal("375.00")' in comm,
          "حد Commerce: 375 SAR/يوم ثابت في الكود")

    bridge = (pai / "connectors" / "bridge_api.py").read_text(errors="ignore")
    check("bridge_disabled" in bridge, "/chat bridge يفشل مغلقًا (bridge_disabled) عند الإطفاء")

    section("personal-ai-agent @ main — ما يجب ألا يكون موجودًا (Not-in-main)")
    check(not grep(pai, r"strategic_creator|strategic creator"),
          "لا كود Strategic Creator في main")
    check(not grep(pai, r"convc"), "لا كود مصدر ConvCS السريري في main")
    check("memory_check" not in code_corpus,
          "لا أمر /memory_check في main (الذاكرة Draft PR #77)")
    # خط فاصل دقيق: بوابة النماذج (model_gateway) مدموجة وتسقط آمنًا إلى Bedrock،
    # لكن "Active Multi-AI Manager / AI Council v0.5" (ملفات ai_manager/ai_council/
    # council_runtime/runtime_commands) خارج main (PR #13 مغلق بدون دمج).
    check("openrouter" in code_corpus,
          "بوابة النماذج الموحدة مدموجة (OpenRouter مع سقوط آمن Bedrock)")
    check(not (pai / "engine" / "ai_manager.py").exists()
          and not (pai / "engine" / "ai_council.py").exists()
          and not (pai / "connectors" / "council_runtime.py").exists(),
          "Active Multi-AI Manager / AI Council v0.5 خارج main (ai_manager/ai_council/council_runtime غير موجودة)")

    section("physicaltherapy-assistance @ PR #1 — ذاكرة Drive قراءة فقط")
    mem = pt / "src" / "integrations" / "googleDriveProjectMemory.ts"
    cmds = pt / "src" / "integrations" / "telegramCommands.ts"
    if not mem.exists():
        print(f"  {RED}تنبيه:{RESET} ملفات فرع PR #1 غير موجودة — "
              f"عند استخدام PT_DIR تأكد أن النسخة على فرع {PT_BRANCH} "
              f"(git checkout)، وليس main.")
    mem_text = mem.read_text(errors="ignore") if mem.exists() else ""
    cmds_text = cmds.read_text(errors="ignore") if cmds.exists() else ""
    check("'GET'" in mem_text or "method" not in mem_text,
          "driveGet يستخدم GET افتراضيًا (بلا method write)")
    write_verbs = re.findall(r"\b(files\.(create|update|patch)|method:\s*['\"](POST|PUT|PATCH|DELETE))", mem_text)
    check(not write_verbs, "صفر دوال كتابة (create/update/patch/POST/PUT/DELETE) في ملف الذاكرة",
          f"وجدت: {write_verbs}" if write_verbs else "")
    check("/memory_check" in cmds_text, "أمر /memory_check موجود في PR الفرع")
    for name in ["Status.md", "Progress.md", "Decision.md"]:
        check(name in mem_text, f"الملف المتوقع {name} معرف في الكود")
    check("three distinct" in mem_text, "رفض التهيئة إذا تكررت معرّفات الملفات (three distinct)")
    check("TELEGRAM_ALLOWED_CHAT_IDS" in mem_text or "allowedTelegramChatIds" in mem_text,
          "قائمة allowlist لمعرّفات chat نافذة")

    section("الخلاصة")
    passed = sum(1 for ok, *_ in results if ok)
    total = len(results)
    print(f"  {passed}/{total} فحص ناجح")
    if not os.environ.get("PAI_DIR"):
        shutil.rmtree(work, ignore_errors=True)
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
