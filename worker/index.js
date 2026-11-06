const EVENTS_PATH = "events.json";
const GITHUB_API = "https://api.github.com";
const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_SECONDS = 600;
const MAX_BODY_BYTES = 8_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/telegram") {
      return handleTelegramWebhook(request, env);
    }

    if (url.pathname !== "/api/contact") {
      return jsonResponse({ ok: false, error: "Not found." }, 404);
    }

    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env)) {
      return jsonResponse({ ok: false, error: "This website is not allowed to send messages here." }, 403);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Use POST to send a message." }, 405, origin);
    }

    try {
      const message = await readContactMessage(request);
      if (message.website) {
        return jsonResponse({ ok: false, error: "Please remove automated form entries and try again." }, 400, origin);
      }

      const limitResponse = await checkContactLimit(request, env);
      if (limitResponse) {
        return jsonResponse({ ok: false, error: limitResponse }, 429, origin);
      }

      const delivery = await sendContactToGoogleAppsScript(env, message);

      const text = [
        "New message from the Warrior Women website",
        `Name: ${message.name}`,
        `Email: ${message.email}`,
        `Phone: ${message.phone || "Not provided"}`,
        "",
        "Message:",
        message.message
      ].join("\n");

      let telegramNotified = false;
      const recipients = getAdminIds(env);
      if (env.TELEGRAM_BOT_TOKEN && recipients.length > 0) {
        try {
          await Promise.all(recipients.map((chatId) => sendTelegramMessage(env, chatId, text)));
          telegramNotified = true;
        } catch (error) {
          console.error("Email and spreadsheet delivery succeeded, but the Telegram notification failed:", error);
        }
      } else {
        console.warn("The contact message was saved and emailed, but Telegram notifications are not configured.");
      }

      return jsonResponse({
        ok: true,
        emailSent: true,
        sheetSaved: true,
        telegramNotified
      }, 200, origin);
    } catch (error) {
      console.error("Unable to process website contact form:", error);
      const status = error instanceof ContactRequestError ? 400 : 503;
      return jsonResponse(
        {
          ok: false,
          error: error instanceof ContactRequestError || error instanceof ContactDeliveryError
            ? error.message
            : "Your message could not be delivered. Please email the ministry directly."
        },
        status,
        origin
      );
    }
  }
};

async function handleTelegramWebhook(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return new Response("Unauthorized.", { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("Invalid JSON.", { status: 400 });
  }

  const message = update?.message;
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (!chatId || !userId || !text.startsWith("/")) {
    return new Response("OK.");
  }

  const [rawCommand, ...argumentParts] = text.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const argument = argumentParts.join(" ").trim();

  if (command === "/id") {
    await sendTelegramMessage(env, chatId, `Your Telegram user ID is ${userId}.\nShare it with the website owner to be added as an events administrator.`);
    return new Response("OK.");
  }

  if (!getAdminIds(env).includes(String(userId))) {
    await sendTelegramMessage(env, chatId, "You’re not an events administrator for this movement. Ask the website owner to add your Telegram ID if you need access.");
    return new Response("OK.");
  }

  try {
    switch (command) {
      case "/start":
      case "/help":
        await sendTelegramMessage(env, chatId, getHelpMessage());
        break;
      case "/new":
        await createEvent(env, argument);
        await sendTelegramMessage(env, chatId, "Your event has been published on the website.");
        break;
      case "/edit":
        await editEvent(env, argument);
        await sendTelegramMessage(env, chatId, "Your event has been updated on the website.");
        break;
      case "/delete":
        await deleteEvent(env, argument);
        await sendTelegramMessage(env, chatId, "Your event has been removed from the website.");
        break;
      case "/events":
        await sendTelegramMessage(env, chatId, await formatEventList(env));
        break;
      default:
        await sendTelegramMessage(env, chatId, "I didn’t recognise that command. Send /help to see the events commands.");
        break;
    }
  } catch (error) {
    console.error(`Telegram ${command} command failed:`, error);
    try {
      await sendTelegramMessage(env, chatId, `I couldn’t complete that request: ${truncate(error.message, 350)}\nCheck the command format with /help and try again.`);
    } catch (notificationError) {
      console.error("Unable to send Telegram command failure notice:", notificationError);
      return new Response("The Telegram command and its failure notice could not be processed.", { status: 502 });
    }
  }

  return new Response("OK.");
}

async function createEvent(env, argument) {
  const fields = readEventFields(argument, 5);
  const [date, time, title, venue, description] = fields;
  validateEventFields(date, time, title, venue, description);

  await updateEvents(env, (events) => {
    const baseId = `${date}-${slugify(title)}`;
    if (events.some((event) => event.id === baseId)) {
      throw new ContactRequestError(`An event with this date and title already exists (ID: ${baseId}). Use /edit to update it.`);
    }

    events.push({ id: baseId, date, time, title, venue, description });
    return `Add website event: ${title}`;
  });
}

async function editEvent(env, argument) {
  const fields = readEventFields(argument, 6);
  const [id, date, time, title, venue, description] = fields;
  if (!/^[\w-]{1,140}$/.test(id)) {
    throw new ContactRequestError("Use the event ID shown in /events.");
  }
  validateEventFields(date, time, title, venue, description);

  await updateEvents(env, (events) => {
    const event = events.find((item) => item.id === id);
    if (!event) {
      throw new ContactRequestError(`No event was found with ID "${truncate(id, 120)}".`);
    }

    Object.assign(event, { date, time, title, venue, description });
    return `Update website event: ${title}`;
  });
}

async function deleteEvent(env, argument) {
  const id = argument.trim();
  if (!/^[\w-]{1,140}$/.test(id)) {
    throw new ContactRequestError("Add the event ID you want to delete. Use /events to find it.");
  }

  await updateEvents(env, (events) => {
    const eventIndex = events.findIndex((item) => item.id === id);
    if (eventIndex === -1) {
      throw new ContactRequestError(`No event was found with ID "${truncate(id, 120)}".`);
    }

    events.splice(eventIndex, 1);
    return `Delete website event: ${id}`;
  });
}

async function formatEventList(env) {
  const events = await readEvents(env);
  if (events.length === 0) {
    return "There are no events on the website yet.\n\nUse /new to publish an event, or /help for the command format.";
  }

  const upcoming = events
    .filter((event) => isValidDate(event.date))
    .sort((first, second) => first.date.localeCompare(second.date))
    .slice(0, 20);

  if (upcoming.length === 0) {
    return "There are no upcoming events with valid dates on the website.";
  }

  const lines = upcoming.map((event) => {
    const date = formatEventDate(event.date);
    return `• ${date} · ${event.time} — ${event.title}\n  ${event.venue}\n  ID: ${event.id}`;
  });
  return `Events currently published on the website:\n\n${lines.join("\n\n")}\n\nUse /edit or /delete with an event ID.`;
}

async function readEvents(env) {
  const { entry } = await getEventsFile(env);
  const content = decodeBase64Utf8(entry.content);
  const events = JSON.parse(content);
  if (!Array.isArray(events)) {
    throw new Error("The website events.json file must contain a JSON array.");
  }
  return events;
}

async function updateEvents(env, mutate) {
  const { entry, repo, branch } = await getEventsFile(env);
  const content = decodeBase64Utf8(entry.content);
  const events = JSON.parse(content);
  if (!Array.isArray(events)) {
    throw new Error("The website events.json file must contain a JSON array.");
  }

  const commitMessage = mutate(events);
  const response = await githubRequest(
    env,
    `/repos/${repo}/contents/${EVENTS_PATH}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message: commitMessage,
        content: encodeBase64Utf8(`${JSON.stringify(events, null, 2)}\n`),
        sha: entry.sha,
        branch
      })
    }
  );
  const result = await readGitHubResponse(response);
  if (!response.ok) {
    throw new Error(`GitHub could not save the event (HTTP ${response.status}): ${result.message || "check the repository token and branch permissions"}`);
  }
}

async function getEventsFile(env) {
  const repo = env.GITHUB_REPO || "masasecomm/wwcz";
  const branch = env.GITHUB_BRANCH || "main";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(branch)) {
    throw new Error("The GitHub repository or branch is not configured correctly.");
  }

  const response = await githubRequest(
    env,
    `/repos/${repo}/contents/${EVENTS_PATH}?ref=${encodeURIComponent(branch)}`
  );
  const entry = await readGitHubResponse(response);
  if (!response.ok) {
    throw new Error(`GitHub could not read events.json (HTTP ${response.status}): ${entry.message || "check that the file exists and the repository token can read it"}`);
  }
  if (typeof entry.content !== "string" || typeof entry.sha !== "string") {
    throw new Error("GitHub did not return the expected contents of events.json.");
  }
  return { entry, repo, branch };
}

async function githubRequest(env, path, init = {}) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("The GitHub access token has not been configured.");
  }

  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Warrior-Women-Events-Bot",
      ...(init.body ? { "Content-Type": "application/json" } : {})
    }
  });
}

async function readGitHubResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`GitHub returned an unreadable response (HTTP ${response.status}).`);
  }
}

async function readContactMessage(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new ContactRequestError("Your message is too long to send.");
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    throw new ContactRequestError("Your message is too long to send.");
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new ContactRequestError("Please check your message and try again.");
  }

  const name = cleanText(data?.name, 80);
  const email = cleanText(data?.email, 254);
  const phone = cleanText(data?.phone, 32);
  const message = cleanText(data?.message, 2_000);
  const website = cleanText(data?.website, 200);
  const submissionId = typeof data?.submissionId === "string" ? data.submissionId.trim() : "";

  if (name.length < 2) {
    throw new ContactRequestError("Please enter your name.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ContactRequestError("Please enter a valid email address.");
  }
  if (message.length < 10) {
    throw new ContactRequestError("Please share a little more in your message.");
  }
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(submissionId)) {
    throw new ContactRequestError("Please refresh the page and try sending your message again.");
  }

  return { name, email, phone, message, website, submissionId };
}

async function sendContactToGoogleAppsScript(env, message) {
  const scriptUrl = env.GOOGLE_APPS_SCRIPT_URL || "";
  const token = env.GOOGLE_APPS_SCRIPT_TOKEN || "";
  if (!scriptUrl || !token) {
    throw new ContactDeliveryError("The contact form is not fully configured. Please email warriorwomenprayermovement@gmail.com directly.");
  }

  let url;
  try {
    url = new URL(scriptUrl);
  } catch {
    throw new ContactDeliveryError("The ministry email and Google Sheet could not be reached. Please try again or email warriorwomenprayermovement@gmail.com.");
  }

  if (
    url.protocol !== "https:"
    || url.hostname !== "script.google.com"
    || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)
    || url.search
    || url.hash
    || url.username
    || url.password
  ) {
    throw new ContactDeliveryError("The ministry email and Google Sheet have not been configured correctly. Please contact the ministry directly.");
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...message, token })
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ContactDeliveryError("The ministry email and Google Sheet could not be reached. Please try again or email warriorwomenprayermovement@gmail.com.");
  }

  if (!response.ok || result?.ok !== true || result.emailSent !== true || result.sheetSaved !== true) {
    const destinationErrors = [
      result?.emailSent === false ? "ministry email" : "",
      result?.sheetSaved === false ? "Google Sheet" : ""
    ].filter(Boolean).join(" and ");
    const destinationMessage = destinationErrors ? `The ${destinationErrors} could not be updated.` : "";
    throw new ContactDeliveryError(
      typeof result?.error === "string" && result.error
        ? result.error
        : destinationMessage || `Google Apps Script could not complete the contact request (HTTP ${response.status}).`
    );
  }

  return result;
}

async function checkContactLimit(request, env) {
  if (!globalThis.caches?.default) {
    console.error("The Worker cache API is unavailable; contact throttling could not be applied.");
    return "Messages are temporarily unavailable. Please email the ministry directly.";
  }

  const ipAddress = request.headers.get("CF-Connecting-IP");
  if (!ipAddress) {
    console.error("A website contact request did not include a Cloudflare client IP.");
    return "Messages are temporarily unavailable. Please email the ministry directly.";
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ipAddress));
  const key = new Request(`https://contact-rate-limit.invalid/${bytesToHex(new Uint8Array(digest))}`);
  const cache = caches.default;
  const existing = await cache.match(key);
  const count = existing ? Number(await existing.text()) : 0;
  if (count >= CONTACT_LIMIT) {
    return "Please wait a little while before sending another message.";
  }

  await cache.put(
    key,
    new Response(String(count + 1), {
      headers: { "Cache-Control": `public, max-age=${CONTACT_WINDOW_SECONDS}` }
    })
  );
  return "";
}

async function sendTelegramMessage(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("The Telegram bot token has not been configured.");
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: truncate(text, 4_000) })
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    throw new Error(`Telegram could not deliver a message (HTTP ${response.status}): ${result.description || "unknown Telegram error"}`);
  }
}

function getAdminIds(env) {
  return (env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  const allowedOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowedOrigins.includes(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
}

function jsonResponse(payload, status, origin = "") {
  const headers = origin ? corsHeaders(origin) : { "Content-Type": "application/json; charset=utf-8" };
  return new Response(JSON.stringify(payload), { status, headers });
}

function readEventFields(argument, expectedCount) {
  const fields = argument.split("|").map((field) => field.trim());
  if (fields.length !== expectedCount) {
    throw new ContactRequestError("Use /help to check the event command format and include every field separated by |.");
  }
  return fields;
}

function validateEventFields(date, time, title, venue, description) {
  if (!isValidDate(date)) {
    throw new ContactRequestError("Enter the date as YYYY-MM-DD.");
  }
  if (!time || time.length > 60) {
    throw new ContactRequestError("Add an event time (60 characters or fewer).");
  }
  if (!title || title.length > 120) {
    throw new ContactRequestError("Add an event title (120 characters or fewer).");
  }
  if (!venue || venue.length > 160) {
    throw new ContactRequestError("Add an event location or online meeting details (160 characters or fewer).");
  }
  if (!description || description.length > 1_200) {
    throw new ContactRequestError("Add a short event description (1,200 characters or fewer).");
  }
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatEventDate(value) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg"
  }).format(new Date(`${value}T12:00:00Z`));
}

function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength)
    : "";
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "event";
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function truncate(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function getHelpMessage() {
  return [
    "Warrior Women website events",
    "",
    "/events — list published events and their IDs",
    "/new YYYY-MM-DD | time | title | venue | description",
    "/edit ID | YYYY-MM-DD | time | title | venue | description",
    "/delete ID",
    "/help — show these instructions",
    "",
    "Use the | character to separate fields. Dates must use YYYY-MM-DD.",
    "Example:",
    "/new 2026-12-12 | 10:00 SAST | Women’s Prayer Gathering | Johannesburg | A morning of worship, prayer and fellowship.",
    "",
    "Changes are published straight to the website and committed to its GitHub repository."
  ].join("\n");
}

class ContactRequestError extends Error {}
class ContactDeliveryError extends Error {}
