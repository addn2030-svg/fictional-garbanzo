# P1 — قبول ذاكرة Drive (أصغر اختبار آمن)

> المبدأ: **افصل اختبار الذاكرة عن توليد الفيديو تمامًا.** لا نختبر MoneyPrinterTurbo ولا أي كتابة في هذه المرحلة.
> المالك: Abdulrahman · الحالة: **⏳ لم يُبدأ** · يُنفذ فقط بعد أن يُدمج PR #1 (physicaltherapy-assistance) وPR #77 (personal-ai-agent) — وكلاهما حاليًا Draft مفتوح.

## ما الذي نختبره بالضبط

كود PR #1 (`src/integrations/googleDriveProjectMemory.ts`) مؤكَّد قراءة فقط:
- `verify()` و`read()` يستخدمان دالة `driveGet()` التي تصدر **GET فقط** إلى `https://www.googleapis.com/drive/v3/...`.
- لا توجد أي دالة create/update/patch في الملف — أي أن "0 writes" مضمون بنيويًا في مرحلة القراءة.
- الأوامر: `/memory_check` (يتحقق من الهوية والأسماء والقراءة)، و`/status` `/progress` `/decision` (قراءة المحتوى).
- الحماية: قائمة allowlist لمعرّفات chat (`TELEGRAM_ALLOWED_CHAT_IDS`)، وثلاثة معرّفات ملفات يجب أن تكون متمايزة (يُرفض التهيئة إذا تكررت).

## خطوات الاختبار (القراءة فقط)

| # | الخطوة | معيار النجاح | النتيجة |
|---|---|---|---|
| M1 | شارِك الملفات الثلاثة مع هوية Google التي يمثلها رمز OAuth: `Status.md`, `Progress.md`, `Decision.md` | ثلاثة معرّفات متمايزة؛ مشاركة قراءة فقط (لا Editor) | ⏳ |
| M2 | اضبط متغيرات البيئة: `GOOGLE_DRIVE_ACCESS_TOKEN`, `GOOGLE_DRIVE_STATUS_FILE_ID`, `GOOGLE_DRIVE_PROGRESS_FILE_ID`, `GOOGLE_DRIVE_DECISION_FILE_ID`, `TELEGRAM_ALLOWED_CHAT_IDS` | الخدمة تُقلع؛ معرّفان متماثلان يجب أن يُسقطا الإقلاع برسالة "three distinct values" | ⏳ |
| M3 | من chat **غير** مصرّح له، أرسل `/memory_check` | رفض صريح ("not authorized") — لا أي اتصال بـ Drive | ⏳ |
| M4 | من chat مصرّح، أرسل `/memory_check` | ثلاثة أسطر ✅: `✅ Status.md` / `✅ Progress.md` / `✅ Decision.md`؛ كل اسم فعلي يطابق الاسم المتوقع و`canDownload != false` | ⏳ |
| M5 | أرسل `/status` ثم `/progress` ثم `/decision` | محتوى كل ملف يُعرض نصيًا بشكل صحيح | ⏳ |
| M6 | **إثبات الصفر كتابة (حاسم):** راجِع سجل تدقيق Google Drive / Cloud Console للهوية خلال نافذة الاختبار | **3 عمليات GET (metadata) + 3 قراءات media كحد أقصى، وصفر أنشطة كتابة/تعديل**؛ لا تغيير في أوقات آخر تعديل للملفات | ⏳ |

## بعد نجاح القراءة فقط — وليس قبله

1. مسار الكتابة المحمي بالموافقة: **لا يوجد له كود حاليًا** (PR #1 قراءة فقط). تصميمه عمل جديد يدخل تحت التجميد D1:
   - كتابة تبدأ كمسودة PENDING_APPROVAL (نفس نموذج Action Executor: preview → approval بصمة → receipt).
   - تكتب في ملفات الذاكرة فقط، ولا تمس أي ملف آخر في Drive.
   - أول اختبار كتابة حقيقية يكون على ملف **مسودة جديد** لا على Status/Progress/Decision.
2. `/video_create` و`/video_status` (MoneyPrinterTurbo): يُختبران في دفعة منفصلة بعد استقرار الذاكرة، ولا يُخلطان مع قبول الذاكرة.

## بوابة الدمج (Merge gate)

PR #1 لا يُدمج إلا إذا: M4 وM5 وM6 كلها 🟢 من Telegram، مع لقطة سجل تدقيق Drive تثبت 0 writes. نفس البوابة منطبقة على PR #77 في personal-ai-agent (ميزة `project_memory` المقابلة).
