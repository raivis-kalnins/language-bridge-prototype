# Book Reader PWA

## v1.3.7 MP3 export and temporary-cache cleanup

- Audio export now downloads **MP3**, not MP4/AAC. It uses a smallest-file speech preset: mono, 16 kHz, 16 kbps.
- PDF audio export keeps the **Whole book / Custom page range** popup, so ranges such as pages 5–12 can be exported without processing the entire PDF.
- The generated MP3 is handed through a temporary browser cache entry for download. That temporary cache entry is removed immediately after the download starts, and any orphaned temporary audio cache is cleared on the next app start.

A device-first PDF/DOCX book reader designed for desktop, tablet, Android and iPhone/iPad. It follows the same deployable PWA/PHP style as the reference apps, but keeps book content in the reader's browser/device storage instead of a server library.

## What this prototype includes

- Installable responsive PWA with a light academic/book-first interface for desktop, tablet and mobile.
- Free guest mode with no login: **1 local reading item total** for 24 hours. The item can come from a file, a public web URL, or pasted text/HTML; adding another item replaces it.
- Paid entitlement model: **EUR 3/month = 3 retained books**, then **EUR 1/month per extra retained book slot**. Example: 7 retained books = EUR 7/month.
- Super-admin account provisioning, including unlimited free-book grants, a dedicated Super Admin login and server-side security settings.
- Public signup/request-access form protected by hCaptcha. Each signup also requires a signed, expiring approval link delivered to the administrator by email before it can create an account.
- Local reading-item storage in IndexedDB. File imports and pasted text/HTML stay on-device. URL import uses a one-time protected server fetch because browser CORS blocks many pages; the fetched page is not added to a server library and the resulting reading item is stored locally.
- DOCX -> clean reflowable book conversion in the browser using Mammoth.
- Existing PDF import/rendering and text extraction in the browser using PDF.js.
- Photo/image import (JPG/JPEG, PNG, WebP, AVIF, BMP and GIF): Tesseract.js OCR runs in the browser and turns readable image text into a reflowable book. OCR language data is downloaded on demand.
- Optional legacy DOC/ODT/RTF conversion using LibreOffice on the server. This path is disabled by default because it temporarily uploads the source document for conversion.
- Book metadata: title, subtitle, author, description, language and custom cover image.
- Clean A5 print/export layout. For reflowable books, **Export PDF** opens the browser's print dialog so the reader can choose **Save as PDF**. This preserves Unicode/Latvian text and selectable text without bundling a proprietary font.
- Reading themes, font size, line spacing and PDF page navigation.
- Natural on-device neural text-to-speech with Supertonic 3 for supported languages, with strict same-language device/Piper fallback where needed. The app never falls back to English for Latvian/Ukrainian or another language.
- Continuous natural-reading flow: several sentences are prepared as one passage, internal chunk gaps are reduced to a very short transition, and the next passage is synthesized while the current passage is playing. This removes the old generate-after-every-sentence pause while keeping normal 1.00x reading speed.
- Languages exposed in this build: English, German, French, Spanish, Russian, Polish, Latvian, Lithuanian, Estonian, Danish, Swedish, Norwegian Bokmal, Finnish, Icelandic and Ukrainian.
- Header interface-language switcher for the same 15 languages; navigation, account, signup, voice and admin/security settings follow the selected UI language.
- Local Unicode/spacing cleanup and browser spelling/grammar underlining in the editor.

## v1.3.6 image OCR and MP4 page-range export

- The main file uploader now accepts common image formats including **JPG/JPEG, PNG, WebP and AVIF** (plus BMP and GIF). The image is decoded in the browser and Tesseract.js OCR extracts readable text using the selected book language.
- Image OCR is performed on-device after OCR runtime/language assets are downloaded. The uploaded photo itself is not sent to the application server.
- The MP4 audio popup now has **Whole book** and **Custom page range** options for PDFs. A reader can export only pages such as **5–12** instead of synthesizing the entire PDF.
- Custom-range exports generate speech only for the selected pages and include the page range in the downloaded MP4 filename.

## v1.3.5 MP4 audio export and multi-column PDF reading

- Reader audio controls now include a separate **Generate MP4 audio** action. It synthesizes the whole saved item only after the user starts the export, so normal reading does not pay the encoding cost.
- MP4 audio generation stays in the browser: speech chunks are synthesized locally and encoded as AAC in an audio-only MP4 using Mediabunny. No book text or generated audio is uploaded for conversion.
- PDF text extraction now detects repeated vertical gutters and reads each detected column top-to-bottom before moving to the next column. This fixes two-column and many three-column layouts that were previously interleaved line-by-line.
- PDFs saved by earlier builds are re-extracted once when opened, so existing local books also pick up the corrected column reading order.
- Full-width PDF rows that cross a detected gutter are treated as spanning headings/blocks and keep their position between column regions.

## Important privacy/storage detail

Browsers do not expose an arbitrary permanent operating-system file path consistently across desktop, Android and iOS. To keep the experience cross-platform and private, this app stores book data in the browser's device sandbox (IndexedDB; Piper itself can cache models using browser storage/OPFS). This is still local device storage, not application server storage.

The guest expiry is enforced when the PWA starts/opens and during library refresh. After 24 hours, the guest record is deleted from local browser storage and the document must be attached again.

A user clearing browser/site data can also remove their local books. Paid accounts in this prototype provide retention/quota entitlement; they do **not** sync book files between devices.



## v1.2.6 source import, one-scroll reader and two-stage activation

- Reader layout now locks both the document root and body while a book is open and hides the outer document scrollbar. The **reader content is the only vertical scrolling area**; PDF canvas wrapping is horizontal-only.
- Add Book now supports three source types: **File**, **Web URL**, and **Paste text / HTML**.
- Public URL import validates every redirect, blocks localhost/private/reserved network targets, accepts readable text/HTML only, limits the response size, strips unsafe HTML and then saves the reading item locally.
- Free guest quota is **one reading item total**, regardless of whether it came from a file, URL or pasted HTML/text. Super Admin remains unlimited; member limits continue to use their assigned entitlement.
- Signup approval is now two-stage: the administrator must open the signed approval URL, review payment/access, and approve. The member then receives a separate signed activation URL by email, completes hCaptcha, chooses their own password, and only then can log in.
- A pending-activation member cannot bypass the activation email by using the normal login form. Super Admin can resend a fresh activation URL from the signup panel.

## v1.2.5 Latvian voice tuning

- **Sieviete 2 / F2 is now the default natural voice for Latvian books.** Other languages keep their existing defaults, and an explicit per-language choice is remembered.
- Natural voice style preferences are now stored per book language, so changing the Latvian voice no longer changes the preferred voice for English, German, etc.
- Latvian speech always goes to Supertonic with the explicit `lv` language condition.
- Added a speech-only Latvian normalization profile for common abbreviations, euro/percent notation and clipped apostrophes found in older/folk texts. The visible book text is not modified.
- Latvian natural synthesis uses 10 denoising steps instead of 8 for a little more pronunciation/stability headroom while keeping the normal 1.00x reading rate.
- The model still uses Supertonic's fixed multilingual F1-F5/M1-M5 speaker styles; this tuning improves Latvian handling but cannot turn a fixed multilingual speaker embedding into a truly native Latvian recording.

## v1.2.3 natural voice stability fix

- Fixes `RangeError: Maximum call stack size exceeded` during longer natural-voice passages.
- Audio chunks are now joined with `Float32Array.set()` instead of spreading waveform samples into `Array.push()`.
- Final audio is allocated once, reducing temporary memory and repeated copying.
- PWA/service-worker cache version bumped so v1.2.2 JavaScript is replaced after refresh/reopen.

## v1.2.2 payment approval + read-aloud flow

The natural reader no longer creates a separate audio file for every sentence. For Supertonic reading it now:

- groups nearby sentences/paragraphs into passages of roughly 700 characters;
- lets punctuation inside the neural model create the normal sentence rhythm;
- reduces the synthetic silence inserted between unavoidable model chunks from 220 ms to 40 ms;
- pre-generates the next passage during current playback, so the next passage is normally ready when playback reaches it;
- keeps 1.00x as the default reading speed.

Native device and Piper fallback readers keep their existing sentence-safe behaviour.

## Natural multilingual read-aloud

The preferred reader is **Supertonic 3**, an open-weight on-device multilingual TTS model. The browser implementation uses ONNX Runtime Web and produces speech locally after model files are downloaded/cached. This build uses Supertonic for English, German, French, Spanish, Russian, Polish, Latvian, Lithuanian, Estonian, Danish, Swedish, Finnish and Ukrainian.

Norwegian Bokmal and Icelandic use a strict same-language device/Piper fallback. The voice router refuses a cross-language fallback, so Latvian or Ukrainian text is never intentionally sent to an English voice.

PDF text is cleaned before speech: common browser-print URL/date/page-number furniture is removed and separated decorative first letters are rejoined where possible.


## Signup, hCaptcha and email approval

Signup and login use hCaptcha. The public site key is sent to the browser; the hCaptcha secret remains server-side and is sent only from PHP to hCaptcha's verification endpoint. Protected actions fail closed if verification is missing or fails.

Signup flow:

1. Visitor completes the signup form and hCaptcha.
2. The request is saved in `storage/signup_requests.json`.
3. PHP sends the administrator a signed, expiring approval URL.
4. Opening the URL requires Super Admin login (also protected by hCaptcha).
5. The approval screen shows the requested book allowance and calculated monthly price. The Super Admin must explicitly choose **Payment received** or **Payment not received**.
6. **Payment not received** keeps the request in **Awaiting payment** and does not create a usable member account.
7. **Payment received** (or an explicit free/unlimited grant) creates a **pending-activation** member record and sends the member a second signed, expiring activation URL.
8. The member opens that activation URL, completes hCaptcha and chooses their own password. Only then does the account become usable for normal login.
9. Super Admin can resend the member activation URL if mail delivery failed or the URL expired.

The admin panel shows payment status for each signup and can **resend** an approval email, but cannot bypass the email approval token for a pending or awaiting-payment signup. Configure `app_base_url` to the canonical HTTPS deployment URL and make sure PHP `mail()` (or a replacement mail transport) works.

The Super Admin Security Settings panel can update the hCaptcha site key, replace the secret, set the approval email, sender address, canonical application URL and approval-link lifetime. For safety, the existing secret is never returned to browser JavaScript.

## Latvian grammar/proofreading

This prototype deliberately does **not** claim a full Latvian grammar engine. The editor currently provides:

- Unicode NFC normalization,
- cleanup of common conversion spacing/punctuation issues,
- browser spelling/grammar underlining when the user's browser provides Latvian language support.

For production-grade Latvian grammar correction while keeping the strong privacy promise, add a vetted local/self-hosted Latvian proofreading model. A cloud proofreading API would send book text off-device and would therefore need explicit consent and a different privacy statement.

## Production items still to connect

### 1. Payments

The quota/entitlement logic and **manual Super Admin payment confirmation** are implemented. Automatic checkout/webhooks are intentionally not hard-coded. Current manual flow: signup -> secure administrator approval email -> mark payment received/not received -> send signed member activation email -> member completes hCaptcha and sets a password -> account becomes active (unless the Super Admin grants free/unlimited access). Recommended future automated model:

- recurring base subscription: EUR 3/month, grants 3 slots;
- recurring add-on quantity: EUR 1/month x number of extra slots;
- payment webhook updates `extra_books` and `subscription_status` on the member account.

The server should store only account/subscription data. Book files/text can remain local.

### 2. Cross-device quota enforcement

The current prototype enforces the book limit per local device library. If one paid account must have exactly N slots across several devices, store only non-content slot records/server-side opaque book IDs (not book text/PDF bytes) and reconcile them on login.

### 3. Voice/model pinning

The build pins an archived Supertonic 3 model revision. Before public/commercial deployment, self-host or otherwise pin the reviewed model/runtime assets. For Norwegian/Icelandic fallback voices, pin the exact Piper model and review its licence/model card.

### 4. Full Latvian grammar

Choose a local or self-hosted language model/dictionary stack if automatic grammar correction is a launch requirement.

## Hosting requirements

- PHP 8.1+ recommended.
- HTTPS required for normal PWA installation/service-worker behavior in production.
- `storage/` must be writable by PHP.
- Apache `.htaccess` support is recommended. If using Nginx, deny direct web access to `config.local.php` and `storage/` in the server config.
- Optional: LibreOffice/`soffice` installed on the server only if legacy DOC/ODT/RTF conversion is enabled.

## Install

1. Upload all files in this folder to the intended web directory.
2. Copy `config.local.php.example` to `config.local.php`.
3. Generate a super-admin password hash:

   `php -r "echo password_hash('YOUR-STRONG-PASSWORD', PASSWORD_DEFAULT), PHP_EOL;"`

4. Put the admin email and generated hash in `config.local.php`.
5. Add the hCaptcha site key and server-only secret. In the hCaptcha dashboard, allow the production hostname.
6. Set `app_base_url` to the exact HTTPS deployment URL and configure the approval email / mail sender.
7. Verify PHP can send the signed approval email (or replace `mail()` with your mail provider).
8. Keep `enable_legacy_doc_conversion` false unless you explicitly want temporary server conversion for old formats.
9. Make `storage/` writable by PHP but blocked from direct HTTP access.
10. Open the site over HTTPS and use the browser's Install/Add to Home Screen option.

## Account/admin behavior

- Guest: no account, one reading item total (file, URL, or pasted text/HTML), 24-hour expiry.
- Member: 3 + `extra_books` retained local books; no guest expiry.
- Super admin: unlimited local books and can add/edit users, grant unlimited access, add extra slots, disable accounts and reset passwords.

`storage/users.json` and `storage/signup_requests.json` are intentionally simple prototype stores. Signed approval tokens use a server-side HMAC secret. For a higher-traffic production service, migrate accounts/entitlements/requests to a transactional database and add CSRF protection, stronger rate limiting and audit logging.

## Third-party runtime libraries

The app shell is self-hosted. The following are loaded on demand from configurable CDN URLs and then can be cached by the service worker:

- Mammoth (DOCX -> HTML)
- PDF.js (PDF rendering/text extraction)
- ONNX Runtime Web + pinned Supertonic 3 model assets (preferred natural local TTS)
- `@mintplex-labs/piper-tts-web` (strict same-language fallback for uncovered languages)
- Tesseract.js (browser-side OCR for image uploads; language data downloads on demand)
- hCaptcha browser widget (login/signup bot protection)

For a fully self-contained/offline-first production deployment, download, review and self-host pinned copies of these libraries and the approved voice models.

## File map

- `index.php` - application shell/bootstrap
- `assets/app.js` - local library, converters, reader, TTS, multilingual UI, hCaptcha, account/admin UI
- `assets/i18n.js` - interface translations
- `assets/natural-tts.js` - Supertonic/ONNX browser TTS integration
- `assets/app.css` - responsive book-reader UI
- `api.php` - session/member/super-admin API, hCaptcha verification, protected public-URL fetch, signed administrator approval + member activation links, and security settings
- `convert.php` - disabled-by-default legacy LibreOffice conversion endpoint
- `service-worker.js` - PWA shell/runtime cache
- `manifest.webmanifest` - install manifest
- `config.local.php.example` - deployment configuration template
- `storage/users.json` - prototype member entitlement store
- `storage/signup_requests.json` - pending/handled signup requests
- `storage/settings.json` - server-side runtime security settings/HMAC secret (created automatically; direct web access is blocked)
