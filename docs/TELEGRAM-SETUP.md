# Events and contact form setup

The website is a static GitHub Pages site. Its contact form and Telegram-managed events use a Cloudflare Worker: bot tokens and GitHub credentials stay in Worker secrets and are never published with the website.

## 1. Publish the website

1. Push the repository to the `main` branch on GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, and save.
3. Configure `warriorwomen.co.za` as a custom domain and add the GitHub Pages DNS records shown in GitHub’s Pages settings. The repository already includes a `CNAME` file for that domain.

The source photo is `IMG_6662.JPG` in the repository root. The static event list starts empty in `events.json`. An empty list is intentional; the site never invents event dates.

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
     apiUrl: "https://<your-worker-url>"
   };
   ```

   Commit and push that public URL configuration. It is safe to publish the Worker URL; do **not** put a bot token, webhook secret, or GitHub token in this file.

## 3. Manage events in Telegram

Message the bot using these commands (replace `|` with a separator between every field):

```text
/new 2026-12-12 | 10:00 SAST | Women’s Prayer Gathering | Johannesburg | A morning of worship, prayer and fellowship.
/events
/edit 2026-12-12-womens-prayer-gathering | 2026-12-19 | 10:00 SAST | Women’s Prayer Gathering | Johannesburg | The updated event details.
/delete 2026-12-12-womens-prayer-gathering
```

Use `/help` for the command reference. `/events` prints the event IDs required by `/edit` and `/delete`. Publishing or editing commits `events.json` to `main`; GitHub Pages then rebuilds the events page. Allow a short time for Pages to publish the change.

## 4. Email and spreadsheet contact delivery

The contact form delivers its submission to `warriorwomenprayermovement@gmail.com` and records it in the **`WWPM-Judy`** tab of spreadsheet `1ld_8HJKfQkT_b5zDeL2KKhjjrNF2qu7ApUHbVSkJ6MY`. A Google Apps Script bound to that spreadsheet sends the ministry email and saves the message. The email is sent from the Google account that deploys the script; replying to the email replies to the visitor.

The owner of the spreadsheet must authorize the script and deploy it. The spreadsheet was not publicly readable, so only its owner or an editor who is signed in to Google can install the integration.

### Install the spreadsheet script

1. Sign in to the Google account that can edit the specified spreadsheet and open it.
2. Select **Extensions → Apps Script** to create a script bound to that spreadsheet. Add the provided `google-apps-script/Code.gs` file to the project, replacing the default `myFunction` sample, and save.
3. Generate a private, random integration token in PowerShell:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Keep this token private. Add it under **Apps Script → Project Settings → Script Properties** as a property named `CONTACT_FORM_TOKEN`. Use the same token for the Worker secret in the next step. Do not add the token to the website, spreadsheet cells, or public source code.
4. In **Deploy → New deployment**, select **Web app**, choose **Execute as me**, and allow access to **Anyone** so the website Worker can submit messages without a Google sign-in. Google requires deploying the script with the account that will send the emails and edit the spreadsheet. If **Anyone** access is disabled by the account’s administrator, public form submissions cannot reach this integration; ask the administrator to allow it or choose an approved alternative before publishing the form.
5. Authorize the requested spreadsheet and email permissions. Check **Executions** in Apps Script if Google shows an authorization or sending error.
6. Copy the deployed web app URL. It must start with `https://script.google.com/macros/s/` and end with `/exec`. Do not use the script-editor URL or a `/dev` test URL.

The script writes to the existing tab named `WWPM-Judy` and verifies that it matches the tab ID `762532288`. If the tab is missing or is not the selected tab in the spreadsheet link, the script returns an error instead of creating or writing to a different sheet. If it is empty, the script adds a header row. The columns are **Received**, **Name**, **Email**, **Phone**, **Message**, **Submission ID**, and **Email status**. Only share the spreadsheet with people authorized to read prayer requests and personal contact details.

### Connect and deploy the Worker

In the `worker` folder, run the commands below. Wrangler securely prompts for each value:

```powershell
npx wrangler secret put GOOGLE_APPS_SCRIPT_URL
npx wrangler secret put GOOGLE_APPS_SCRIPT_TOKEN
```

For `GOOGLE_APPS_SCRIPT_URL`, enter the web app URL ending in `/exec`; for `GOOGLE_APPS_SCRIPT_TOKEN`, enter the exact random token saved in the script properties. Then deploy:

```powershell
npx wrangler deploy
```

Deploy the GitHub Pages website after the script and Worker are configured. The static website only calls the Worker; the Apps Script URL and token are never placed in its public source code.

The worker-generated request reference prevents accidental duplicate emails or spreadsheet rows if the same submission is retried. When email delivery fails after the sheet row was saved, retrying that submission sends the email without adding a second row. The form only confirms delivery after both the email and sheet row succeed. Telegram remains an additional notification; if Telegram is unavailable after the email and sheet succeed, the form confirms that the message was received.

## 5. Contact-form validation and troubleshooting

When `apiUrl` is configured, the website sends form submissions to the Worker. It validates each message, restricts requests to the configured site origins, limits messages to five per IP address per ten minutes, and sends valid submissions to every ID in `ADMIN_TELEGRAM_IDS`. The Worker cache provides best-effort rate limiting. If a submission cannot be delivered, the visitor is asked to use the ministry email address instead.

If GitHub branch protection prevents the event bot from updating `main`, adjust the branch permissions to allow this GitHub token to write `events.json`. Keep the main branch and the `events.json` file in the same repository and branch configured in `worker/wrangler.toml`.
