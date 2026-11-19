var SPREADSHEET_ID = '1ld_8HJKfQkT_b5zDeL2KKhjjrNF2qu7ApUHbVSkJ6MY';
var WWPM_TAB = 'WWPM-Judy';
var WWPM_TAB_ID = 762532288;
var NOTIFICATION_EMAILS = [
  'masasecomm@gmail.com',
  'Info@Warriorwomen.co.za',
  'Pastorjudy@warriorwomen.co.za',
  'warriorwomenprayermovement@gmail.com'
].join(',');

function doGet() {
  return jsonResponse({
    result: 'ok',
    message: 'Unified EasyBroadcast / GodIsLove / Warrior Women endpoint is active.'
  });
}

function doPost(e) {
  var json = {};
  var content = e && e.postData && e.postData.contents;
  if (content) {
    try {
      json = JSON.parse(content);
    } catch (error) {
      json = {};
    }
  }

  var p = (e && e.parameter) ? e.parameter : {};
  var source = Object.keys(p).length ? p : json;
  var tabName = (source.tab || source.sheet || '').toString().trim();

  if (!tabName && (source.name || source.email || source.message || source.submissionId)) {
    tabName = WWPM_TAB;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (tabName === WWPM_TAB) {
      return saveWarriorWomenSubmission(ss, source);
    }

    if (tabName === 'GodIsLove') {
      return saveGodIsLoveSubmission(ss, source);
    }

    if (tabName === 'EasyBroadcast') {
      return saveEasyBroadcastSubmission(ss, source);
    }

    return jsonResponse({
      result: 'error',
      message: 'Unsupported tab: ' + (tabName || 'not specified')
    });
  } finally {
    lock.releaseLock();
  }
}

function saveWarriorWomenSubmission(ss, p) {
  var sheet = ss.getSheetByName(WWPM_TAB);
  if (!sheet) {
    return jsonResponse({ ok: false, result: 'error', message: 'Tab not found: WWPM-Judy', sheetSaved: false, emailSent: false });
  }
  if (sheet.getSheetId() !== WWPM_TAB_ID) {
    return jsonResponse({ ok: false, result: 'error', message: 'The WWPM-Judy tab ID could not be verified.', sheetSaved: false, emailSent: false });
  }

  var name = cleanText(p.name, 80);
  var email = cleanText(p.email, 254);
  var phone = cleanText(p.phone, 32);
  var message = cleanText(p.message, 2000);
  var submissionId = cleanText(p.submissionId, 64);

  if (p.website) {
    return jsonResponse({ ok: false, result: 'error', message: 'Automated submissions are not accepted.', sheetSaved: false, emailSent: false });
  }
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
    return jsonResponse({ ok: false, result: 'error', message: 'Please provide a name, valid email and message.', sheetSaved: false, emailSent: false });
  }

  var headers = [
    'Received',
    'Name',
    'Email',
    'Phone',
    'Message',
    'Submission ID',
    'Email status'
  ];
  ensureWWPMHeaders(sheet, headers);

  if (submissionId) {
    var existingRow = findSubmissionRow(sheet, submissionId);
    if (existingRow) {
      var status = sheet.getRange(existingRow, 7).getValue();
      return jsonResponse({
        ok: status === 'SENT',
        result: status === 'SENT' ? 'success' : 'saved',
        duplicate: true,
        sheetSaved: true,
        emailSent: status === 'SENT'
      });
    }
  }

  sheet.appendRow([
    new Date(),
    safeSpreadsheetCell(name),
    safeSpreadsheetCell(email),
    safeSpreadsheetCell(phone),
    safeSpreadsheetCell(message),
    submissionId,
    'PENDING'
  ]);
  var row = sheet.getLastRow();

  var emailSent = false;
  try {
    MailApp.sendEmail({
      to: NOTIFICATION_EMAILS,
      replyTo: email,
      subject: 'Warrior Women website message from ' + name,
      body: [
        'A new message was sent through the Warrior Women website.',
        '',
        'Name: ' + name,
        'Email: ' + email,
        'Phone: ' + (phone || 'Not provided'),
        '',
        'Message:',
        message,
        '',
        'Submission ID: ' + submissionId
      ].join('\n')
    });
    sheet.getRange(row, 7).setValue('SENT');
    emailSent = true;
  } catch (error) {
    sheet.getRange(row, 7).setValue('FAILED');
  }

  if (!emailSent) {
    return jsonResponse({
      ok: false,
      result: 'error',
      message: 'Your message was saved, but the notification email could not be sent.',
      sheetSaved: true,
      emailSent: false
    });
  }

  return jsonResponse({
    ok: true,
    result: 'success',
    sheetSaved: true,
    emailSent: true,
    tab: WWPM_TAB
  });
}

function findSubmissionRow(sheet, submissionId) {
  if (sheet.getLastRow() < 2) {
    return null;
  }
  var match = sheet
    .getRange(2, 6, sheet.getLastRow() - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : null;
}

function ensureWWPMHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return;
  }

  var existingCount = sheet.getLastColumn();
  if (existingCount === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function saveGodIsLoveSubmission(ss, p) {
  var sheet = ss.getSheetByName('GodIsLove');
  if (!sheet) {
    return jsonResponse({ result: 'error', message: 'Tab not found: GodIsLove' });
  }

  var headers = [
    'Timestamp',
    'School',
    'Guardian Name',
    'Guardian Email',
    'Guardian Phone',
    'Student Name',
    'Grade Applied',
    'Relationship',
    'Message',
    'Page URL'
  ];
  ensureHeaders(sheet, headers);

  var timestamp = new Date();
  sheet.appendRow([
    timestamp,
    p.school || '',
    p.guardianName || '',
    p.guardianEmail || '',
    p.guardianPhone || '',
    p.studentName || '',
    p.gradeApplied || '',
    p.relationship || '',
    p.message || '',
    p.pageUrl || ''
  ]);

  MailApp.sendEmail({
    to: 'masasecomm@gmail.com',
    subject: 'New GodIsLove Form: ' + (p.guardianName || 'Lead'),
    body: [
      'Guardian Name: ' + (p.guardianName || ''),
      'Guardian Email: ' + (p.guardianEmail || ''),
      'Guardian Phone: ' + (p.guardianPhone || ''),
      'Student Name: ' + (p.studentName || ''),
      'School: ' + (p.school || ''),
      'Grade Applied: ' + (p.gradeApplied || ''),
      'Relationship: ' + (p.relationship || ''),
      'Message: ' + (p.message || ''),
      'Page URL: ' + (p.pageUrl || ''),
      'Submitted: ' + timestamp
    ].join('\n')
  });

  return jsonResponse({ result: 'success', tab: 'GodIsLove' });
}

function saveEasyBroadcastSubmission(ss, p) {
  var sheet = ss.getSheetByName('EasyBroadcast');
  if (!sheet) {
    return jsonResponse({ result: 'error', message: 'Tab not found: EasyBroadcast' });
  }

  var headers = [
    'Timestamp',
    'Name',
    'Email',
    'Phone',
    'Country',
    'Locality',
    'Message',
    '_subject',
    'sheet',
    'tab',
    'Page URL'
  ];
  ensureHeaders(sheet, headers);

  var timestamp = new Date();
  sheet.appendRow([
    timestamp,
    p.name || '',
    p.email || '',
    p.phone || '',
    p.country || '',
    p.locality || '',
    p.message || '',
    p._subject || '',
    p.sheet || 'EasyBroadcast',
    p.tab || 'EasyBroadcast',
    p.pageUrl || ''
  ]);

  MailApp.sendEmail({
    to: 'masasecomm@gmail.com',
    subject: 'New EasyBroadcast Form: ' + (p.name || 'Lead'),
    body: [
      'Name: ' + (p.name || ''),
      'Email: ' + (p.email || ''),
      'Phone: ' + (p.phone || ''),
      'Country: ' + (p.country || ''),
      'Locality: ' + (p.locality || ''),
      'Message: ' + (p.message || ''),
      'Subject: ' + (p._subject || ''),
      'Sheet: ' + (p.sheet || 'EasyBroadcast'),
      'Tab: ' + (p.tab || 'EasyBroadcast'),
      'Page URL: ' + (p.pageUrl || ''),
      'Submitted: ' + timestamp
    ].join('\n')
  });

  return jsonResponse({ result: 'success', tab: 'EasyBroadcast' });
}

function ensureHeaders(sheet, headers) {
  var lastRow = sheet.getLastRow();
  var existing = lastRow
    ? sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getValues()[0]
    : [];

  if (lastRow === 0 || existing.every(function (cell) { return cell === ''; })) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var needsUpdate = headers.some(function (header, index) {
    return existing[index] !== header;
  });
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function cleanText(value, maximumLength) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maximumLength);
}

function safeSpreadsheetCell(value) {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
