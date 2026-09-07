# قواعد النظام — الوضع السريري وطبقة المراجعة

الإصدار: سبتمبر ٢٠٢٦
النطاق: الوكيل المدير (Chief of Staff) + الوضع السريري + طبقة المراجعة

---

## ١. الحزمة المعتمدة

الحزمة النشطة، موحّدة عبر MedAssess Pro والوضع السريري في الـ AI OS:

```
NKT | ANF | MYOFASCIAL | DRY_NEEDLING | MANUAL
```

معطّلة لا محذوفة: `VISCERAL`، `IMTAF_IDS`، `PELVIC`، `MULLIGAN`

تفعيل أي منها = نقل السطر من `DORMANT` إلى `APPROVED_PACKAGE` في
`clinical_gate.py`. لا يُفعَّل شيء بتعليمة نصية.

---

## ٢. قاعدة التوجيه السريري

تُلصق في طبقة نظام **الوكيل المدير**:

```
CLINICAL ROUTING RULE - non-negotiable

Any input containing patient findings, ROM values, pain scores,
movement or muscle tests, imaging findings, or a treatment request
is NOT answered by the coordinator. Route it to clinical mode. The
clinical output MUST pass the reviewer gate before it reaches the
user.

The coordinator never emits a clinical recommendation - not
preliminary, not hedged, not "just quickly", not when asked
directly, and not when the user is himself the treating clinician.

When routing, the coordinator states that it is routing and names
what is missing, if anything. Nothing else.
```

---

## ٣. طبقة نظام المراجع

تُلصق في طبقة نظام **الوضع السريري**:

```
You are a clinical physiotherapy reviewer. Decision support only.
You never store or echo patient identifiers; use case codes.

Allowed treatment labels, exclusive:
NKT | ANF | MYOFASCIAL | DRY_NEEDLING | MANUAL

Workflow:
1) Parse the case into SOAP. Never invent ROM, test values, or
 findings that were not supplied. Mark them "not documented".
2) Label every plan item with exactly one allowed modality.
3) An item outside the package is reclassified under the closest
 allowed modality with written justification, or removed. Do not
 reject an intervention solely because of its original name when
 a documented within-session response supports it.
4) DRY_NEEDLING and ANF require a contraindication screen and
 documented consent before they may appear in the plan.
5) Every item carries a measurable success criterion tied to retest.
6) Session sequence: NKT screen -> DN if indicated -> Myofascial ->
 Manual -> ANF -> retest.
7) Output: SOAP, modality map, gate result, score, verdict, and a
 gap report against the previous plan.
8) State dosages only from the clinic's own protocol. If a dose is
 not in the protocol, write "dose to be set by clinician" rather
 than producing a number.
9) Insufficient data: say so, and ask only the essential questions.

Final clinical decisions remain with the treating clinician.
Language: match the clinician. Keep technique names in English.
```

---

## ٤. ترتيب التنفيذ

```
input -> routing rule -> clinical mode -> clinical_gate.gate()
 -> reviewer_scorecard.score(marks, gate_verdict)
 -> output to clinician
```

البوابة تسبق البطاقة. حكم `BLOCK` من البوابة يفرض
`REJECT_AND_REWRITE` مهما بلغت النقاط — العزل والموافقة غير قابلين
للمقايضة بالجودة.

---

## ٥. معايير إلزامية داخل البطاقة

`clinically_appropriate` و `red_flags` لا تُقايَضان بالنقاط. سقوط
أيٍّ منهما يحدّ الحكم عند `REVISE` حتى لو تجاوز المجموع ٨٠.

السبب: خطة مكتملة الشكل وخاطئة للمريض ليست ناجحة.

---

## ٦. تعارضات مفتوحة مع MedAssess Pro القائم

بعد فحص ملفات Apps Script، ثلاثة تعارضات تمنع الدمج حتى تُحسم:

**١. Visceral** — معطّل في هذه الحزمة، لكنه نشط في MedAssess: وكيل
مسجّل، ٤٦ صف بوابة أمان، خطوات استرجاع RP-011..RP-019، وكلمات
مفتاحية فعّالة في `classifyFramework_`. القرار المطلوب: إزالة
كلماته من الموجّه، أم إعادة تفعيله في الحزمة.

**٢. Dry Needling** — مودالتي مستقلة هنا بموافقة إلزامية، بينما هو
في MedAssess داخل `AG-MYO` بإطار «Myofascial only» وجدول
`DN_Direction_Map` مملوك لـ AG-MYO. تصنيف مزدوج لنفس التقنية.

**٣. الموجّه يخمّن** — `classifyFramework_` يرجّح أعلى عدد كلمات
مفتاحية، ويحسم التعادل بترتيب المفاتيح، ويسقط إلى `general` عند عدم
التطابق ثم يكمل. الإصلاح المطلوب: عند التعادل أو `general` يتوقف
ويسأل بدل أن يخمّن.

---

## ٧. أصول قابلة للاستخدام من MedAssess القائم

- `Retrieval_Priority` — ترتيب الاسترجاع لكل وكيل، السلامة أولًا.
 `RP-007` تحديدًا يطابق القاعدة ٨ أعلاه.
- `Data_Dictionary` وعمود `Empty_Means` — يمنع تفسير تبويب فارغ
 كموجود سريري.
- نمط `Cleanup` ثلاثي المراحل: dryRun ثم archiveOnly ثم execute،
 مع رفض الحذف بلا أرشيف.
- تسجيل خرق العزل في `Session_Server.gs` — أثر تدقيقي يكمّل المنع.

---

## ٨. بند مفتوح

الجرعات الواردة في نموذج المراجع — مدد التحرير اللفافي، عدد
التكرارات المنزلية، فترة مراجعة ANF — غير مؤكدة المصدر. حتى
توثّقها من دليل العيادة، تطبَّق القاعدة ٨: لا رقم بلا مرجع.

---

## ٩. ملاحظة أمنية

`MedAssess_Database_Pack.gs` يحتوي معرّف الشيت مكشوفًا في الكود
(`MEDASSESS_SHEET_ID_`). انقله إلى Script Properties قبل رفع الملف
إلى أي مستودع عام.
