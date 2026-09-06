# كيف تُطبّق إصلاح `/books` على personal-ai-agent

> وكيل Arena لا يملك صلاحية دفع/fork إلى `addn2030-svg/personal-ai-agent` (التوكن `pull/push/admin=false`)، لذلك الإصلاح معروض هنا للمراجعة قبل التطبيق. اختر إحدى الطريقتين.

## الطريقة أ — تطبيق الـ patch (الأسرع)

في استنساخ محلي محدّث من **main**:

```bash
cd personal-ai-agent
git checkout main && git pull
git checkout -b fix/books-fastpath-tab-match
git apply ops/.../books-fastpath-fix.patch     # (أو انسخ الملف من دفتر الحاكمية)
python3 -m pytest tests/ -q                    # المتوقع: 164 passed
git add -A && git commit -F- <<'EOF'
fix(books): tolerate learning-tab name variants and stop silent fallthrough
EOF
git push -u origin fix/books-fastpath-tab-match
# ثم افتح PR إلى main وراجعه (لا تدمج قبل المراجعة)
```

> الـpatch موجود في هذا المجلد: `books-fastpath-fix.patch`.
> الملفات الكاملة المعدّلة للمراجعة في `files/` (engine/books_context.py، connectors/telegram_bot.py، tests/test_books_context.py).

## الطريقة ب — أعطِ الوكيل صلاحية ثم يتولى كل شيء

في GitHub: ادعُ الحساب `arena-ai-coding-agent[bot]` كمتعاون بصلاحية **Write** على `personal-ai-agent`، ثم أخبرني — أدفع الفرع وأفتح Draft PR بنفسي للمراجعة.

## بعد الدمج والنشر (تحقق القبول)
1. انتظر نشر Railway (Auto-deploy من main).
2. أرسل `/books` من تيليجرام → يجب أن تظهر قائمة الكتب الثمانية.
3. في سجلات النشر يجب ظهور: `[books_context v3.1] live_books -> 8 book(s) ...`.
4. إن لم تظهر، الرسالة الجديدة ستذكر السبب الحقيقي بدل "أمر غير معروف" — الصِقها لي.

## نطاق الإصلاح وأمانه
قراءة فقط؛ لا يمس Commerce أو الاعتمادات أو أي كتابة خارجية. الاختبارات: 160 قائمة + 4 جديدة = 164 ناجحة.
