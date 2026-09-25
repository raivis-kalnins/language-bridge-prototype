<?php
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
$version = '0.6.5';
$checks = [
  'index.php' => __DIR__ . '/index.php',
  'app JS' => __DIR__ . '/assets/app-v0.6.5.js',
  'app CSS' => __DIR__ . '/assets/app-v0.6.5.css',
  'service worker' => __DIR__ . '/service-worker-v0.6.5.js',
  'version.json' => __DIR__ . '/version.json',
  'QA report' => __DIR__ . '/QA-REPORT.md',
];
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Language Bridge deployment check</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:40px auto;padding:0 18px;background:#f7f7fb;color:#17202b}.card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:20px;margin:14px 0}.ok{color:#087a55}.bad{color:#b42318}code{background:#f1f1f5;padding:3px 6px;border-radius:6px}.btn{display:inline-block;padding:10px 14px;border:1px solid #ccc;border-radius:10px;text-decoration:none;color:inherit;background:#fff}</style></head><body><h1>Language Bridge deployment check</h1><div class="card"><strong>Expected live build:</strong> <code><?=htmlspecialchars($version)?></code><p>If the application footer shows another version, the live document root was not replaced.</p></div><div class="card"><h2>Files in this document root</h2><?php foreach($checks as $name=>$path): $ok=is_file($path); ?><p class="<?=$ok?'ok':'bad'?>"><?=$ok?'✓':'✗'?> <?=htmlspecialchars($name)?> <?= $ok ? '(' . number_format(filesize($path)) . ' bytes)' : 'missing' ?></p><?php endforeach; ?></div><div class="card"><h2>Quick links</h2><p><a class="btn" href="version.json?nocache=<?=time()?>">Open version.json</a> <a class="btn" href="repair.html?nocache=<?=time()?>">Open repair page</a> <a class="btn" href="./?fresh=<?=time()?>">Open app fresh</a> <a class="btn" href="QA-REPORT.md?nocache=<?=time()?>">QA report</a></p></div></body></html>
