# Language Bridge v0.7.0

Deployment package for `language.63.lv` with a larger configurable brand logo and a new Super Admin area.

## New in v0.7.0

- The header logo now uses the 192 px source image and defaults to **64 px on desktop / 52 px on mobile**.
- Logo size can be changed from the admin panel without editing CSS.
- New admin route matching the Radio 63 pattern: `/?=admin` (also supports `?admin=1` or `?view=admin`).
- Session-based Super Admin login with CSRF protection, login throttling and password changing.
- Admin statistics for anonymous aggregate app sessions, page views, feature usage and install-button clicks.
- Admin settings for the daily XP goal, public feature visibility, install button, analytics retention and an optional public notice banner.
- Public app settings are loaded from the server while learner writing, speech transcripts and lesson content remain browser/local-first as before.
- Cache/service-worker build bumped to `0.7.0`.

## Deploy

Extract this package into the `language.63.lv` document root. Preserve any existing `api/config.local.php` if Azure Speech is already configured.

The PHP/web-server user must be able to write to the `storage/` directory so the admin panel can save settings, statistics and audit data.

After upload:

1. Open `/deploy-check.php` and confirm all v0.7.0 files are present and `storage/` is writable.
2. Open `/repair.html` and run **Clear app cache & reload** once.
3. Open the public app and confirm the larger logo.
4. Open `/?=admin`, sign in with the deployment Super Admin credentials supplied with this package, then change the temporary password under **Security**.

## Admin files

- `admin-api.php` — login, dashboard, settings and anonymous usage counters.
- `admin-config.local.php` — local session secret and seed Super Admin password hash. Keep this file private and preserve it across future updates.
- `assets/admin.js` / `assets/admin.css` — admin interface.
- `storage/` — settings, analytics, audit and account data. Direct HTTP access is blocked with `.htaccess` on Apache/LiteSpeed and `web.config` on IIS. If you use Nginx, add a server rule that denies requests to `/storage/`.
