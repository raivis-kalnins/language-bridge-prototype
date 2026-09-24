<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-cache, must-revalidate');
if (isset($_GET['approve'])) header('Cache-Control: no-store');

$configFile = __DIR__ . '/config.local.php';
$config = is_file($configFile) ? require $configFile : [];
$appName = (string)($config['app_name'] ?? 'Book Reader');
$version = '1.3.7';
$settingsFile = __DIR__ . '/storage/settings.json';
$storedSettings = [];
if (is_file($settingsFile)) {
    $decoded = json_decode((string)@file_get_contents($settingsFile), true);
    if (is_array($decoded)) $storedSettings = $decoded;
}
$assetRevision = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($storedSettings['asset_revision'] ?? '')) ?: '';
$assetVersion = $version . ($assetRevision !== '' ? '-' . $assetRevision : '');
$hcaptchaSiteKey = (string)($storedSettings['hcaptcha_site_key'] ?? $config['hcaptcha_site_key'] ?? '');
$superAdminEmail = (string)($config['super_admin_email'] ?? '');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params([
        'httponly' => true,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'samesite' => 'Lax',
    ]);
    session_start();
}

$user = null;
if (!empty($_SESSION['reader_user']) && is_array($_SESSION['reader_user'])) {
    $user = $_SESSION['reader_user'];
}

$plan = [
    'authenticated' => (bool)$user,
    'email' => $user['email'] ?? '',
    'role' => $user['role'] ?? 'guest',
    'bookLimit' => $user ? (int)($user['book_limit'] ?? 3) : 1,
    'unlimited' => (bool)($user['unlimited'] ?? false),
    'guestHours' => 24,
    'baseMonthlyEur' => 3,
    'baseBooks' => 3,
    'extraBookMonthlyEur' => 1,
];
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5">
  <meta name="theme-color" content="#fffef9">
  <meta name="color-scheme" content="light">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="application-name" content="<?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?>">
  <meta name="description" content="Private device-first PDF and DOCX book reader with multilingual natural read-aloud.">
  <link rel="manifest" href="manifest.webmanifest?v=<?= rawurlencode($assetVersion) ?>">
  <link rel="icon" href="assets/icons/owl-book-64.png" type="image/png">
  <link rel="apple-touch-icon" href="assets/icons/owl-book-192.png">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="preconnect" href="https://huggingface.co" crossorigin>
  <link rel="stylesheet" href="assets/app.css?v=<?= rawurlencode($assetVersion) ?>">
  <title><?= htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') ?></title>
</head>
<body>
  <noscript>This application requires JavaScript.</noscript>
  <div id="app"></div>
  <script>
    window.READER_BOOTSTRAP = <?= json_encode([
      'version' => $version,
      'assetVersion' => $assetVersion,
      'appName' => $appName,
      'plan' => $plan,
      'apiBase' => 'api.php',
      'hcaptchaSiteKey' => $hcaptchaSiteKey,
      'hcaptchaEnabled' => $hcaptchaSiteKey !== '',
      'superAdminEmail' => $superAdminEmail,
      'piperModuleUrl' => (string)($config['piper_module_url'] ?? 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/+esm'),
      'mammothUrl' => (string)($config['mammoth_url'] ?? 'https://cdn.jsdelivr.net/npm/mammoth@1.12.3/mammoth.browser.min.js'),
      'pdfJsUrl' => (string)($config['pdfjs_url'] ?? 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.mjs'),
      'pdfWorkerUrl' => (string)($config['pdfworker_url'] ?? 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.mjs'),
      'tesseractUrl' => (string)($config['tesseract_url'] ?? 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js'),
      'naturalModelUrl' => (string)($config['natural_tts_model_url'] ?? 'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46'),
      'ortModuleUrl' => (string)($config['ort_module_url'] ?? 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.all.bundle.min.mjs'),
      'ortWasmBaseUrl' => (string)($config['ort_wasm_base_url'] ?? 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'),
      'lameJsUrl' => (string)($config['lamejs_url'] ?? 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js'),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?>;
  </script>
  <script src="assets/i18n.js?v=<?= rawurlencode($assetVersion) ?>"></script>
  <script src="assets/app.js?v=<?= rawurlencode($assetVersion) ?>" defer></script>
</body>
</html>
