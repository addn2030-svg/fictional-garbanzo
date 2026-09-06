# تصحيح حقائق المراجعة مقابل GitHub — 6 سبتمبر 2026

> منهجية الفحص: قُرئت حالة PRs مباشرة من GitHub API (`gh pr view`) لمستودعي
> `addn2030-svg/personal-ai-agent` و`addn2030-svg/physicaltherapy-assistance`،
> وفُحصت شجرة الكود على الفرع الافتراضي `main` (استنساخ بتاريخ 2026-09-06).
> أي خلاف بين وصف المراجعة والحالة الفعلية موثق هنا، والنتيجة منعكسة في
> `capability-register.md`.

## النتيجة الأهم: 4 عناصر وصفتها المراجعة كـ"Draft / في انتظار بوابات" هي في الحقيقة مغلقة بدون دمج

| العنقود | ما قالته المراجعة | الحالة الفعلية على GitHub | الأثر |
|---|---|---|---|
| Clinical knowledge (ConvCS sheet) | "PR #74 … ما زال يحتاج بوابة النشر المناسبة" (يوحي بأنه قيد الانتظار) | **PR #74 مغلق بدون دمج** (`mergedAt: null`، أُغلق 2026-09-04). لا يوجد أي ذكر لـ ConvCS في كود `main` | المصدر السريري **ليس في النظام إطلاقًا**. لا "Shadow" ولا "Canary" — Not-in-main. يلزم إعادة تقديمه عبر بوابة نشر جديدة قبل أي كلام عن تفعيل |
| Strategic Creator | "تجارب في shadow mode" / "لا تفعّله تلقائيًا" | **PR #75 مغلق بدون دمج**. لا يوجد أي ملف يحمل `strategic_creator` في `main`. الموجود فقط سير عمل يدوي `strategic-shadow-dev.yml` (workflow_dispatch، يتطلب كتابة تأكيد، ويعمل على فرع تطوير معزول) | "Shadow mode" موجود كأداة تطوير معزولة فقط، **لا كود في main**. التفعيل التلقائي مستحيل حاليًا؛ الخطر الحقيقي هو إعادة تقديم PR جديد أثناء التجميد |
| Production hardening (StateStore + Telegram 409) | "PR #12 ما زال يتطلب إثبات بقاء StateStore بعد redeploy" | **PR #12 مغلق بدون دمج** (فرع `hardening/wo0-wo8-2026-08-26`). الحالة الأساسية للـ StateStore مدموجة عبر PR #64 | إثبات ما بعد الـ redeploy وعدم ظهور 409 لمدة 24 ساعة ما زال مطلوبًا **كاختبار تشغيلي P0 على المنشور الفعلي** (انظر T06)، وهو أقوى مما وصفته المراجعة: التقوية نفسها ليست كلها في الكود المنشور |
| Active Multi-AI Manager / AI Council | "PR #13 ما زال Draft وله staging gates" | **PR #13 مغلق بدون دمج** (فرع `feature/active-multi-ai-manager-v0.5`). ملفاته المميزة (`engine/ai_manager.py`, `engine/ai_council.py`, `connectors/council_runtime.py`, `connectors/runtime_commands.py`, `connectors/ai_gateway.py`, سكربتات staging و`start_production.sh`) **غير موجودة في main** | المدير النشط متعدد الوكلاء (أوركسترا تلقائية + أوامر owner-only + بوابات staging + bootstrap) **ليس في النظام المنشور**. القرار D4 يبقى: لا يُعاد تقديمه قبل P0 |

> **تصحيح أثناء التوثيق:** العبارة الواردة سابقًا بأن `/council` "فريق Bedrock القديم" غير دقيقة. الحقيقة:
> - **بوابة النماذج الموحدة مدموجة فعلًا في main** — `connectors/model_gateway.py` يستخدم OpenRouter عند ضبط المفتاح ويسقط آمنًا إلى Bedrock (`OPENROUTER_FALLBACK_BEDROCK=1` افتراضيًا، والسريري يبقى على Bedrock). أوامر `/council` و`/agents` و`/delegate` و`/mission` في `connectors/team_orchestrator.py` تستدعي `openrouter_chat(...)` مع هذا السقوط. أي أن **"ربط نماذج متعددة" الذي ذكرته المراجعة في حكمها حقيقي ومدموج** (انظر C13 في سجل القدرات).
> - الخط الفاصل: البنية التحتية لتوجيه النماذج حيّة؛ أما **المدير النشط** الذي ينسّق الوكلاء تلقائيًا (ai_manager/ai_council + runtime_commands + staging gates) فهو خارج main في PR #13 المغلق.

## ما ورد في المراجعة وثبُتت صحته (مدموج فعلًا في main)

| القدرة | الدليل في الكود / GitHub |
|---|---|
| Executive Brief v3 (إشارات وقيود وليس مهام فقط) | PR #70 **مدموج**؛ `connectors/brief_discovery.py`, `brief_signal_runtime.py`, `executive_signals.py`, أمر `/brief` |
| Natural Action Executor (preview→approval→receipt) | PR #69 **مدموج**؛ `connectors/action_executor.py`, `action_runtime.py`, أوامر `/approve_action`, `/reject_action`, `/action_status` |
| Capability Truth (منع إنكار الوصول إلى Sheets) | PR #68 ثم **PR #71 (v2) مدموجان**؛ `connectors/capability_truth.py`, `capability_runtime.py` |
| Commerce pilot بحدود 375/375 | PR #73 **مدموج**؛ مؤكد في الكود: `PILOT_MAX_ORDER_SAR = Decimal("375.00")` و`PILOT_MAX_DAILY_SAR = Decimal("375.00")` في `connectors/commerce_agent.py` و`commerce_checkout.py`؛ أوامر `/shop`, `/prepare_order`, `/approve_order`, `/commerce_status` |
| /chat bridge محمي | `connectors/bridge_api.py`: جسر HTTP لعملاء الطرف الأول الموثوقين، ويعيد `bridge_disabled` (503) عندما يكون مطفأً — أي **معطّل افتراضيًا** |
| استعلامات الكتب fast path بلا نموذج | `engine/books_context.py` (استخراج/اقتراح كتب حتمي) + أمر `/books` (آخر التزام على main: "Implement fast path for book queries in Telegram bot") |
| ربط نماذج متعددة (OpenRouter + سقوط آمن Bedrock) | `connectors/model_gateway.py`: OpenRouter بوابة افتراضية للمحتوى غير السريري عند ضبط المفتاح، Bedrock افتراضي للسريري، سقوط تلقائي؛ `/council` و`/mission` في `team_orchestrator.py` يستخدمانها |
| StateStore / Calendar / Super Manager / FAST canary / WO-8 | PRs #63–#67 و#64 كلها **مدموجة** |

## ما وصفته المراجعة بدقة وما زال مفتوحًا

| العنصر | الحالة الفعلية |
|---|---|
| ذاكرة Drive في personal-ai-agent (PR #77) | **OPEN Draft** (فرع `feat/google-drive-project-memory`)، يضيف `connectors/project_memory.py` + اختبارات. غير مدموج — صحيح أنها "لم تُدمج أو تُنشر" |
| ذاكرة Drive في physicaltherapy-assistance | **OPEN Draft = PR رقم 1** (وليس رقم مجهول)، يضيف `src/integrations/googleDriveProjectMemory.ts` و`telegramCommands.ts` و`moneyPrinterTurbo.ts`. **مهم:** الفحص المصدري أثبت أن `/memory_check` للقراءة فقط — `driveGet()` ينفّذ GET فقط، ولا توجد أي دالة كتابة في الملف؛ لكن مسار الكتابة المحمي بالموافقة **غير موجود في هذا PR إطلاقًا** (لا يوجد كود create/update) — أي أن مرحلة "بعدها نختبر الكتابة" تتطلب عملاً جديدًا يخضع للتجميد D1 |

## الخلاصة

1. حكم المراجعة التنفيذي (تثبيت قبل التوسع) **مدعوم وبقوة** بالفحص — بل الوضع أكثر إحكامًا: ثلاث طبقات وُصفت كأنها قيد التجهيز (سريري، استراتيجي، multi-AI OpenRouter) **ليست في النظام المنشور أصلًا**.
2. نصف عناصر "Live/Canary/Shadow/Draft" في ذهن المراجعة يحتاج إعادة تصنيف إلى **Not-in-main**، وهذا يقلل سطح الانحدار الفعلي ويجعل اختبار P0 أبسط وأقصر.
3. أوامر Telegram الفعلية على `main` محصورة في: `/brief`, `/tasks`, `/approve_action`, `/reject_action`, `/action_status`, `/shop`, `/prepare_order`, `/approve_order`, `/commerce_status`, `/books`, `/council` (Bedrock فقط), `/manager*`, `/capabilities`, `/selftest`, `/storage_status`, `/sheet` وغيرها — **لا يوجد** `/memory_check` أو أي أمر ذاكرة على main.
