/** ══════════════════════════════════════════════════════════════════
 *  LIFE PULSE BRIDGE — جسر الأتمتة مع جدول نبض الحياة Content Engine
 *  يقرأ PUBLISH_QUEUE وينشر ما استحقّ النشر ثم يحدّث الحالة تلقائياً
 *  ────────────────────────────────────────────────────────────────
 *  قاعدة الاستحقاق (كلها معاً):
 *    1) Status = Ready أو Approved (أو فارغ)
 *    2) Approval = Approved  (إذا كان REQUIRE_APPROVAL = true)
 *    3) Scheduled_Date + Scheduled_Time_KSA <= الآن
 *
 *  عند النشر الناجح:
 *    Status → "Posted"  +  يُكتب الرابط في عمود U (Posted_URL)
 *                        +  الطابع الزمني في V (Posted_At)
 *  عند الفشل:
 *    Status → "Failed"  +  رسالة الخطأ في W (Last_Error)
 *
 *  المنصات المدعومة (عمود Platform): LinkedIn · Instagram · Facebook ·
 *  X (أو Twitter) · GitHub
 *  الوسائط: Media_URL يقبل رابط Drive أو معرّف الملف مباشرة.
 *  LinkedIn و X يعملان نصياً أيضاً بدون وسائط. إنستغرام يتطلب وسائط.
 * ══════════════════════════════════════════════════════════════════ */

const LP = {
  // معرّف جدول Life Pulse — يمكن تجاوزه بـ Script Property باسم LIFEPULSE_SHEET_ID
  SHEET_ID: '1E57MbTJWKkr8E0J5_pbhZPyBX9XuZvtZ8T0jH4YjWNQ',
  QUEUE_TAB: 'PUBLISH_QUEUE',        // يمكن تجاوزه بـ PUBLISH_QUEUE_TAB
  REQUIRE_APPROVAL: true,            // لا نشر بدون Approval = Approved
  IMPORT_AUTO_APPROVE: false,        // الاستيراد من CONTENT_LIBRARY يترك Approval فارغاً لمراجعة بشرية ثانية
  READY_STATUSES: ['ready', 'approved', ''],
  DISCLAIMER: 'محتوى تثقيفي ولا يغني عن تقييم مختص.',
  APPEND_HASHTAGS: true,
  LINKEDIN_MAX_CHARS: 3000,
  TWITTER_MAX_CHARS: 280
};

/** أعمدة PUBLISH_QUEUE (1-based) — مطابقة لرؤوس الأعمدة الفعلية */
const COLQ = {
  QUEUE_ID: 1, CONTENT_ID: 2, TITLE: 3, PLATFORM: 4, FORMAT: 5,
  HOOK: 6, CAPTION: 7, CAPTION_EN: 8, CTA: 9, HASHTAGS: 10,
  MEDIA: 11, COVER: 12, MUSIC: 13, DATE: 14, TIME: 15,
  STATUS: 16, APPROVAL: 17, BUFFER: 18, NOTES: 19, DM: 20,
  POSTED_URL: 21,   // عمود جديد يضيفه النظام
  POSTED_AT: 22,    // عمود جديد يضيفه النظام
  LAST_ERROR: 23    // عمود جديد يضيفه النظام
};

// ════════════════════════════════════════════════════════════════
//  المعالجة الرئيسية — ضعها على مشغّل كل 10 دقائق
// ════════════════════════════════════════════════════════════════
function processLifePulseQueue() {
  const sh = lpGetQueueSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const data = sh.getRange(2, 1, lastRow - 1, COLQ.LAST_ERROR).getValues();
  const now = new Date();
  let posted = 0, failed = 0, skipped = 0;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const row = i + 2; // رقم الصف الفعلي في الورقة
    const status = String(r[COLQ.STATUS - 1] || '').trim();
    const approval = String(r[COLQ.APPROVAL - 1] || '').trim();
    const platform = lpNormalizePlatform(r[COLQ.PLATFORM - 1]);
    const queueId = r[COLQ.QUEUE_ID - 1];

    // صف فارغ أو منشور مسبقاً
    if (!queueId || status.toLowerCase() === 'posted') continue;

    // شرط الاستحقاق 1: الحالة
    if (LP.READY_STATUSES.indexOf(status.toLowerCase()) === -1) { skipped++; continue; }

    // شرط الاستحقاق 2: الاعتماد
    if (LP.REQUIRE_APPROVAL && approval.toLowerCase() !== 'approved') { skipped++; continue; }

    // شرط الاستحقاق 3: الوقت الحاضر
    const due = lpParseDueDate(r[COLQ.DATE - 1], r[COLQ.TIME - 1]);
    if (!due) { skipped++; continue; }
    if (due > now) { skipped++; continue; }

    // تركيب التعليق
    const caption = lpBuildCaption(r);
    if (!caption) {
      lpMarkFailed(sh, row, 'لا يوجد نص (Hook/Caption فارغون)');
      failed++;
      continue;
    }

    // الوسائط (اختيارية حسب المنصة)
    let blob = null;
    try {
      blob = lpGetMediaBlob(r[COLQ.MEDIA - 1]);
    } catch (e) {
      lpMarkFailed(sh, row, 'تعذّر جلب الوسائط: ' + e);
      failed++;
      continue;
    }
    if (!blob && platform === 'instagram') {
      lpMarkFailed(sh, row, 'إنستغرام يتطلب Media_URL — لا ينشر نصاً فقط');
      failed++;
      continue;
    }

    // النشر
    try {
      const result = lpPost(platform, blob, caption, String(queueId));
      if (result.success) {
        sh.getRange(row, COLQ.STATUS).setValue('Posted');
        sh.getRange(row, COLQ.POSTED_URL).setValue(result.url || '');
        sh.getRange(row, COLQ.POSTED_AT).setValue(new Date());
        posted++;
        sendNotification('نُشر من طابور Life Pulse', String(queueId) + ' → ' + platform + '\n' + (result.url || ''), 'success');
      } else {
        lpMarkFailed(sh, row, result.error || 'فشل غير معروف');
        failed++;
      }
    } catch (error) {
      lpMarkFailed(sh, row, String(error));
      failed++;
      logError('LifePulse ' + queueId, error);
    }
  }

  Logger.log('Life Pulse queue: posted=' + posted + ' failed=' + failed + ' skipped=' + skipped);
}

// ════════════════════════════════════════════════════════════════
//  فتح الورقة + فحص الاتصال
// ════════════════════════════════════════════════════════════════
function lpGetQueueSheet() {
  const sheetId = prop('LIFEPULSE_SHEET_ID', LP.SHEET_ID);
  const tabName = prop('PUBLISH_QUEUE_TAB', LP.QUEUE_TAB);
  const ss = SpreadsheetApp.openById(sheetId);
  const sh = ss.getSheetByName(tabName);
  if (!sh) throw new Error('تبويب ' + tabName + ' غير موجود في جدول Life Pulse');
  return sh;
}

/** يتحقق من رؤوس الأعمدة ويعيد تقريراً — شغّله مرة واحدة بعد اللصق */
function testLifePulseConnection() {
  const sh = lpGetQueueSheet();
  const headers = sh.getRange(1, 1, 1, COLQ.DM).getValues()[0];
  const expected = ['Queue_ID', 'Content_ID', 'Post_Title', 'Platform', 'Format',
    'Hook_AR', 'Caption_AR', 'Caption_EN', 'CTA_AR', 'Hashtags', 'Media_URL',
    'Cover_Text', 'Music_Direction', 'Scheduled_Date', 'Scheduled_Time_KSA',
    'Status', 'Approval', 'Buffer_Post_Text', 'Internal_Notes', 'DM_Reply_Template'];
  const issues = [];
  expected.forEach(function(name, idx) {
    if (String(headers[idx] || '').trim() !== name) {
      issues.push('العمود ' + String.fromCharCode(65 + idx) + ': متوقع "' + name + '" موجود "' + headers[idx] + '"');
    }
  });
  const lastRow = sh.getLastRow();
  let ready = 0, approved = 0;
  if (lastRow > 1) {
    const d = sh.getRange(2, 1, lastRow - 1, COLQ.LAST_ERROR).getValues();
    d.forEach(function(r) {
      if (LP.READY_STATUSES.indexOf(String(r[COLQ.STATUS - 1] || '').trim().toLowerCase()) !== -1) ready++;
      if (String(r[COLQ.APPROVAL - 1] || '').trim().toLowerCase() === 'approved') approved++;
    });
  }
  const msg = 'الاتصال ناجح ✅\nالصفوف: ' + Math.max(lastRow - 1, 0) +
    '\nجاهزة (Status): ' + ready + '\nمعتمدة (Approval): ' + approved +
    (issues.length ? '\n\n⚠️ مشاكل الأعمدة:\n' + issues.join('\n') : '\n\nكل الأعمدة مطابقة ✅');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* من المحرر */ }
  return msg;
}

// ════════════════════════════════════════════════════════════════
//  تركيب التعليق — Hook ثم Caption ثم CTA ثم الوسوم ثم إخلاء المسؤولية
// ════════════════════════════════════════════════════════════════
function lpBuildCaption(r) {
  const parts = [];
  const hook = String(r[COLQ.HOOK - 1] || '').trim();
  const caption = String(r[COLQ.CAPTION - 1] || '').trim();
  const cta = String(r[COLQ.CTA - 1] || '').trim();
  const tags = String(r[COLQ.HASHTAGS - 1] || '').trim();

  // السطر الأول = Hook (يظهر قبل «…see more» في لينكدن)
  if (hook) parts.push(hook);
  if (caption) parts.push(caption);
  if (cta) parts.push(cta);
  if (LP.APPEND_HASHTAGS && tags) parts.push(tags);
  parts.push('—\n' + LP.DISCLAIMER);

  const text = parts.join('\n\n');
  return text.length > LP.LINKEDIN_MAX_CHARS
    ? text.substring(0, LP.LINKEDIN_MAX_CHARS - 1) + '…'
    : text;
}

function lpNormalizePlatform(v) {
  const p = String(v || '').trim().toLowerCase();
  if (p === 'x' || p === 'twitter' || p.indexOf('تويتر') !== -1 || p === 'تويتر') return 'twitter';
  if (p === 'linkedin' || p === 'لينكدن' || p === 'لينكدين') return 'linkedin';
  if (p === 'instagram' || p === 'إنستغرام' || p === 'انستقرام' || p === 'انستغرام') return 'instagram';
  if (p === 'facebook' || p === 'فيسبوك') return 'facebook';
  if (p === 'github' || p === 'جيت هاب') return 'github';
  return p;
}

// ════════════════════════════════════════════════════════════════
//  التاريخ والوقت (توقيت الجدول = Asia/Riyadh كما في manifest)
// ════════════════════════════════════════════════════════════════
function lpParseDueDate(dateVal, timeVal) {
  if (!dateVal && !timeVal) return null;

  let y, mo, d, hh = 0, mm = 0;

  if (Object.prototype.toString.call(dateVal) === '[object Date]' && !isNaN(dateVal)) {
    y = dateVal.getFullYear(); mo = dateVal.getMonth(); d = dateVal.getDate();
  } else if (dateVal) {
    const s = String(dateVal).trim().split(/[\/\-\.]/);
    if (s.length < 3) return null;
    y = parseInt(s[0], 10); mo = parseInt(s[1], 10) - 1; d = parseInt(s[2], 10);
  } else {
    const t = new Date(); y = t.getFullYear(); mo = t.getMonth(); d = t.getDate();
  }

  if (Object.prototype.toString.call(timeVal) === '[object Date]' && !isNaN(timeVal)) {
    hh = timeVal.getHours(); mm = timeVal.getMinutes();
  } else if (timeVal) {
    const tp = String(timeVal).trim().match(/^(\d{1,2})[:\.](\d{2})/);
    if (tp) { hh = parseInt(tp[1], 10); mm = parseInt(tp[2], 10); }
  }

  const due = new Date(y, mo, d, hh, mm);
  return isNaN(due.getTime()) ? null : due;
}

// ════════════════════════════════════════════════════════════════
//  الوسائط من Drive
// ════════════════════════════════════════════════════════════════
function lpGetMediaBlob(mediaVal) {
  if (!mediaVal) return null;
  const s = String(mediaVal).trim();
  if (!s || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'tbd') return null;

  // استخراج معرّف الملف من أنماط روابط Drive الشائعة
  let id = s;
  const m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
            s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  return DriveApp.getFileById(id).getBlob();
}

// ════════════════════════════════════════════════════════════════
//  النشر لكل منصة — مع دعم «نص فقط» حيث يسمح
// ════════════════════════════════════════════════════════════════
function lpPost(platform, blob, caption, queueId) {
  switch (platform) {
    case 'linkedin':  return blob ? postToLinkedIn(blob, caption, queueId) : lpLinkedInText(caption, queueId);
    case 'twitter':   return blob ? postToTwitter(blob, lpClipTwitter(caption), queueId) : lpTwitterText(caption, queueId);
    case 'facebook':  return blob ? postToFacebook(blob, caption, queueId) : lpFacebookText(caption, queueId);
    case 'instagram': return postToInstagram(blob, caption, queueId);
    case 'github':    return postToGitHub(blob, caption, queueId);
    default:
      return { success: false, url: '', error: 'منصة غير مدعومة: "' + platform + '" — المدعوم: LinkedIn, Instagram, Facebook, X, GitHub' };
  }
}

function lpClipTwitter(caption) {
  return caption.length > LP.TWITTER_MAX_CHARS
    ? caption.substring(0, LP.TWITTER_MAX_CHARS - 1) + '…'
    : caption;
}

/** منشور لينكدن نصي (بدون صورة) */
function lpLinkedInText(caption, postId) {
  try {
    const owner = getLinkedInUrn();
    const res = UrlFetchApp.fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + prop('LINKEDIN_ACCESS_TOKEN'),
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': CONFIG.LINKEDIN_API_VERSION
      },
      payload: JSON.stringify({
        author: owner,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: caption },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) throw new Error('ugcPosts text: ' + res.getContentText());
    const urn = JSON.parse(res.getContentText()).id;
    return { success: true, url: 'https://www.linkedin.com/feed/update/' + urn, postId: urn };
  } catch (error) {
    logError('LinkedIn text', error);
    return { success: false, url: '', error: String(error) };
  }
}

/** تغريدة نصية بدون وسائط */
function lpTwitterText(caption, postId) {
  try {
    const url = 'https://api.twitter.com/2/tweets';
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { 'Authorization': twitterOAuthHeader('POST', url, {}), 'Content-Type': 'application/json' },
      payload: JSON.stringify({ text: lpClipTwitter(caption) }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) throw new Error('tweet text: ' + res.getContentText());
    const id = JSON.parse(res.getContentText()).data.id;
    return { success: true, url: 'https://twitter.com/i/web/status/' + id, postId: id };
  } catch (error) {
    logError('Twitter text', error);
    return { success: false, url: '', error: String(error) };
  }
}

/** منشور فيسبوك نصي عبر /feed (البارامتر الصحيح message) */
function lpFacebookText(caption, postId) {
  try {
    const base = 'https://graph.facebook.com/' + CONFIG.GRAPH_VERSION;
    const res = UrlFetchApp.fetch(base + '/' + prop('FB_PAGE_ID') + '/feed', {
      method: 'post',
      payload: { message: caption, access_token: prop('FB_ACCESS_TOKEN') },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) throw new Error('FB feed: ' + res.getContentText());
    const id = JSON.parse(res.getContentText()).id;
    return { success: true, url: 'https://www.facebook.com/' + id, postId: id };
  } catch (error) {
    logError('Facebook text', error);
    return { success: false, url: '', error: String(error) };
  }
}

// ════════════════════════════════════════════════════════════════
//  أدوات الحالة
// ════════════════════════════════════════════════════════════════
function lpMarkFailed(sh, row, message) {
  sh.getRange(row, COLQ.STATUS).setValue('Failed');
  sh.getRange(row, COLQ.LAST_ERROR).setValue(String(message).substring(0, 500));
}

// ════════════════════════════════════════════════════════════════
//  مشغّل التثبيت — كل 10 دقائق
// ════════════════════════════════════════════════════════════════
function lpInstallTrigger() {
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(function(t) {
    if (t.getHandlerFunction() === 'processLifePulseQueue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processLifePulseQueue').timeBased().everyMinutes(10).create();
  sendNotification('جسر Life Pulse مثبت', 'معالجة الطابور كل 10 دقائق', 'success');
}

// ════════════════════════════════════════════════════════════════
//  الاستيراد من CONTENT_LIBRARY → PUBLISH_QUEUE
//  (بديل دالة «Queue approved ideas» في السكربت القديم)
//  يكتشف الأعمدة من رؤوسها ديناميكياً + يمنع تكرار Content_ID
// ════════════════════════════════════════════════════════════════
function lpQueueApprovedIdeas() {
  const ss = SpreadsheetApp.openById(prop('LIFEPULSE_SHEET_ID', LP.SHEET_ID));
  const lib = ss.getSheetByName(prop('CONTENT_LIBRARY_TAB', 'CONTENT_LIBRARY'));
  if (!lib || lib.getLastRow() < 2) {
    Logger.log('CONTENT_LIBRARY فارغ أو غير موجود');
    try { SpreadsheetApp.getUi().alert('تبويب CONTENT_LIBRARY فارغ أو غير موجود.'); } catch (e) { /* */ }
    return 0;
  }
  const queue = lpGetQueueSheet();

  // فهرسة أعمدة المكتبة من رؤوسها (مقاومة لاختلاف الترتيب أو المسافات)
  const heads = lib.getRange(1, 1, 1, lib.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const find = function(exact, contains, exclude) {
    for (let i = 0; i < heads.length; i++) {
      if (exact && heads[i] === exact) return i;
    }
    for (let i = 0; i < heads.length; i++) {
      if (contains && heads[i].indexOf(contains) !== -1 && (!exclude || heads[i].indexOf(exclude) === -1)) return i;
    }
    return -1;
  };
  const C = {
    status:    find('STATUS'),
    contentId: find('CONTENTID', 'CONTENTID'),
    title:     find('POSTTITLE', 'TITLE'),
    platform:  find('PLATFORM'),
    format:    find('FORMAT'),
    hook:      find(null, 'HOOK'),
    captionAr: find('CAPTIONAR', 'CAPTION', 'EN'),
    captionEn: find('CAPTIONEN', 'CAPTIONEN'),
    cta:       find(null, 'CTA'),
    hashtags:  find(null, 'HASHTAG'),
    media:     find('MEDIAURL', 'MEDIA', 'DIRECTION'),
    cover:     find(null, 'COVER'),
    music:     find(null, 'MUSIC')
  };

  if (C.status === -1) {
    Logger.log('لم أجد عمود Status في CONTENT_LIBRARY — أوقف الاستيراد احتياطاً');
    try { SpreadsheetApp.getUi().alert('لم أجد عمود Status في CONTENT_LIBRARY — الاستيراد موقوف احتياطاً.'); } catch (e) { /* */ }
    return 0;
  }

  // منع التكرار: معرّفات موجودة مسبقاً في الطابور
  const existingIds = {};
  if (queue.getLastRow() > 1) {
    queue.getRange(2, 1, queue.getLastRow() - 1, 2).getValues().forEach(function(r) {
      if (r[1] !== '') existingIds[String(r[1])] = true;
    });
  }

  const rows = lib.getRange(2, 1, lib.getLastRow() - 1, lib.getLastColumn()).getValues();
  const picks = rows.filter(function(r) {
    if (r[C.status] === undefined || String(r[C.status]).trim().toLowerCase() !== 'approved') return false;
    const cid = C.contentId !== -1 ? String(r[C.contentId] || '') : '';
    return !(cid && existingIds[cid]);
  });

  if (!picks.length) {
    Logger.log('لا أفكار معتمدة جديدة للاستيراد');
    try { SpreadsheetApp.getUi().alert('لا توجد أفكار معتمدة جديدة (كل المعتمد مستورد سابقاً).'); } catch (e) { /* */ }
    return 0;
  }

  // ترقيم Queue_ID تشارياً
  let nextId = 1;
  if (queue.getLastRow() > 1) {
    queue.getRange(2, 1, queue.getLastRow() - 1, 1).getValues().forEach(function(r) {
      const n = parseInt(r[0], 10);
      if (!isNaN(n) && n >= nextId) nextId = n + 1;
    });
  }

  const out = picks.map(function(r) {
    const g = function(idx) { return idx !== -1 && r[idx] !== undefined ? r[idx] : ''; };
    const row = new Array(COLQ.LAST_ERROR).fill('');
    row[COLQ.QUEUE_ID - 1] = nextId++;
    row[COLQ.CONTENT_ID - 1] = g(C.contentId);
    row[COLQ.TITLE - 1] = g(C.title);
    row[COLQ.PLATFORM - 1] = g(C.platform);
    row[COLQ.FORMAT - 1] = g(C.format);
    row[COLQ.HOOK - 1] = g(C.hook);
    row[COLQ.CAPTION - 1] = g(C.captionAr);
    row[COLQ.CAPTION_EN - 1] = g(C.captionEn);
    row[COLQ.CTA - 1] = g(C.cta);
    row[COLQ.HASHTAGS - 1] = g(C.hashtags);
    row[COLQ.MEDIA - 1] = g(C.media);
    row[COLQ.COVER - 1] = g(C.cover);
    row[COLQ.MUSIC - 1] = g(C.music);
    row[COLQ.STATUS - 1] = 'Ready';
    row[COLQ.APPROVAL - 1] = LP.IMPORT_AUTO_APPROVE ? 'Approved' : '';
    return row;
  });

  queue.getRange(queue.getLastRow() + 1, 1, out.length, COLQ.LAST_ERROR).setValues(out);

  const msg = 'استُوردت ' + out.length + ' فكرة إلى PUBLISH_QUEUE.\n\n' +
    'متبقٍ عليك لكل صف: تعبئة Scheduled_Date + Scheduled_Time_KSA،\n' +
    'ووضع Approval = Approved بعد مراجعة الوسائط' +
    (LP.IMPORT_AUTO_APPROVE ? '' : ' (الاستيراد لا يعتمد تلقائياً عمداً).');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* من المحرر */ }
  return out.length;
}
