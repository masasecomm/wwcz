# cPanel contact form setup

The contact and testimony forms send email through `contact-submit.php` using PHP `mail()`. Submissions are sent to:

- `Info@Warriorwomen.co.za`
- `Pastorjudy@warriorwomen.co.za`
- `masasecomm@gmail.com`

The configured sender address is `website@warriorwomen.co.za`.

## Set up the sender mailbox

1. Sign in to cPanel.
2. Open **Email Accounts** and create `website@warriorwomen.co.za`.
3. Use a strong password and keep it private. The website does not need the mailbox password because it uses the host's PHP `mail()` service.

If you choose a different sender address, update `$sender` in `contact-submit.php` to that exact address before uploading.

## Upload the changes

Upload these files to the same directory as the live website's `contact.html`, preserving the `assets` and `docs` folders:

- `contact-submit.php`
- `contact.html`
- `assets/site-config.js`
- `assets/site.js`

For a primary domain this is usually `public_html`; for an addon domain, use that domain's document root. Replace the old copies of the listed files, but do not delete the rest of the website.

## Test delivery

Submit a test from the live contact page and confirm it arrives at all three recipient addresses. Also test the testimony form. Check Spam/Junk if a message is missing. PHP `mail()` delivery depends on the hosting provider's mail configuration; if cPanel reports a send failure or mail is not delivered, ask the host to enable/configure PHP mail for `website@warriorwomen.co.za`. The form reports success only after PHP accepts the message for delivery; that does not guarantee inbox placement.
