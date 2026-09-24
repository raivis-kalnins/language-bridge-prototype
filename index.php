<?php
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-cache, must-revalidate');
$version = '0.1.0';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#fffdf7">
  <meta name="color-scheme" content="light">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="description" content="Free local-first Latvian-English language practice with conversation, pronunciation, vocabulary, grammar and games.">
  <link rel="manifest" href="manifest.webmanifest?v=<?= rawurlencode($version) ?>">
  <link rel="icon" href="assets/icons/owl-book-64.png" type="image/png">
  <link rel="apple-touch-icon" href="assets/icons/owl-book-192.png">
  <link rel="stylesheet" href="assets/app.css?v=<?= rawurlencode($version) ?>">
  <title>Valodu Tilts / Language Bridge</title>
</head>
<body>
  <noscript>This application requires JavaScript.</noscript>
  <div id="app"></div>
  <script>window.LB_BOOTSTRAP = <?= json_encode(['version'=>$version], JSON_UNESCAPED_SLASHES) ?>;</script>
  <script src="assets/app.js?v=<?= rawurlencode($version) ?>" defer></script>
</body>
</html>
