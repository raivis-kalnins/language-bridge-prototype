<?php
declare(strict_types=1);
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
$version = '0.6.5';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#5f4bd4">
  <meta name="color-scheme" content="light">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="description" content="Free local-first Latvian-English speaking, writing, pronunciation, dictionary, grammar and game practice.">
  <link rel="manifest" href="manifest.webmanifest?v=<?= rawurlencode($version) ?>">
  <link rel="icon" href="assets/icons/language-bridge-64.png" type="image/png">
  <link rel="apple-touch-icon" href="assets/icons/language-bridge-192.png">
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
  <link rel="preconnect" href="https://esm.sh" crossorigin>
  <link rel="preconnect" href="https://esm.run" crossorigin>
  <link rel="preconnect" href="https://huggingface.co" crossorigin>
  <link rel="stylesheet" href="assets/app-v0.6.5.css?v=<?= rawurlencode($version) ?>">
  <title>Valodu Tilts / Language Bridge</title>
</head>
<body>
  <noscript>This application requires JavaScript.</noscript>
  <div id="app"></div>
  <script>
  (()=>{
    const build=<?= json_encode($version) ?>;
    try{
      const prev=localStorage.getItem('lb_asset_build');
      localStorage.setItem('lb_asset_build',build);
      if(prev&&prev!==build&&'caches' in window){caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('language-bridge')).map(k=>caches.delete(k)))).catch(()=>{});}
    }catch(_){ }
  })();
  window.LB_BOOTSTRAP = <?= json_encode(['version'=>$version], JSON_UNESCAPED_SLASHES) ?>;
  </script>
  <script src="assets/app-v0.6.5.js?v=<?= rawurlencode($version) ?>" defer></script>
</body>
</html>
