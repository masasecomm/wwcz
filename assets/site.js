(() => {
  const menuToggle = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".navigation");

  renderSocialIcons();
  document.querySelectorAll(".video-card__play[data-video-id]").forEach((button) => {
    button.addEventListener("click", () => playFeaturedVideo(button));
  });

  if (menuToggle && navigation) {
    menuToggle.addEventListener("click", () => {
      const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!isExpanded));
      menuToggle.setAttribute("aria-label", isExpanded ? "Open navigation" : "Close navigation");
      navigation.classList.toggle("navigation--open", !isExpanded);
    });

    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open navigation");
        navigation.classList.remove("navigation--open");
      }
    });
  }

  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  const eventsList = document.querySelector("#events-list");
  if (eventsList) {
    loadEvents(eventsList);
  }

  const contactForm = document.querySelector("#contact-form");
  if (contactForm) {
    contactForm.addEventListener("submit", (event) => submitContactForm(event, contactForm));
  }
})();

function renderSocialIcons() {
  const namespace = "http://www.w3.org/2000/svg";
  const icons = {
    Instagram: [
      ["rect", { x: "3.1", y: "3.1", width: "17.8", height: "17.8", rx: "5.2" }],
      ["circle", { cx: "12", cy: "12", r: "4.1" }],
      ["circle", { class: "social-icon__dot", cx: "17.8", cy: "6.5", r: "1" }]
    ],
    YouTube: [
      ["path", { class: "social-icon__youtube", d: "M23.1 7a3 3 0 0 0-2.1-2.1C19.2 4.4 12 4.4 12 4.4s-7.2 0-9 .5A3 3 0 0 0 .9 7 31.4 31.4 0 0 0 .4 12a31.4 31.4 0 0 0 .5 5 3 3 0 0 0 2.1 2.1c1.8.5 9 .5 9 .5s7.2 0 9-.5a3 3 0 0 0 2.1-2.1 31.4 31.4 0 0 0 .5-5 31.4 31.4 0 0 0-.5-5Z" }],
      ["path", { class: "social-icon__play", d: "m9.7 15.6 6.1-3.6-6.1-3.6z" }]
    ],
    Facebook: [
      ["path", { class: "social-icon__facebook", d: "M13.7 21v-8.2h2.8l.4-3.2h-3.2v-2c0-.9.3-1.6 1.6-1.6H17V3.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.3v2.3H7.7v3.2h2.7V21z" }]
    ],
    LinkedIn: [
      ["path", { class: "social-icon__linkedin", d: "M5.2 8.5A1.9 1.9 0 1 0 5.2 4.7a1.9 1.9 0 0 0 0 3.8ZM3.6 10h3.2v10.3H3.6zm5.2 0h3v1.4h.1c.4-.8 1.5-1.7 3.1-1.7 3.3 0 3.9 2.2 3.9 5v5.6h-3.2v-5c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7v5.1H8.8z" }]
    ]
  };

  document.querySelectorAll(".social-links a[aria-label]").forEach((link) => {
    const icon = icons[link.getAttribute("aria-label")];
    if (!icon) {
      return;
    }

    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    icon.forEach(([tagName, attributes]) => {
      const shape = document.createElementNS(namespace, tagName);
      Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
      svg.append(shape);
    });
    link.replaceChildren(svg);
  });
}

function playFeaturedVideo(button) {
  const videoId = button.dataset.videoId;
  if (!/^[\w-]{11}$/.test(videoId || "")) {
    console.error("Skipped a featured video with an invalid YouTube video ID.");
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
  iframe.title = button.dataset.videoTitle || "Warrior Women Prayer Movement YouTube video";
  iframe.loading = "eager";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  button.replaceWith(iframe);
}

async function loadEvents(container) {
  try {
    const response = await fetch("events.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load upcoming events (HTTP ${response.status}).`);
    }

    const events = await response.json();
    if (!Array.isArray(events)) {
      throw new Error("The events list is not in the expected format.");
    }

    events.sort((first, second) => first.date.localeCompare(second.date));
    if (events.length === 0) {
      container.replaceChildren(createEmptyEventsMessage());
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = events.filter((event) => isValidEvent(event) && new Date(`${event.date}T00:00:00`) >= today);

    if (upcoming.length === 0) {
      container.replaceChildren(createEmptyEventsMessage());
      return;
    }

    const fragment = document.createDocumentFragment();
    upcoming.forEach((event) => fragment.append(createEventCard(event)));
    container.replaceChildren(fragment);
  } catch (error) {
    container.replaceChildren();
    const message = document.createElement("p");
    message.className = "events-error";
    message.textContent = "We couldn’t load the events right now. Please contact us for gathering details.";
    container.append(message);
    console.error("Unable to display events:", error);
  }
}

function isValidEvent(event) {
  return event
    && typeof event.date === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(event.date)
    && typeof event.title === "string"
    && typeof event.time === "string"
    && typeof event.venue === "string"
    && typeof event.description === "string";
}

function createEmptyEventsMessage() {
  const message = document.createElement("article");
  message.className = "events-empty";

  const icon = document.createElement("span");
  icon.className = "events-empty__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "✧";

  const title = document.createElement("h3");
  title.textContent = "A little space for what’s next.";

  const description = document.createElement("p");
  description.textContent = "No upcoming events have been announced just yet. Check back soon or get in touch, and we’ll be happy to let you know about upcoming gatherings.";

  const contactLink = document.createElement("a");
  contactLink.className = "text-link text-link--purple";
  contactLink.href = "contact.html";
  contactLink.textContent = "Ask us about upcoming prayer meetings ↗";

  message.append(icon, title, description, contactLink);
  return message;
}

function createEventCard(event) {
  const card = document.createElement("article");
  card.className = "event-card";

  const date = document.createElement("div");
  date.className = "event-card__date";
  const dateValue = new Date(`${event.date}T00:00:00`);
  const month = document.createElement("span");
  month.textContent = new Intl.DateTimeFormat("en-ZA", { month: "short" }).format(dateValue);
  const day = document.createElement("strong");
  day.textContent = new Intl.DateTimeFormat("en-ZA", { day: "2-digit" }).format(dateValue);
  const year = document.createElement("span");
  year.textContent = new Intl.DateTimeFormat("en-ZA", { year: "numeric" }).format(dateValue);
  date.append(month, day, year);

  const details = document.createElement("div");
  details.className = "event-card__details";
  const title = document.createElement("h3");
  title.textContent = event.title;
  const description = document.createElement("p");
  description.textContent = event.description;
  const venue = document.createElement("span");
  venue.className = "event-card__venue";
  venue.textContent = `${event.time} · ${event.venue}`;
  details.append(title, description, venue);

  const contact = document.createElement("a");
  contact.className = "event-card__contact";
  contact.href = "contact.html";
  contact.setAttribute("aria-label", `Ask about ${event.title}`);
  contact.textContent = "Get in touch ↗";
  card.append(date, details, contact);
  return card;
}

async function submitContactForm(event, form) {
  event.preventDefault();

  const status = document.querySelector("#form-status");
  const button = form.querySelector('button[type="submit"]');
  if (!form.reportValidity()) {
    return;
  }

  const apiUrl = window.WWPM_CONFIG?.apiUrl?.trim().replace(/\/+$/, "");
  if (!apiUrl) {
    setFormStatus(status, "The contact form is not connected yet. Please email warriorwomenprayermovement@gmail.com and we’ll be glad to help.", true);
    return;
  }

  const formData = new FormData(form);
  const message = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    message: String(formData.get("message") || "").trim(),
    website: String(formData.get("website") || "").trim(),
    submissionId: form.dataset.submissionId || crypto.randomUUID()
  };
  form.dataset.submissionId = message.submissionId;

  button.disabled = true;
  setFormStatus(status, "Sending your message with care…", false);

  try {
    const response = await fetch(`${apiUrl}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`The message could not be delivered (HTTP ${response.status}).`);
    }
    if (!response.ok || result.ok !== true || result.emailSent !== true || result.sheetSaved !== true) {
      throw new Error(result.error || `The message could not be sent (HTTP ${response.status}).`);
    }

    form.reset();
    delete form.dataset.submissionId;
    setFormStatus(
      status,
      result.telegramNotified === false
        ? "Your message was emailed to the ministry and securely recorded. The Telegram notification could not be sent, but your message was received."
        : "Your message has been emailed to the ministry and securely recorded. Thank you for trusting us with it; we’ll be in touch.",
      false
    );
  } catch (error) {
    console.error("Unable to send contact message:", error);
    const networkError = /^(?:failed to fetch|load failed|networkerror)/i.test(error.message || "");
    setFormStatus(
      status,
      networkError
        ? "We couldn’t reach the ministry right now. Please try again or email warriorwomenprayermovement@gmail.com."
        : error.message || "We couldn’t send your message. Please email warriorwomenprayermovement@gmail.com.",
      true
    );
  } finally {
    button.disabled = false;
  }
}

function setFormStatus(element, message, isError) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("form-status--error", isError);
  element.classList.toggle("form-status--success", !isError);
}
