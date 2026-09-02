/** ══════════════════════════════════════════════════════════════════
 *  AI SOCIAL MEDIA AUTOMATION — Hardened Edition v2.0
 *  نظام أتمتة النشر متعدد المنصات — نسخة مُصلَّحة ومؤمَّنة
 *  مخصص لعلامة: عبدالرحمن هوساوي | Abdulrahman Hawsawi
 *  LinkedIn + GitHub (أساسي) · Instagram / Facebook / X (اختياري)
 *  ────────────────────────────────────────────────────────────────
 *  قواعد ذهبية:
 *  1) لا تضع أي مفتاح أو توكن داخل هذا الملف إطلاقاً.
 *     المكان الصحيح: Project Settings ⚙️ ← Script Properties
 *  2) شغّل initializeSystem() مرة واحدة بعد اللصق.
 *  3) الدليل الكامل: automation/SETUP-AR.md
 * ══════════════════════════════════════════════════════════════════ */

const CONFIG = {
  // ── مجلدات Drive ──
  PENDING_FOLDER_ID: 'PENDING_FOLDER_ID',
  POSTED_FOLDER_ID: 'POSTED_FOLDER_ID',
  FAILED_FOLDER_ID: 'FAILED_FOLDER_ID',

  // ── أسماء أوراق الجدول ──
  MAIN_SHEET: 'Main Posts',
  SCHEDULING_SHEET: 'Scheduling',
  ANALYTICS_SHEET: 'Analytics',
  AB_TEST_SHEET: 'A/B Test Results',
  AI_SETTINGS_SHEET: 'AI Settings',
  DASHBOARD_SHEET: 'Dashboard',
  ERROR_LOG_SHEET: 'Error Log',

  // ── إعدادات عامة ──
  TIMEZONE: 'Asia/Riyadh',                 // توقيت الرياض (كان New_York في النسخة الأصلية)
  GRAPH_VERSION: 'v23.0',                  // إصدار Graph API — حدّثه دورياً من لوحة Meta
  LINKEDIN_API_VERSION: '202506',          // ترويسة LinkedIn-Version
  OPENAI_MODEL: 'gpt-4o-mini',             // كان gpt-4-turbo-preview (اسم مهجور)
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,

  // ── تفعيل المنصات: true = منشور فعلياً ──
  ENABLE_PLATFORMS: {
    github:   true,   // أرشفة في Issues + استضافة صور مجانية كـ CDN
    linkedin: true,   // المنصة الأساسية
    twitter:  false,  // اختياري — يتطلب OAuth 1.0a صحيحاً (مُنفَّذ أدناه)
    instagram:false,  // اختياري — حساب Business + توكن
    facebook: false   // اختياري — صفحة + توكن
  },

  // ── اختبار A/B (مُصمَّم داخل المنصة الواحدة — راجع الدليل) ──
  AB_TEST: {
    enabled: false,          // فعّله بعد استقرار النظام
    platform: 'linkedin',    // A/B داخل المنصة نفسها فقط (مقارنة عادلة)
    gapHours: 48,            // الفاصل بين النسختين A و B
    durationHours: 96        // مدة التقييم بعد نشر B
  }
};

/** المفاتيح السرية — تُقرأ من Script Properties فقط */
const SECRET_KEYS = [
  'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO',
  'LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_PERSON_URN',       // URN اختياري (يُكتشف تلقائياً)
  'TWITTER_API_KEY', 'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET',
  'FB_PAGE_ID', 'FB_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID',
  'OPENAI_API_KEY',
  'NOTIFICATION_EMAIL', 'SLACK_WEBHOOK'                 // SLACK_WEBHOOK اختياري
];

// ── فهارس أعمدة الجداول (المصدر الوحيد للحقيقة) ──
const COL = {
  MAIN: { POST_ID:1, TIMESTAMP:2, FILE_NAME:3, FILE_URL:4, STATUS:5, CAPTION:6, VAR_A:7, VAR_B:8, SCHEDULE:9,
          GITHUB:10, LINKEDIN:11, TWITTER:12, INSTAGRAM:13, FACEBOOK:14, WINNER:15, ENGAGEMENT:16 },
  SCHED: { POST_ID:1, TIME:2, TZ:3, PLATFORMS:4, STATUS:5, ACTUAL:6, VARIANT:7, CAPTION:8, FILE_ID:9 },
  ANAL:  { POST_ID:1, PLATFORM:2, URL:3, PLATFORM_POST_ID:4, LIKES:5, COMMENTS:6, SHARES:7, IMPRESSIONS:8,
           ENG_RATE:9, VARIANT:10, UPDATED:11 },
  AB:    { POST_ID:1, CAPTION_A:2, ENG_A:3, CAPTION_B:4, ENG_B:5, WINNER:6, CONFIDENCE:7, PLATFORM:8,
           STATUS:9, STARTED:10 }
};

/** قراءة قيمة من Script Properties مع قيمة احتياطية */
function prop(name, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  return (v === null || v === '') ? (fallback || '') : v;
}

/** إعادة المحاولة للعمليات الآمنة (قراءة/قياس) — لا تُستخدم مع النشر لتفادي التكرار */
function withRetry(fn, times) {
  const n = times || CONFIG.MAX_RETRIES;
  let lastErr;
  for (let i = 0; i < n; i++) {
    try { return fn(); }
    catch (e) {
      lastErr = e;
      if (i < n - 1) Utilities.sleep(CONFIG.RETRY_DELAY_MS * (i + 1));
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════
//  القائمة داخل الجدول — كل شيء من هنا
// ════════════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 الأتمتة')
    .addItem('🚀 التهيئة الأولى (إنشاء الجداول)', 'initializeSystem')
    .addItem('🔑 فحص المفاتيح', 'checkSecrets')
    .addSeparator()
    .addItem('▶️ مسح Drive والنشر الآن', 'scanDriveAndPost')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('🟣 Life Pulse')
      .addItem('🔌 اختبار الاتصال بالجدول', 'testLifePulseConnection')
      .addItem('📥 استيراد الأفكار المعتمدة (CONTENT_LIBRARY)', 'lpQueueApprovedIdeas')
      .addItem('▶️ معالجة الطابور الآن', 'processLifePulseQueue')
      .addItem('⏰ تثبيت مشغّل كل 10 دقائق', 'lpInstallTrigger'))
    .addItem('📈 تحديث التحليلات', 'refreshAnalytics')
    .addItem('🧪 تقييم اختبارات A/B', 'evaluateABTests')
    .addItem('📊 تحديث لوحة المعلومات', 'updateDashboard')
    .addSeparator()
    .addItem('⏰ تثبيت المشغّلات التلقائية', 'setupAllTriggers')
    .addToUi();
}

// ════════════════════════════════════════════════════════════════
//  التهيئة
// ════════════════════════════════════════════════════════════════
function initializeSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const headers = {
    [CONFIG.MAIN_SHEET]: ['Post ID', 'Timestamp', 'File Name', 'File URL', 'Status',
      'Caption (Primary)', 'Caption A', 'Caption B', 'Scheduled Time',
      'GitHub', 'LinkedIn', 'Twitter', 'Instagram', 'Facebook', 'Winner Caption', 'Total Engagement'],
    [CONFIG.SCHEDULING_SHEET]: ['Post ID', 'Scheduled DateTime', 'Timezone', 'Platforms',
      'Status', 'Actual Post Time', 'Variant', 'Caption', 'Drive File ID'],
    [CONFIG.ANALYTICS_SHEET]: ['Post ID', 'Platform', 'Post URL', 'Platform Post ID',
      'Likes', 'Comments', 'Shares', 'Impressions', 'Engagement Rate', 'Variant', 'Last Updated'],
    [CONFIG.AB_TEST_SHEET]: ['Post ID', 'Caption A', 'Engagement A', 'Caption B', 'Engagement B',
      'Winner', 'Confidence', 'Platform', 'Status', 'Started'],
    [CONFIG.AI_SETTINGS_SHEET]: ['Setting Name', 'Value', 'Description'],
    [CONFIG.ERROR_LOG_SHEET]: ['Timestamp', 'Source', 'Error Message', 'Stack Trace']
  };

  Object.keys(headers).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(headers[name]);
      sh.getRange(1, 1, 1, headers[name].length)
        .setFontWeight('bold').setBackground('#1c3a5e').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });

  // إعدادات الذكاء الاصطناعي — معايرة على علامتك الشخصية
  const ai = ss.getSheetByName(CONFIG.AI_SETTINGS_SHEET);
  ai.getRange(2, 1, 7, 3).setValues([
    ['Brand Name', 'عبدالرحمن هوساوي | Abdulrahman Hawsawi', 'اسم العلامة في التوليد'],
    ['Brand Context', 'أخصائي علاج طبيعي ورئيس قسم إعادة تأهيل في السعودية. محتوى قيادي: إعادة التأهيل، العمل العميق، التميز السريري، سلامة المريض.', 'خلفية العلامة'],
    ['Tone', 'Professional & Inspirational', 'نبرة الصياغة'],
    ['Style', 'Storytelling + Insight', 'أسلوب الصياغة'],
    ['Hashtags Count', '8', 'عدد الوسوم'],
    ['Emoji Usage', 'Light', 'None/Light/Moderate/Heavy'],
    ['Language', 'Arabic', 'لغة التعليق: Arabic أو English']
  ]);

  createDashboard();
  sendNotification('تمت التهيئة', 'النظام جاهز. الخطوة التالية: إضافة المفاتيح في Script Properties ثم فحص المفاتيح.', 'success');
}

/** فحص المفاتيح المطلوبة حسب المنصات المفعّلة — لا يطبع قيماً، فقط الحالة */
function checkSecrets() {
  const lines = [];
  const required = ['NOTIFICATION_EMAIL'];
  if (CONFIG.ENABLE_PLATFORMS.github) required.push('GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO');
  if (CONFIG.ENABLE_PLATFORMS.linkedin) required.push('LINKEDIN_ACCESS_TOKEN');
  if (CONFIG.ENABLE_PLATFORMS.twitter) required.push('TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET');
  if (CONFIG.ENABLE_PLATFORMS.instagram || CONFIG.ENABLE_PLATFORMS.facebook) required.push('FB_ACCESS_TOKEN');
  if (CONFIG.ENABLE_PLATFORMS.instagram) required.push('INSTAGRAM_ACCOUNT_ID');
  required.push('OPENAI_API_KEY');

  required.forEach(function(k) {
    const ok = prop(k) !== '';
    lines.push((ok ? '✅' : '❌') + '  ' + k);
  });

  const msg = 'حالة المفاتيح:\n' + lines.join('\n') +
    '\n\nالمكان الصحيح: Project Settings ⚙️ ← Script Properties';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* من محرر السكربت */ }
  return msg;
}

// ════════════════════════════════════════════════════════════════
//  المسح والنشر
// ════════════════════════════════════════════════════════════════
function scanDriveAndPost() {
  try {
    processScheduledPosts();
    const pending = DriveApp.getFolderById(CONFIG.PENDING_FOLDER_ID);
    const files = pending.getFiles();
    while (files.hasNext()) processFile(files.next());
    updateDashboard();
  } catch (error) {
    logError('scanDriveAndPost', error);
    sendNotification('خطأ في الأتمتة', String(error), 'error');
  }
}

/** قراءة وصف الملف: تعليق مخصص قبل سطر SCHEDULE: ووقت مجدول بعده */
function parseFileDescription(file) {
  const desc = '';
  let custom = null, schedule = null;
  let d = '';
  try { d = file.getDescription() || ''; } catch (e) { /* لا وصف */ }
  if (d.indexOf('SCHEDULE:') !== -1) {
    schedule = new Date(d.split('SCHEDULE:')[1].trim());
    d = d.split('SCHEDULE:')[0];
  }
  if (d.trim()) custom = d.trim();
  return { custom: custom, schedule: schedule };
}

function processFile(file) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MAIN_SHEET);
  const row = sh.getLastRow() + 1;
  const postId = 'POST_' + Date.now();
  const parsed = parseFileDescription(file);

  sh.getRange(row, COL.MAIN.POST_ID).setValue(postId);
  sh.getRange(row, COL.MAIN.TIMESTAMP).setValue(new Date());
  sh.getRange(row, COL.MAIN.FILE_NAME).setValue(file.getName());
  sh.getRange(row, COL.MAIN.FILE_URL).setValue(file.getUrl());
  sh.getRange(row, COL.MAIN.STATUS).setValue('Processing');

  try {
    const imageBlob = file.getBlob();
    const captions = parsed.custom
      ? { primary: parsed.custom, variantA: parsed.custom, variantB: parsed.custom, hashtags: [] }
      : generateAICaptions(file.getName(), imageBlob);

    if (parsed.schedule && parsed.schedule > new Date()) {
      schedulePost(postId, parsed.schedule, file.getId(), captions, 'PRIMARY', enabledPlatforms().join(','));
      sh.getRange(row, COL.MAIN.STATUS).setValue('⏰ Scheduled');
      sh.getRange(row, COL.MAIN.CAPTION).setValue(captions.primary);
      sh.getRange(row, COL.MAIN.VAR_A).setValue(captions.variantA || '');
      sh.getRange(row, COL.MAIN.VAR_B).setValue(captions.variantB || '');
      sh.getRange(row, COL.MAIN.SCHEDULE).setValue(parsed.schedule);
      return;
    }

    const results = postToAllPlatforms(postId, imageBlob, captions, 'A');
    writePlatformResults(row, results);

    // A/B: جدولة النسخة B على المنصة المستهدفة بعد الفاصل الزمني
    if (CONFIG.AB_TEST.enabled && captions.variantB && captions.variantB !== captions.primary) {
      const bTime = new Date(Date.now() + CONFIG.AB_TEST.gapHours * 3600 * 1000);
      schedulePost(postId + '_B', bTime, file.getId(),
        { primary: captions.variantB }, 'B', CONFIG.AB_TEST.platform);
      logABTest(postId, captions.variantA, captions.variantB);
    }

    sh.getRange(row, COL.MAIN.CAPTION).setValue(captions.primary);
    sh.getRange(row, COL.MAIN.VAR_A).setValue(captions.variantA || '');
    sh.getRange(row, COL.MAIN.VAR_B).setValue(captions.variantB || '');

    const allOk = enabledPlatforms().every(function(p) {
      return results.platforms[p] && results.platforms[p].success;
    });
    if (allOk) {
      moveFile(file, CONFIG.POSTED_FOLDER_ID);
      sh.getRange(row, COL.MAIN.STATUS).setValue('✅ Posted');
      sendNotification('تم النشر', file.getName(), 'success');
    } else {
      moveFile(file, CONFIG.FAILED_FOLDER_ID);
      sh.getRange(row, COL.MAIN.STATUS).setValue('⚠️ Partial');
      sendNotification('نشر جزئي', file.getName() + ' — راجع Error Log', 'warning');
    }
  } catch (error) {
    sh.getRange(row, COL.MAIN.STATUS).setValue('❌ Failed');
    logError('processFile: ' + file.getName(), error);
    try { moveFile(file, CONFIG.FAILED_FOLDER_ID); } catch (e2) { /* */ }
  }
}

function enabledPlatforms() {
  return Object.keys(CONFIG.ENABLE_PLATFORMS).filter(function(p) { return CONFIG.ENABLE_PLATFORMS[p]; });
}

function writePlatformResults(row, results) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MAIN_SHEET);
  const map = { github: COL.MAIN.GITHUB, linkedin: COL.MAIN.LINKEDIN, twitter: COL.MAIN.TWITTER,
                instagram: COL.MAIN.INSTAGRAM, facebook: COL.MAIN.FACEBOOK };
  Object.keys(results.platforms).forEach(function(p) {
    const r = results.platforms[p];
    sh.getRange(row, map[p]).setValue(r.success ? '✅' : '❌');
  });
  const total = Object.keys(results.platforms).reduce(function(s, p) {
    return s + (results.platforms[p].success ? 1 : 0);
  }, 0);
  sh.getRange(row, COL.MAIN.ENGAGEMENT).setValue(total + '/' + enabledPlatforms().length);
}

// ════════════════════════════════════════════════════════════════
//  توليد التعليقات بالذكاء الاصطناعي
// ════════════════════════════════════════════════════════════════
function getAISettings() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.AI_SETTINGS_SHEET);
  const s = {};
  if (sh && sh.getLastRow() > 1) {
    sh.getDataRange().getValues().slice(1).forEach(function(r) {
      if (r[0]) s[String(r[0]).toLowerCase().replace(/\s+/g, '')] = String(r[1] || '');
    });
  }
  return {
    brandName: s.brandname || 'عبدالرحمن هوساوي | Abdulrahman Hawsawi',
    brandContext: s.brandcontext || 'أخصائي علاج طبيعي ورئيس قسم إعادة تأهيل في السعودية.',
    tone: s.tone || 'Professional & Inspirational',
    style: s.style || 'Storytelling + Insight',
    hashtagsCount: parseInt(s.hashtagscount, 10) || 8,
    emojiUsage: s.emojiusage || 'Light',
    language: s.language || 'Arabic'
  };
}

function buildPrompt(fileName, settings) {
  return 'You are the personal-brand copywriter for "' + settings.brandName + '" (' + settings.brandContext + ').\n' +
    'Write 3 social-media captions for a new post (source image file: "' + fileName + '").\n' +
    'Rules:\n' +
    '- Tone: ' + settings.tone + '\n' +
    '- Style: ' + settings.style + '\n' +
    '- Language: ' + settings.language + ' (write the captions fully in this language)\n' +
    '- Emojis: ' + settings.emojiUsage + '\n' +
    '- Put exactly ' + settings.hashtagsCount + ' relevant hashtags at the end of each caption\n' +
    '- LinkedIn-first: the FIRST line must be a strong hook (visible before "…see more"), then short single-line paragraphs, then a closing question that invites comments\n' +
    '- Primary caption max 1300 characters; each variant must take a genuinely different angle\n\n' +
    'Return ONLY valid JSON: {"primary":"...","variantA":"...","variantB":"...","hashtags":["..."]}';
}

function generateAICaptions(fileName, imageBlob) {
  try {
    const settings = getAISettings();
    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + prop('OPENAI_API_KEY'),
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        model: CONFIG.OPENAI_MODEL,
        messages: [{ role: 'user', content: buildPrompt(fileName, settings) }],
        temperature: 0.9,
        response_format: { type: 'json_object' },
        max_tokens: 1500
      }),
      muteHttpExceptions: true
    });
    const data = JSON.parse(response.getContentText());
    let txt = data.choices[0].message.content;
    if (txt.indexOf('```') !== -1) txt = txt.split('```')[1].replace(/^json\n?/, '');
    const c = JSON.parse(txt.trim());
    return { primary: c.primary, variantA: c.variantA, variantB: c.variantB, hashtags: c.hashtags || [] };
  } catch (error) {
    logError('AI Caption Generation', error);
    return {
      primary: 'بعد ٢٠ عاماً في إعادة التأهيل… تعلمت أن العمق يصنع الفرق. 🎯\n\nما رأيك؟\n\n#إعادة_التأهيل #التميز_السريري #قيادة_الرعاية_الصحية',
      variantA: 'فكرة جديدة أشاركها معكم اليوم — أتطلع لقراءاتكم. 📌\n\n#العلاج_الطبيعي #العمل_العميق',
      variantB: 'خلاصة تجربة عملية أودّ تقاسمها معكم. 🌟\n\n#صحة_السعودية #قيادة'
    };
  }
}

// ════════════════════════════════════════════════════════════════
//  النشر متعدد المنصات
// ════════════════════════════════════════════════════════════════
function postToAllPlatforms(postId, imageBlob, captions, variantTag) {
  const results = { postId: postId, platforms: {} };
  enabledPlatforms().forEach(function(p) {
    const caption = (CONFIG.AB_TEST.enabled && CONFIG.AB_TEST.platform === p && captions.variantA && variantTag === 'A')
      ? captions.variantA : captions.primary;
    results.platforms[p] = postToPlatform(p, imageBlob, caption, postId);
  });
  startAnalyticsTracking(postId, results, variantTag);
  return results;
}

function postToPlatform(platform, imageBlob, caption, postId) {
  try {
    switch (platform) {
      case 'github':    return postToGitHub(imageBlob, caption, postId);
      case 'linkedin':  return postToLinkedIn(imageBlob, caption, postId);
      case 'twitter':   return postToTwitter(imageBlob, caption, postId);
      case 'instagram': return postToInstagram(imageBlob, caption, postId);
      case 'facebook':  return postToFacebook(imageBlob, caption, postId);
      default: return { success: false, url: '', postId: '', platform: platform };
    }
  } catch (error) {
    logError('postToPlatform: ' + platform, error);
    return { success: false, url: '', postId: '', platform: platform };
  }
}

// ── GitHub: أرشفة في Issues + رفع الصورة كمصدر عام (CDN) ──
function getGithubDefaultBranch() {
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + prop('GITHUB_OWNER') + '/' + prop('GITHUB_REPO'), {
    headers: { 'Authorization': 'token ' + prop('GITHUB_TOKEN'), 'Accept': 'application/vnd.github.v3+json' },
    muteHttpExceptions: true
  });
  return JSON.parse(r.getContentText()).default_branch || 'main';
}

/** يرفع الصورة إلى المستودع ويعيد رابط raw عام — يُستخدم كـ image_url لإنستغرام */
function uploadImageToGitHub(fileName, imageBlob) {
  const branch = getGithubDefaultBranch();
  const safe = String(fileName).replace(/[^\w.\-]+/g, '-');
  const path = 'posters/' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd/HHmmss') + '-' + safe;
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + prop('GITHUB_OWNER') + '/' + prop('GITHUB_REPO') + '/contents/' + path, {
      method: 'put',
      headers: { 'Authorization': 'token ' + prop('GITHUB_TOKEN'), 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      payload: JSON.stringify({ message: 'Auto-poster image', content: Utilities.base64Encode(imageBlob.getBytes()), branch: branch }),
      muteHttpExceptions: true
    });
  if (res.getResponseCode() >= 300) throw new Error('GitHub upload failed: ' + res.getContentText());
  return 'https://raw.githubusercontent.com/' + prop('GITHUB_OWNER') + '/' + prop('GITHUB_REPO') + '/' + branch + '/' + path;
}

function postToGitHub(imageBlob, caption, postId) {
  try {
    const imageUrl = uploadImageToGitHub('poster-' + postId + '.png', imageBlob);
    const res = UrlFetchApp.fetch(
      'https://api.github.com/repos/' + prop('GITHUB_OWNER') + '/' + prop('GITHUB_REPO') + '/issues', {
        method: 'post',
        headers: { 'Authorization': 'token ' + prop('GITHUB_TOKEN'), 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        payload: JSON.stringify({
          title: 'Poster — ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'),
          body: caption + '\n\n![Poster](' + imageUrl + ')\n\nPost ID: ' + postId,
          labels: ['auto-posted']
        }),
        muteHttpExceptions: true
      });
    const data = JSON.parse(res.getContentText());
    if (res.getResponseCode() >= 300) throw new Error(res.getContentText());
    return { success: true, url: data.html_url, postId: String(data.number), platform: 'github' };
  } catch (error) {
    logError('GitHub', error);
    return { success: false, url: '', postId: '', platform: 'github' };
  }
}

// ── LinkedIn ──
function getLinkedInUrn() {
  let urn = prop('LINKEDIN_PERSON_URN');
  if (urn) return urn;
  const r = UrlFetchApp.fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': 'Bearer ' + prop('LINKEDIN_ACCESS_TOKEN') },
    muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) throw new Error('LinkedIn userinfo failed (أضف منتج "Sign In with LinkedIn using OpenID Connect" ثم أعده): ' + r.getContentText());
  urn = 'urn:li:person:' + JSON.parse(r.getContentText()).sub;
  PropertiesService.getScriptProperties().setProperty('LINKEDIN_PERSON_URN', urn);
  return urn;
}

function postToLinkedIn(imageBlob, caption, postId) {
  try {
    const owner = getLinkedInUrn();
    const token = prop('LINKEDIN_ACCESS_TOKEN');
    const baseHeaders = {
      'Authorization': 'Bearer ' + token,
      'X-Restli-Protocol-Version': '2.0.0',
      'LinkedIn-Version': CONFIG.LINKEDIN_API_VERSION
    };

    // 1) تسجيل رفع الصورة
    const reg = UrlFetchApp.fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'post',
      headers: Object.assign({ 'Content-Type': 'application/json' }, baseHeaders),
      payload: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: owner,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }]
        }
      }),
      muteHttpExceptions: true
    });
    if (reg.getResponseCode() >= 300) throw new Error('registerUpload: ' + reg.getContentText());
    const regData = JSON.parse(reg.getContentText());
    const uploadUrl = regData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = regData.value.asset;

    // 2) رفع بايتات الصورة
    const up = UrlFetchApp.fetch(uploadUrl, {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: imageBlob.getBytes(),
      muteHttpExceptions: true
    });
    if (up.getResponseCode() >= 300) throw new Error('asset upload: ' + up.getContentText());

    // 3) إنشاء المنشور
    const post = UrlFetchApp.fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'post',
      headers: Object.assign({ 'Content-Type': 'application/json' }, baseHeaders),
      payload: JSON.stringify({
        author: owner,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: caption },
            shareMediaCategory: 'IMAGE',
            media: [{ status: 'READY', media: asset }]
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      }),
      muteHttpExceptions: true
    });
    if (post.getResponseCode() >= 300) throw new Error('ugcPosts: ' + post.getContentText());
    const urn = JSON.parse(post.getContentText()).id;
    return { success: true, url: 'https://www.linkedin.com/feed/update/' + urn, postId: urn, platform: 'linkedin' };
  } catch (error) {
    logError('LinkedIn', error);
    return { success: false, url: '', postId: '', platform: 'linkedin' };
  }
}

// ── Twitter/X — توقيع OAuth 1.0a كامل (كان ناقصاً في النسخة الأصلية) ──
function pct(s) {
  return encodeURIComponent(String(s)).replace(/[!'()*]/g, function(c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

function twitterOAuthHeader(method, url, formParams) {
  const oauth = {
    oauth_consumer_key: prop('TWITTER_API_KEY'),
    oauth_nonce: Utilities.getUuid().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: prop('TWITTER_ACCESS_TOKEN'),
    oauth_version: '1.0'
  };
  const all = {};
  Object.keys(formParams || {}).forEach(function(k) { all[k] = formParams[k]; });
  Object.keys(oauth).forEach(function(k) { all[k] = oauth[k]; });
  const baseParams = Object.keys(all).sort().map(function(k) { return pct(k) + '=' + pct(all[k]); }).join('&');
  const baseUrl = url.split('?')[0];
  const baseString = [method.toUpperCase(), pct(baseUrl), pct(baseParams)].join('&');
  const signingKey = pct(prop('TWITTER_API_SECRET')) + '&' + pct(prop('TWITTER_ACCESS_SECRET'));
  oauth.oauth_signature = Utilities.base64Encode(Utilities.computeHmacSha1Signature(baseString, signingKey));
  return 'OAuth ' + Object.keys(oauth).sort().map(function(k) { return pct(k) + '="' + pct(oauth[k]) + '"'; }).join(', ');
}

function postToTwitter(imageBlob, caption, postId) {
  try {
    const b64 = Utilities.base64Encode(imageBlob.getBytes());
    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
    const mediaRes = UrlFetchApp.fetch(uploadUrl, {
      method: 'post',
      headers: { 'Authorization': twitterOAuthHeader('POST', uploadUrl, { media_data: b64 }) },
      payload: { media_data: b64 },
      muteHttpExceptions: true
    });
    if (mediaRes.getResponseCode() >= 300) throw new Error('media upload: ' + mediaRes.getContentText());
    const mediaId = JSON.parse(mediaRes.getContentText()).media_id_string;

    const tweetUrl = 'https://api.twitter.com/2/tweets';
    const tweetRes = UrlFetchApp.fetch(tweetUrl, {
      method: 'post',
      headers: { 'Authorization': twitterOAuthHeader('POST', tweetUrl, {}), 'Content-Type': 'application/json' },
      payload: JSON.stringify({ text: caption.substring(0, 280), media: { media_ids: [mediaId] } }),
      muteHttpExceptions: true
    });
    if (tweetRes.getResponseCode() >= 300) throw new Error('tweet: ' + tweetRes.getContentText());
    const tweetId = JSON.parse(tweetRes.getContentText()).data.id;
    return { success: true, url: 'https://twitter.com/i/web/status/' + tweetId, postId: tweetId, platform: 'twitter' };
  } catch (error) {
    logError('Twitter', error);
    return { success: false, url: '', postId: '', platform: 'twitter' };
  }
}

// ── Instagram (يتطلب صورة على رابط عام — يرفعها إلى GitHub أولاً) ──
function postToInstagram(imageBlob, caption, postId) {
  try {
    const igId = prop('INSTAGRAM_ACCOUNT_ID');
    const token = prop('FB_ACCESS_TOKEN');
    const base = 'https://graph.facebook.com/' + CONFIG.GRAPH_VERSION;
    const publicUrl = uploadImageToGitHub('ig-' + postId + '.png', imageBlob); // المستودع يجب أن يكون عاماً

    const up = UrlFetchApp.fetch(base + '/' + igId + '/media', {
      method: 'post',
      payload: { image_url: publicUrl, caption: caption, access_token: token },
      muteHttpExceptions: true
    });
    if (up.getResponseCode() >= 300) throw new Error('IG create container: ' + up.getContentText());
    const creationId = JSON.parse(up.getContentText()).id;

    Utilities.sleep(5000); // معالجة الحاوية
    const pub = UrlFetchApp.fetch(base + '/' + igId + '/media_publish', {
      method: 'post',
      payload: { creation_id: creationId, access_token: token },
      muteHttpExceptions: true
    });
    if (pub.getResponseCode() >= 300) throw new Error('IG publish: ' + pub.getContentText());
    const mediaId = JSON.parse(pub.getContentText()).id;

    let permalink = 'https://www.instagram.com/';
    try {
      const pf = UrlFetchApp.fetch(base + '/' + mediaId + '?fields=permalink&access_token=' + token, { muteHttpExceptions: true });
      permalink = JSON.parse(pf.getContentText()).permalink || permalink;
    } catch (e) { /* الرابط ليس حرجاً */ }
    return { success: true, url: permalink, postId: mediaId, platform: 'instagram' };
  } catch (error) {
    logError('Instagram', error);
    return { success: false, url: '', postId: '', platform: 'instagram' };
  }
}

// ── Facebook (رفع ثنائي مباشر — البارامتر الصحيح message وليس caption) ──
function postToFacebook(imageBlob, caption, postId) {
  try {
    const base = 'https://graph.facebook.com/' + CONFIG.GRAPH_VERSION;
    const res = UrlFetchApp.fetch(base + '/' + prop('FB_PAGE_ID') + '/photos', {
      method: 'post',
      payload: {
        source: imageBlob,
        message: caption,
        published: true,
        access_token: prop('FB_ACCESS_TOKEN')
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) throw new Error('FB photo: ' + res.getContentText());
    const data = JSON.parse(res.getContentText());
    const id = data.post_id || data.id;
    return { success: true, url: 'https://www.facebook.com/' + id, postId: String(id), platform: 'facebook' };
  } catch (error) {
    logError('Facebook', error);
    return { success: false, url: '', postId: '', platform: 'facebook' };
  }
}

// ════════════════════════════════════════════════════════════════
//  الجدولة
// ════════════════════════════════════════════════════════════════
function schedulePost(postId, scheduledTime, driveFileId, captions, variant, platforms) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SCHEDULING_SHEET).appendRow([
    postId, scheduledTime, CONFIG.TIMEZONE, platforms || enabledPlatforms().join(','), 'Pending', '',
    variant || 'PRIMARY', captions.primary, driveFileId
  ]);
  sendNotification('منشور مجدول', postId + ' → ' + scheduledTime, 'info');
}

function processScheduledPosts() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SCHEDULING_SHEET);
  if (sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[COL.SCHED.STATUS - 1] !== 'Pending') continue;
    const due = new Date(row[COL.SCHED.TIME - 1]);
    if (due > now) continue;

    const postId = row[COL.SCHED.POST_ID - 1];
    const variant = row[COL.SCHED.VARIANT - 1] || 'PRIMARY';
    const captionText = row[COL.SCHED.CAPTION - 1];
    const fileId = row[COL.SCHED.FILE_ID - 1];

    try {
      const imageBlob = DriveApp.getFileById(fileId).getBlob();
      const captions = { primary: captionText, variantA: null, variantB: null };
      const targetPlatform = row[COL.SCHED.PLATFORMS - 1] || enabledPlatforms().join(',');

      let results;
      if (variant === 'B') {
        // منشور B لاختبار A/B — على المنصة المستهدفة فقط
        const r = postToPlatform(CONFIG.AB_TEST.platform, imageBlob, captionText, postId);
        results = { postId: postId, platforms: {} };
        results.platforms[CONFIG.AB_TEST.platform] = r;
        startAnalyticsTracking(postId, results, 'B');
      } else {
        results = postToAllPlatforms(postId, imageBlob, captions, 'A');
      }

      sh.getRange(i + 1, COL.SCHED.STATUS).setValue('Posted');
      sh.getRange(i + 1, COL.SCHED.ACTUAL).setValue(new Date());

      // تحديث خلايا المنصات في الجدول الرئيسي (للمجدول الأساسي فقط)
      if (variant !== 'B') {
        const mainSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MAIN_SHEET);
        const mainRow = findRowByPostId(mainSh, postId);
        if (mainRow) writePlatformResults(mainRow, results);
      }
      sendNotification('نُشر المنشور المجدول', String(postId), 'success');
    } catch (error) {
      sh.getRange(i + 1, COL.SCHED.STATUS).setValue('Failed');
      logError('Scheduled post ' + postId, error);
    }
  }
}

function findRowByPostId(sh, postId) {
  if (sh.getLastRow() < 2) return null;
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.MAIN.POST_ID - 1] === postId) return i + 1;
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
//  التحليلات
// ════════════════════════════════════════════════════════════════
function startAnalyticsTracking(postId, results, variant) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ANALYTICS_SHEET);
  Object.keys(results.platforms).forEach(function(p) {
    const r = results.platforms[p];
    if (!r.success) return;
    sh.appendRow([postId, p, r.url, r.postId, 0, 0, 0, 0, '0%', variant || 'PRIMARY', new Date()]);
  });
}

function refreshAnalytics() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ANALYTICS_SHEET);
  if (sh.getLastRow() < 2) return;
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const platform = data[i][COL.ANAL.PLATFORM - 1];
    const platformPostId = data[i][COL.ANAL.PLATFORM_POST_ID - 1]; // ← كان يقرأ رابط المنشور خطأً
    if (!platformPostId) continue;
    try {
      const m = withRetry(function() { return fetchPlatformMetrics(platform, String(platformPostId)); }, 2);
      if (!m) continue;
      sh.getRange(i + 1, COL.ANAL.LIKES).setValue(m.likes || 0);
      sh.getRange(i + 1, COL.ANAL.COMMENTS).setValue(m.comments || 0);
      sh.getRange(i + 1, COL.ANAL.SHARES).setValue(m.shares || 0);
      sh.getRange(i + 1, COL.ANAL.IMPRESSIONS).setValue(m.impressions || 0);
      const eng = (m.likes || 0) + (m.comments || 0) + (m.shares || 0);
      const rate = m.impressions > 0 ? ((eng / m.impressions) * 100).toFixed(2) + '%' : '—';
      sh.getRange(i + 1, COL.ANAL.ENG_RATE).setValue(rate);
      sh.getRange(i + 1, COL.ANAL.UPDATED).setValue(new Date());
    } catch (error) {
      logError('refreshAnalytics: ' + platform, error);
    }
  }
  evaluateABTests();
}

function fetchPlatformMetrics(platform, id) {
  switch (platform) {
    case 'instagram':  return fetchInstagramMetrics(id);
    case 'facebook':   return fetchFacebookMetrics(id);
    case 'linkedin':   return fetchLinkedInMetrics(id);
    case 'twitter':    return fetchTwitterMetrics(id);
    case 'github':     return fetchGitHubMetrics(id);
    default: return null;
  }
}

function fetchInstagramMetrics(mediaId) {
  const base = 'https://graph.facebook.com/' + CONFIG.GRAPH_VERSION;
  const res = UrlFetchApp.fetch(base + '/' + mediaId + '?fields=like_count,comments_count&access_token=' + prop('FB_ACCESS_TOKEN'), { muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error(res.getContentText());
  const d = JSON.parse(res.getContentText());
  let impressions = 0;
  try {
    const ins = UrlFetchApp.fetch(base + '/' + mediaId + '/insights?metric=impressions&access_token=' + prop('FB_ACCESS_TOKEN'), { muteHttpExceptions: true });
    const di = JSON.parse(ins.getContentText());
    impressions = di.data && di.data[0] ? di.data[0].values[0].value : 0;
  } catch (e) { /* some accounts lack insights */ }
  return { likes: d.like_count || 0, comments: d.comments_count || 0, shares: 0, impressions: impressions };
}

function fetchFacebookMetrics(postId) {
  const base = 'https://graph.facebook.com/' + CONFIG.GRAPH_VERSION;
  const res = UrlFetchApp.fetch(base + '/' + postId + '?fields=likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions)&access_token=' + prop('FB_ACCESS_TOKEN'), { muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error(res.getContentText());
  const d = JSON.parse(res.getContentText());
  let impressions = 0;
  try { impressions = d.insights.data[0].values[0].value; } catch (e) { /* */ }
  return {
    likes: (d.likes && d.likes.summary) ? d.likes.summary.total_count : 0,
    comments: (d.comments && d.comments.summary) ? d.comments.summary.total_count : 0,
    shares: d.shares ? d.shares.count : 0,
    impressions: impressions
  };
}

function fetchLinkedInMetrics(postUrn) {
  const res = UrlFetchApp.fetch('https://api.linkedin.com/v2/socialActions/' + encodeURIComponent(postUrn), {
    headers: { 'Authorization': 'Bearer ' + prop('LINKEDIN_ACCESS_TOKEN'), 'X-Restli-Protocol-Version': '2.0.0', 'LinkedIn-Version': CONFIG.LINKEDIN_API_VERSION },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error(res.getContentText());
  const d = JSON.parse(res.getContentText());
  return {
    likes: (d.likesSummary && d.likesSummary.totalLikes) || 0,
    comments: (d.commentsSummary && d.commentsSummary.totalComments) || 0,
    shares: (d.sharesSummary && d.sharesSummary.totalShares) || 0,
    impressions: 0 // انطباعات LinkedIn تتطلب وصولاً لتحليلات الصفحة — نستخدم التفاعل الخام
  };
}

function fetchTwitterMetrics(tweetId) {
  const url = 'https://api.twitter.com/2/tweets/' + tweetId + '?tweet.fields=public_metrics';
  // بارامترات الاستعلام تدخل في التوقيع (متطلب OAuth 1.0a)
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': twitterOAuthHeader('GET', 'https://api.twitter.com/2/tweets/' + tweetId, { 'tweet.fields': 'public_metrics' }) },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error(res.getContentText());
  const m = JSON.parse(res.getContentText()).data.public_metrics;
  return { likes: m.like_count || 0, comments: m.reply_count || 0, shares: m.retweet_count || 0, impressions: m.impression_count || 0 };
}

function fetchGitHubMetrics(issueNumber) {
  const url = 'https://api.github.com/repos/' + prop('GITHUB_OWNER') + '/' + prop('GITHUB_REPO') + '/issues/' + issueNumber;
  const res = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': 'token ' + prop('GITHUB_TOKEN'), 'Accept': 'application/vnd.github.v3+json' },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error(res.getContentText());
  const d = JSON.parse(res.getContentText());
  return { likes: (d.reactions && d.reactions['+1']) || 0, comments: d.comments || 0, shares: 0, impressions: 0 };
}

// ════════════════════════════════════════════════════════════════
//  اختبار A/B — داخل المنصة نفسها (مقارنة عادلة)
// ════════════════════════════════════════════════════════════════
function logABTest(postId, captionA, captionB) {
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.AB_TEST_SHEET).appendRow([
    postId, captionA, 0, captionB, 0, 'Testing', '—', CONFIG.AB_TEST.platform, 'Testing', new Date()
  ]);
}

function evaluateABTests() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.AB_TEST_SHEET);
  if (sh.getLastRow() < 2) return;
  const analyticsSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.ANALYTICS_SHEET);
  const analytics = analyticsSh.getDataRange().getValues();
  const rows = sh.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][COL.AB.STATUS - 1] !== 'Testing') continue;
    const postId = rows[i][COL.AB.POST_ID - 1];
    const platform = rows[i][COL.AB.PLATFORM - 1];
    const started = new Date(rows[i][COL.AB.STARTED - 1]);
    const hoursPassed = (Date.now() - started.getTime()) / 3600000;
    if (hoursPassed < CONFIG.AB_TEST.durationHours) continue;

    const agg = function(filterPostId) {
      let eng = 0, imp = 0;
      analytics.forEach(function(r) {
        if (r[COL.ANAL.POST_ID - 1] === filterPostId && r[COL.ANAL.PLATFORM - 1] === platform) {
          eng += Number(r[COL.ANAL.LIKES - 1] || 0) + Number(r[COL.ANAL.COMMENTS - 1] || 0) + Number(r[COL.ANAL.SHARES - 1] || 0);
          imp += Number(r[COL.ANAL.IMPRESSIONS - 1] || 0);
        }
      });
      return { eng: eng, imp: imp };
    };

    const a = agg(postId);          // النسخة A
    const b = agg(postId + '_B');   // النسخة B

    if (b.eng === 0 && a.eng === 0 && b.imp === 0 && a.imp === 0) continue; // لا بيانات بعد

    // مقياس عادل: معدل التفاعل عند توفر الانطباعات، وإلا التفاعل الخام
    const rateA = a.imp > 0 ? a.eng / a.imp : a.eng;
    const rateB = b.imp > 0 ? b.eng / b.imp : b.eng;
    const winner = rateA >= rateB ? 'Caption A' : 'Caption B';
    const maxR = Math.max(rateA, rateB);
    const confidence = maxR > 0 ? (Math.abs(rateA - rateB) / maxR * 100).toFixed(1) + '%' : '—';

    sh.getRange(i + 1, COL.AB.ENG_A).setValue(a.eng);
    sh.getRange(i + 1, COL.AB.ENG_B).setValue(b.eng);
    sh.getRange(i + 1, COL.AB.WINNER).setValue(winner);
    sh.getRange(i + 1, COL.AB.CONFIDENCE).setValue(confidence);
    sh.getRange(i + 1, COL.AB.STATUS).setValue('Done');

    // كتابة التعليق الفائز في الجدول الرئيسي (كان لا يجد الصف أبداً في النسخة الأصلية)
    const mainSh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.MAIN_SHEET);
    const mainRow = findRowByPostId(mainSh, postId);
    if (mainRow) {
      mainSh.getRange(mainRow, COL.MAIN.WINNER).setValue(winner === 'Caption A' ? rows[i][COL.AB.CAPTION_A - 1] : rows[i][COL.AB.CAPTION_B - 1]);
    }
  }
}

// ════════════════════════════════════════════════════════════════
//  لوحة المعلومات
// ════════════════════════════════════════════════════════════════
function createDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let d = ss.getSheetByName(CONFIG.DASHBOARD_SHEET);
  if (!d) d = ss.insertSheet(CONFIG.DASHBOARD_SHEET);
  d.clear();

  d.getRange('A1:F1').merge().setValue('📊 لوحة أتمتة النشر — عبدالرحمن هوساوي');
  d.getRange('A1:F1').setBackground('#1c3a5e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(16).setHorizontalAlignment('center');

  const main = (ss.getSheetByName(CONFIG.MAIN_SHEET) || { getLastRow: function() { return 1; } }).getLastRow() - 1;
  const schedSh = ss.getSheetByName(CONFIG.SCHEDULING_SHEET);
  const sched = schedSh.getLastRow() > 1 ? schedSh.getDataRange().getValues() : [];
  const analSh = ss.getSheetByName(CONFIG.ANALYTICS_SHEET);
  const anal = analSh.getLastRow() > 1 ? analSh.getDataRange().getValues() : [];
  const abSh = ss.getSheetByName(CONFIG.AB_TEST_SHEET);
  const ab = abSh.getLastRow() > 1 ? abSh.getDataRange().getValues() : [];
  const mainSh = ss.getSheetByName(CONFIG.MAIN_SHEET);
  const mainData = mainSh.getLastRow() > 1 ? mainSh.getDataRange().getValues() : [];

  d.getRange('A3').setValue('📝 إحصاءات النشر').setFontWeight('bold').setFontSize(13);
  const posted = mainData.filter(function(r) { return String(r[COL.MAIN.STATUS - 1]).indexOf('✅') === 0; }).length;
  const failed = mainData.filter(function(r) { return String(r[COL.MAIN.STATUS - 1]).indexOf('❌') === 0; }).length;
  const partial = mainData.filter(function(r) { return String(r[COL.MAIN.STATUS - 1]).indexOf('⚠️') === 0; }).length;
  const scheduled = sched.filter(function(r) { return r[COL.SCHED.STATUS - 1] === 'Pending'; }).length;
  d.getRange('A4:B8').setValues([
    ['إجمالي المنشورات:', main], ['✅ ناجحة:', posted], ['⚠️ جزئية:', partial],
    ['❌ فاشلة:', failed], ['⏰ مجدولة:', scheduled]
  ]);
  if (main > 0) d.getRange('B9').setValue('نسبة النجاح: ' + ((posted / main) * 100).toFixed(0) + '%');

  d.getRange('D3').setValue('🌐 أداء المنصات').setFontWeight('bold').setFontSize(13);
  d.getRange('D4:F4').setValues([['المنصة', 'منشورات', 'تفاعل']]);
  d.getRange('D4:F4').setFontWeight('bold');
  const platforms = ['linkedin', 'github', 'twitter', 'instagram', 'facebook'];
  const stats = platforms.map(function(p) {
    const rowsP = anal.filter(function(r) { return r[COL.ANAL.PLATFORM - 1] === p; });
    const eng = rowsP.reduce(function(s, r) {
      return s + Number(r[COL.ANAL.LIKES - 1] || 0) + Number(r[COL.ANAL.COMMENTS - 1] || 0) + Number(r[COL.ANAL.SHARES - 1] || 0);
    }, 0);
    return [p, rowsP.length, eng];
  });
  d.getRange(5, 4, stats.length, 3).setValues(stats);

  d.getRange('A12').setValue('🧪 اختبارات A/B').setFontWeight('bold').setFontSize(13);
  const done = ab.filter(function(r) { return r[COL.AB.STATUS - 1] === 'Done'; });
  const aWins = done.filter(function(r) { return r[COL.AB.WINNER - 1] === 'Caption A'; }).length;
  d.getRange('A13:B15').setValues([
    ['اختبارات مكتملة:', done.length],
    ['فوز A:', aWins],
    ['فوز B:', done.length - aWins]
  ]);

  d.getRange('A17').setValue('⏱️ آخر النشاطات').setFontWeight('bold').setFontSize(13);
  d.getRange('A18:C18').setValues([['التاريخ', 'الملف', 'الحالة']]);
  d.getRange('A18:C18').setFontWeight('bold');
  const recent = mainData.slice(-5).reverse().map(function(r) {
    const t = r[COL.MAIN.TIMESTAMP - 1];
    return [t ? Utilities.formatDate(new Date(t), CONFIG.TIMEZONE, 'MM/dd HH:mm') : '', r[COL.MAIN.FILE_NAME - 1], r[COL.MAIN.STATUS - 1]];
  });
  if (recent.length) d.getRange(19, 1, recent.length, 3).setValues(recent);

  d.getRange('D17').setValue('📅 المنشورات القادمة').setFontWeight('bold').setFontSize(13);
  d.getRange('D18:E18').setValues([['الوقت', 'Post ID']]);
  d.getRange('D18:E18').setFontWeight('bold');
  const upcoming = sched.filter(function(r) { return r[COL.SCHED.STATUS - 1] === 'Pending' && new Date(r[COL.SCHED.TIME - 1]) > new Date(); })
    .sort(function(x, y) { return new Date(x[COL.SCHED.TIME - 1]) - new Date(y[COL.SCHED.TIME - 1]); })
    .slice(0, 5)
    .map(function(r) { return [Utilities.formatDate(new Date(r[COL.SCHED.TIME - 1]), CONFIG.TIMEZONE, 'MM/dd HH:mm'), r[COL.SCHED.POST_ID - 1]]; });
  if (upcoming.length) d.getRange(19, 4, upcoming.length, 2).setValues(upcoming);

  d.getRange('A26').setValue('آخر تحديث:').setFontWeight('bold');
  d.getRange('B26').setValue(new Date());
  d.autoResizeColumns(1, 6);
}

function updateDashboard() { createDashboard(); }

// ════════════════════════════════════════════════════════════════
//  أدوات مساعدة
// ════════════════════════════════════════════════════════════════
function moveFile(file, targetFolderId) {
  file.moveTo(DriveApp.getFolderById(targetFolderId)); // واجهة حديثة بدل removeFile/addFile المهجورة
}

function logError(source, error) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONFIG.ERROR_LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.ERROR_LOG_SHEET);
    sh.appendRow(['Timestamp', 'Source', 'Error Message', 'Stack Trace']);
  }
  sh.appendRow([new Date(), source, String(error), (error && error.stack) || 'N/A']);
  Logger.log(source + ': ' + error);
}

function sendNotification(subject, message, type) {
  const emoji = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const email = prop('NOTIFICATION_EMAIL');
  let sheetUrl = '';
  try { sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl() || ''; } catch (e) { /* standalone script */ }
  const body = message + '\n\nالوقت: ' + new Date() + '\nالجدول: ' + sheetUrl;
  if (email) {
    try { MailApp.sendEmail(email, (emoji[type] || '') + ' أتمتة النشر: ' + subject, body); }
    catch (e) { logError('sendNotification', e); }
  }
  const hook = prop('SLACK_WEBHOOK');
  if (hook) {
    try {
      UrlFetchApp.fetch(hook, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ text: (emoji[type] || '') + ' *' + subject + '*\n' + message })
      });
    } catch (e) { logError('Slack', e); }
  }
}

// ════════════════════════════════════════════════════════════════
//  المشغّلات التلقائية
// ════════════════════════════════════════════════════════════════
function setupAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('scanDriveAndPost').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('refreshAnalytics').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('updateDashboard').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('evaluateABTests').timeBased().atHour(20).everyDays(1).create();

  sendNotification('المشغّلات مثبتة', 'المسح كل 15 دقيقة، التحليلات كل ساعة، اللوحة كل 6 ساعات.', 'success');
}

// ════════════════════════════════════════════════════════════════
//  دوال الاختبار اليدوي
// ════════════════════════════════════════════════════════════════
function testAICaption() {
  Logger.log(JSON.stringify(generateAICaptions('test-deep-work.png', null), null, 2));
}

function testGitHubPost() {
  const blob = UrlFetchApp.fetch('https://picsum.photos/1080/1080').getBlob();
  Logger.log(JSON.stringify(postToGitHub(blob, 'اختبار نشر من نظام الأتمتة 🤖', 'TEST_GH'), null, 2));
}

function testLinkedInPost() {
  const blob = UrlFetchApp.fetch('https://picsum.photos/1080/1080').getBlob();
  Logger.log(JSON.stringify(postToLinkedIn(blob, 'اختبار نشر من نظام الأتمتة 🤖 — سيُحذف يدوياً', 'TEST_LI'), null, 2));
}

function testFacebookPost() {
  const blob = UrlFetchApp.fetch('https://picsum.photos/1080/1080').getBlob();
  Logger.log(JSON.stringify(postToFacebook(blob, 'Test post from automation 🤖', 'TEST_FB'), null, 2));
}

function testInstagramPost() {
  const blob = UrlFetchApp.fetch('https://picsum.photos/1080/1080').getBlob();
  Logger.log(JSON.stringify(postToInstagram(blob, 'Test post from automation 🤖', 'TEST_IG'), null, 2));
}

function testTwitterPost() {
  const blob = UrlFetchApp.fetch('https://picsum.photos/1080/1080').getBlob();
  Logger.log(JSON.stringify(postToTwitter(blob, 'Test post from automation 🤖', 'TEST_TW'), null, 2));
}

function debugPost(platform) {
  const blob = UrlFetchApp.fetch('https://picsum.photos/1080/1080').getBlob();
  Logger.log(JSON.stringify(postToPlatform(platform, blob, 'Debug test post', 'DEBUG_001'), null, 2));
}
