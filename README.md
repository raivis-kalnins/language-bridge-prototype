# Language Bridge v0.7.1

Deployment package for `language.63.lv` with refreshed modern branding, larger responsive header logo, improved mobile install UX and Android/iOS PWA icons.

## New in v0.7.1

- Replaced the detailed legacy logo with a cleaner speech-bubble + bridge mark that stays legible at small sizes.
- Header branding defaults to **76 px desktop / 64 px mobile** and remains configurable in Super Admin.
- Added Android **maskable** 192/512 icons so the installed app fills the launcher icon instead of appearing tiny.
- Added a dedicated **180 px Apple touch icon** and shorter `Lang Bridge` launcher label.
- Mobile install button is now kept visible on narrow phones; the cache-repair shortcut moves to the hamburger menu.
- iPhone/iPad and fallback installs show a simple in-app instruction sheet instead of only a toast.
- Service-worker/cache build bumped to `0.7.1`.

### Existing admin and privacy features retained

- Super Admin route: `/?=admin` (also supports `?admin=1` or `?view=admin`).
- Session-based Super Admin login with CSRF protection, login throttling and password changing.
- Anonymous aggregate statistics for sessions, page views, feature usage and install-button clicks.
- Admin controls for logo size, daily XP goal, public feature visibility, install button, analytics retention and an optional notice banner.
- Learner writing, speech transcripts and lesson content remain browser/local-first as before.

## Deploy

Extract this package into the `language.63.lv` document root. Preserve any existing `api/config.local.php` if Azure Speech is already configured.

The PHP/web-server user must be able to write to the `storage/` directory so the admin panel can save settings, statistics and audit data.

After upload:

1. Open `/deploy-check.php` and confirm all v0.7.1 files are present and `storage/` is writable.
2. Open `/repair.html` and run **Clear app cache & reload** once.
3. If Android/iPhone already has the old tiny home-screen icon, remove that old installed shortcut/app once, reload the site, then install again so the launcher picks up the new PWA icon.
4. Open the public app and confirm the larger logo and install button.
5. Open `/?=admin`, sign in with the deployment Super Admin credentials supplied with this package, then change the temporary password under **Security**.

## Admin files

- `admin-api.php` — login, dashboard, settings and anonymous usage counters.
- `admin-config.local.php` — local session secret and seed Super Admin password hash. Keep this file private and preserve it across future updates.
- `assets/admin.js` / `assets/admin.css` — admin interface.
- `storage/` — settings, analytics, audit and account data. Direct HTTP access is blocked with `.htaccess` on Apache/LiteSpeed and `web.config` on IIS. If you use Nginx, add a server rule that denies requests to `/storage/`.
