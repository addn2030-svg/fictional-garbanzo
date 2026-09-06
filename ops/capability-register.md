# سجل القدرات الموحّد — Capability Register

> **مصدر الحقيقة الوحيد لحالة كل قدرة** (القرار D2). آخر تحديث: 2026-09-06.
> التحديث يتم فقط بناءً على: حالة PR على GitHub + سجل نتائج الاختبارات في `p0-production-truth-test.md` و`p1-drive-memory-acceptance.md`.
> **الحالات:** 🟢 Live (مُختبر تشغيليًا من Telegram ومثبت) · 🟡 Canary (مدموج بعلم/flag مطفأ) · ⚪ Shadow (يعمل دون أثر إنتاجي) · 🔵 Draft (PR مفتوح غير مدموج) · ⚫ Not-in-main (PR مغلق/لا كود).
>
> قاعدة الأسبوع: **Prove → Measure → Stabilize → Expand.** أي صف بلا نتيجة اختبار موثقة ليس 🟢.

## أ) القدرات المدموجة في `main` (personal-ai-agent)

| # | القدرة | الحالة | اختبار القبول | المالك | Rollback |
|---|---|---|---|---|---|
| C01 | Core Manager loop (دورة 15د + daily brief + StateStore موحّد) | 🟡 مدموج، غير مثبت تشغيليًا | **T01** `/brief` من Telegram + **T06** بقاء StateStore بعد redeploy | Abdulrahman | إيقاف دورة المدير؛ StateStore يحتفظ بآخر حالة (نسخ دوّارة آخر 5) |
| C02 | Executive Brief v3 (إشارات وقيود، PR #70) | 🟡 | **T01** البريف يعرض قسم إشارات/قيود وليس مهام فقط | Abdulrahman | flag إشارات البريف → إيقاف، يرجع Brief v2.1 |
| C03 | Sheet read عبر Google Workspace | 🟡 | **T02** طلب قراءة شيت من Telegram | Abdulrahman | قراءة الشيت تتوقف؛ لا أثر كتابي (الشيت استيراد/تصدير فقط) |
| C04 | Natural Action Executor: preview→approve→execute→receipt (PR #69) | 🟡 | **T03** دورة كاملة: `/approve_action` ببصمة SHA-256 ثم إيصال | Abdulrahman | الإجراء يبقى PENDING_APPROVAL؛ لا ينفذ شيء؛ 48 ساعة انتهاء صلاحية |
| C05 | Calendar (قراءة/تذكير، fail-closed على الغموض، PR #63) | 🟡 | **T04** حدث تقويم يظهر في البريف + تذكير | Abdulrahman | calendar_intent يفشل مغلقًا (لا إجراء) |
| C06 | Commerce pilot — حدود 375/طلب و375/يوم + موافقة + إيصال (PR #73) | 🟡 | **T03b** طلب يتجاوز 375 يُرفض؛ طلب ضمن الحد يحتاج `/approve_order` ثم إيصال | Abdulrahman | `PILOT_MAX_*` ثوابت صلبة؛ إيقاف `/shop` يجمد الشراء فورًا. **لا توسعة (القرار D3)** |
| C07 | Capability Truth v2 (لا ادعاء كاذب بعدم القدرة على Sheets، PR #71) | 🟡 | سؤال "هل تقدر تقرأ الشيت؟" يجب أن يؤكد الوصول الصحيح | Abdulrahman | capability_truth طبقة قراءة فقط؛ إيقافها يرجع للسلوك السابق |
| C08 | /chat bridge HTTP محمي | 🟡 معطّل افتراضيًا (503 `bridge_disabled`) | العميل الموثوق ينجح؛ غير المصرّح يُرفض | Abdulrahman | env flag → bridge مطفأ (الوضع الافتراضي) |
| C09 | Books fast path (استعلام الكتب من الشيت بلا نموذج، `/books`) | 🟡 | استعلام كتب يرجع قائمة من الشيت دون استدعاء LLM | Abdulrahman | السقوط على مسار النموذج القديم |
| C10 | Super Manager v1.1 + Manager FAST canary (PRs #66/#67) | 🟡 علم FAST مطفأ (flag OFF) | T01 لا ينكسر مع العلم مطفأ؛ canary لا يأخذ مسار الإنتاج | Abdulrahman | علم Manager FAST → OFF (مدموج مطفأً أصلًا) |
| C11 | /council + /agents + /delegate + /mission (فريق النماذج المتعددة) | 🟡 مدموج | `/council سؤال` يرجع مراجعة مجمّعة عبر البوابة الموحدة | Abdulrahman | بلا مفتاح OpenRouter يسقط آمنًا إلى Bedrock؛ لا أثر كتابي |
| C13 | بوابة النماذج الموحدة (model gateway: OpenRouter مع سقوط Bedrock؛ السريري يبقى على Bedrock) | 🟡 مدموج | فحص الإعداد: مفتاح مضبوط → OpenRouter؛ غير مضبوط → Bedrock دون انكسار | Abdulrahman | `OPENROUTER_API_KEY` فارغ + `OPENROUTER_FALLBACK_BEDROCK=1` = تشغيل Bedrock بالكامل |
| C12 | ذاكرة Drive في personal-ai-agent | 🔵 **Draft PR #77 مفتوح** (غير مدموج) | لا اختبار قبل الدمج؛ بعد الدمج يتبع P1 | Abdulrahman | غير منشور — لا شيء يتراجع |

## ب) العناصر غير الموجودة في `main` (لا تعتبر قدرات حية)

| # | القدرة | الحالة الفعلية | ما يلزم قبل أي تفعيل |
|---|---|---|---|
| X01 | Clinical knowledge — مصدر ConvCS السريري read-only (رفض MRN/هاتف/بريد) | ⚫ **Not-in-main: PR #74 مغلق بدون دمج** | إعادة تقديم PR + بوابة نشر + مراجعة خصوصية؛ لا شيء حاليًا في النظام |
| X02 | Strategic Creator | ⚫ **Not-in-main: PR #75 مغلق بدون دمج**؛ يوجد فقط سير عمل يدوي معزول `strategic-shadow-dev.yml` على فرع dev | قرار D4: **لا يُعاد تقديمه قبل إغلاق P0** |
| X03 | Active Multi-AI Manager v0.5 (أوركسترا تلقائية + أوامر owner-only + staging bootstrap + `engine/ai_manager.py`/`ai_council.py`) | ⚫ **Not-in-main: PR #13 مغلق بدون دمج** (ملاحظة: البوابة الأساسية OpenRouter مدموجة فعلًا — انظر C13؛ المفقود هو طبقة المدير النشط والأوركسترا التلقائية) | قرار D4 + إغلاق P0 أولًا؛ عند إعادة التقديم يلزم ملفات staging gates و`start_production.sh` كاملة |
| X04 | Production hardening (StateStore persistence + معالجة Telegram 409) | ⚫ **Not-in-main كحزمة: PR #12 مغلق بدون دمج**؛ الأساس مدموج عبر #64 | إثبات تشغيلي عبر **T06/T07** على المنشور الفعلي أولًا |

## جـ) مستودع physicaltherapy-assistance

| # | القدرة | الحالة | اختبار القبول | المالك | Rollback |
|---|---|---|---|---|---|
| P-01 | ذاكرة Drive للقراءة (Status/Progress/Decision) عبر `/memory_check` + `/status` `/progress` `/decision` | 🔵 **Draft — PR #1 مفتوح** | **P1 spec**: ثلاث قراءات، الأسماء مطابقة، **0 writes** | Abdulrahman | أمر غير منشور؛ لا شيء يتراجع. فحص الكود: GET فقط، لا دوال كتابة |
| P-02 | MoneyPrinterTurbo لتوليد الفيديو (`/video_create`, `/video_status`) | 🔵 **Draft — نفس PR #1** | يُختبر **بعد** إغلاق P-01 وبشكل منفصل (فصل الذاكرة عن الفيديو) | Abdulrahman | لا يستدعى إلا بأمر صريح |
| P-03 | مسار الكتابة المحمي بالموافقة للذاكرة | ⚫ **لا كود في PR #1** (لا توجد دوال create/update) | بعد P1 PASS: تصميم جديد يخضع للتجميد D1 ثم اختبار write-with-approval | Abdulrahman | — |

## دـ) قياس الأعمال (P2) — ليس قدرة تقنية بل فجوة قياس

| # | المؤشر | الحالة | اختبار القبول |
|---|---|---|---|
| M01 | Work KPIs (patient volume, waiting time, no-shows, productivity) | 🔴 لا توجد بيانات موثوقة | بطاقة `p2-executive-measurement.md` تُملأ أسبوعيًا بأرقام حقيقية |
| M02 | Business (leads, revenue) | 🔴 لا بيانات | نفس البطاقة |
| M03 | Projects stalled / Decisions pending / Learning applied / Personal follow-ups | 🔴 غير ملتقطة في `/brief` | قسم ثابت في مخرجات البريف الأسبوعي |

## ملخص الحالة في سطر

- **🟢 Live موثّق:** صفر — لا قدرة تحمل شهادة اختبار تشغيلي حتى تُنفذ P0.
- **🟡 Canary/مدموج بلا إثبات:** 12 قدرة في main تنتظر نتائج T01–T08 (C01–C11 + C13).
- **🔵 Draft مفتوح:** ذاكرة Drive في المستودعين (PR #77، PR #1).
- **⚫ Not-in-main (ادّعت المراجعة أنها قيد التجهيز):** المصدر السريري ConvCS، Strategic Creator، Active Multi-AI Manager v0.5، حزمة production hardening — أربعة عناصر.
- **🔴 فجوة قياس:** كل مؤشرات العمل (M01–M03).

> تحقق سطر-الأوامر من ثوابت هذا الجدول: `python3 ops/verify/source_truth.py` (آخر تشغيل: 26/26 PASS).
