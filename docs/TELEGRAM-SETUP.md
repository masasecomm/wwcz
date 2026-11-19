# Telegram-managed events

The website's contact and testimony forms use a PHP endpoint on cPanel. See [the cPanel contact form setup](./CPANEL-CONTACT-FORM.md) for mailbox and upload instructions. The Cloudflare Worker described here is only for Telegram-managed event updates; its bot tokens and GitHub credentials stay in Worker secrets and are never published with the website.

## 1. Publish the website

The live website is hosted on cPanel. Upload website updates to the document root for `warriorwomen.co.za`, preserving the existing folder structure. For contact-form-specific files, mailbox setup, and safe replacement guidance, see [the cPanel contact form setup](./CPANEL-CONTACT-FORM.md).

The source photo is `IMG_6662.JPG` in the repository root. The event bot stores its event list in `events.json`. An empty list is intentional; the site never invents event dates.

## 2. Create and deploy the Telegram bot

1. In Telegram, message [@BotFather](https://t.me/BotFather), run `/newbot`, and securely save the bot token. Never add the token to a website file or commit it to Git.
2. Install Node.js, then in PowerShell move into this repository’s `worker` folder and run `npx wrangler login`.
3. Add the secrets below. Wrangler prompts for each value without adding it to the repository:

   ```powershell
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   npx wrangler secret put GITHUB_TOKEN
   ```

   `TELEGRAM_WEBHOOK_SECRET` must be a private random value using only letters, numbers, `_` or `-`. `GITHUB_TOKEN` should be a fine-grained GitHub token scoped to `masasecomm/wwcz` with **Contents: read and write** permission. The token must be allowed to update the `main` branch.
4. Deploy the Worker:

   ```powershell
   npx wrangler deploy
   ```

   Save the Worker URL printed by Wrangler, for example `https://warrior-women-site-api.<your-account>.workers.dev`.
5. Add the URL and the exact domain(s) serving the website to `ALLOWED_ORIGINS` in `worker/wrangler.toml`. The defaults cover `warriorwomen.co.za`, `www.warriorwomen.co.za`, and GitHub Pages. Redeploy after changing this file.
6. Register the Telegram webhook from PowerShell, replacing the three placeholders with your private bot token, Worker URL, and webhook secret:

   ```powershell
   $body = @{
     url = "https://<your-worker-url>/telegram"
     secret_token = "<your-telegram-webhook-secret>"
   } | ConvertTo-Json

   Invoke-RestMethod `
     -Method Post `
     -Uri "https://api.telegram.org/bot<your-telegram-bot-token>/setWebhook" `
     -ContentType "application/json" `
     -Body $body
   ```

7. Send `/id` to your bot. Set the returned Telegram user ID as a Worker secret:

   ```powershell
   npx wrangler secret put ADMIN_TELEGRAM_IDS
   ```

   For multiple event administrators, enter their numeric Telegram user IDs separated by commas. Only these IDs can publish, edit or remove events.
8. Set the deployed Worker URL in `assets/site-config.js`:

   ```js
   window.WWPM_CONFIG = {
     phpEndpoint: "contact-submit.php",
     apiUrl: "https://<your-worker-url>"
   };
   ```

   Keep the `phpEndpoint` entry so the contact and testimony forms continue to use cPanel email. The Worker URL is safe to publish; do **not** put a bot token, webhook secret, or GitHub token in this file.

## 3. Manage events in Telegram

Message the bot using these commands (replace `|` with a separator between every field):

```text
/new 2026-12-12 | 10:00 SAST | Women’s Prayer Gathering | Johannesburg | A morning of worship, prayer and fellowship.
/events
/edit 2026-12-12-womens-prayer-gathering | 2026-12-19 | 10:00 SAST | Women’s Prayer Gathering | Johannesburg | The updated event details.
/delete 2026-12-12-womens-prayer-gathering
```

Use `/help` for the command reference. `/events` prints the event IDs required by `/edit` and `/delete`. Publishing or editing commits `events.json` to `main`. Since the live website is hosted on cPanel, upload the updated `events.json` to the cPanel document root for the change to appear on the live site.

## 4. Contact form

The website contact and testimony forms are configured to POST to `contact-submit.php` on the same cPanel host. They send email to the ministry recipients and do not write to Google Sheets. See [the cPanel contact form setup](./CPANEL-CONTACT-FORM.md) for deployment and delivery testing.

The Worker validation and Telegram notification flow applies only when its API is configured for event management. It is not the configured contact-form email route.

If GitHub branch protection prevents the event bot from updating `main`, adjust the branch permissions to allow this GitHub token to write `events.json`. Keep the main branch and the `events.json` file in the same repository and branch configured in `worker/wrangler.toml`.
