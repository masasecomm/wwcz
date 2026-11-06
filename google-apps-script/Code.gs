const SPREADSHEET_ID = "1ld_8HJKfQkT_b5zDeL2KKhjjrNF2qu7ApUHbVSkJ6MY";
const WORKSHEET_NAME = "WWPM-Judy";
const WORKSHEET_ID = 762532288;
const NOTIFICATION_EMAIL = "warriorwomenprayermovement@gmail.com";
const CONTACT_FORM_TOKEN_PROPERTY = "CONTACT_FORM_TOKEN";
const CONTACT_HEADERS = [
  "Received",
  "Name",
  "Email",
  "Phone",
  "Message",
  "Submission ID",
  "Email status"
];

function doPost(event) {
  try {
    const body = JSON.parse(event?.postData?.contents || "");
    const expectedToken = PropertiesService.getScriptProperties()
      .getProperty(CONTACT_FORM_TOKEN_PROPERTY);
    if (expectedToken?.length !== 64 || !securelyMatchesToken(body.token, expectedToken)) {
      return jsonOutput({ ok: false, error: "Unauthorized.", emailSent: false, sheetSaved: false });
    }

    const submission = validateSubmission(body);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return jsonOutput({
        ok: false,
        error: "The contact form is busy. Please try again.",
        emailSent: false,
        sheetSaved: false
      });
    }

    try {
      return jsonOutput(processSubmission(submission));
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error("Could not save and email a Warrior Women website message:", error);
    return jsonOutput({
      ok: false,
      error: "We could not save your message and send the ministry email. Please try again or email warriorwomenprayermovement@gmail.com.",
      emailSent: false,
      sheetSaved: false
    });
  }
}

function processSubmission(submission) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(WORKSHEET_NAME);
  if (!sheet || sheet.getSheetId() !== WORKSHEET_ID) {
    throw new Error(`The "${WORKSHEET_NAME}" worksheet could not be verified.`);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CONTACT_HEADERS);
    sheet.setFrozenRows(1);
  }

  let row = findSubmissionRow(sheet, submission.submissionId);
  let emailSent = false;
  if (!row) {
    sheet.appendRow([
      new Date(),
      safeSpreadsheetCell(submission.name),
      safeSpreadsheetCell(submission.email),
      safeSpreadsheetCell(submission.phone),
      safeSpreadsheetCell(submission.message),
      submission.submissionId,
      "PENDING"
    ]);
    row = sheet.getLastRow();
  } else {
    emailSent = sheet.getRange(row, 7).getValue() === "SENT";
  }

  if (emailSent) {
    return { ok: true, emailSent: true, sheetSaved: true };
  }

  try {
    sendContactEmail(submission);
    sheet.getRange(row, 7).setValue("SENT");
    emailSent = true;
  } catch (error) {
    sheet.getRange(row, 7).setValue("FAILED");
    console.error("The contact was saved in Google Sheets, but the notification email could not be sent:", error);
  }

  if (!emailSent) {
    return {
      ok: false,
      error: "Your message was saved, but we could not send the ministry email. Please try again or email warriorwomenprayermovement@gmail.com.",
      emailSent: false,
      sheetSaved: true
    };
  }

  return { ok: true, emailSent: true, sheetSaved: true };
}

function findSubmissionRow(sheet, submissionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  const match = sheet
    .getRange(2, 6, lastRow - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : null;
}

function sendContactEmail(submission) {
  const subject = `Warrior Women website message from ${submission.name}`;
  const plainText = [
    "A new message was sent through the Warrior Women Prayer Movement website.",
    "",
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Phone: ${submission.phone || "Not provided"}`,
    "",
    "Message:",
    submission.message,
    "",
    `Reference: ${submission.submissionId}`
  ].join("\n");
  const htmlBody = [
    "<p>A new message was sent through the Warrior Women Prayer Movement website.</p>",
    `<p><strong>Name:</strong> ${escapeHtml(submission.name)}<br>`,
    `<strong>Email:</strong> ${escapeHtml(submission.email)}<br>`,
    `<strong>Phone:</strong> ${escapeHtml(submission.phone || "Not provided")}</p>`,
    `<p><strong>Message:</strong><br>${escapeHtml(submission.message).replace(/\n/g, "<br>")}</p>`,
    `<p><small>Reference: ${escapeHtml(submission.submissionId)}</small></p>`
  ].join("");

  MailApp.sendEmail({
    to: NOTIFICATION_EMAIL,
    replyTo: submission.email,
    subject: subject,
    body: plainText,
    htmlBody: htmlBody,
    name: "Warrior Women Prayer Movement website"
  });
}

function validateSubmission(body) {
  const name = cleanInput(body.name, 80);
  const email = cleanInput(body.email, 254);
  const phone = cleanInput(body.phone, 32);
  const message = cleanInput(body.message, 2000);
  const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";

  if (body.website) {
    throw new Error("This contact submission could not be accepted.");
  }
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please provide a name and a valid email address.");
  }
  if (message.length < 10) {
    throw new Error("Please include a message of at least 10 characters.");
  }
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(submissionId)) {
    throw new Error("Please submit the form again to create a valid message reference.");
  }

  return { name, email, phone, message, submissionId };
}

function cleanInput(value, maximumLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maximumLength);
}

function safeSpreadsheetCell(value) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function securelyMatchesToken(actual, expected) {
  if (typeof actual !== "string" || !expected) {
    return false;
  }

  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
