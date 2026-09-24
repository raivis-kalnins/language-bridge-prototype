<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('X-Content-Type-Options: nosniff');

$lang = $_GET['lang'] ?? '';
$q = trim((string)($_GET['q'] ?? ''));
if (!in_array($lang, ['en','lv'], true) || $q === '' || mb_strlen($q) > 80) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>'Invalid query'], JSON_UNESCAPED_UNICODE);
    exit;
}

function fetch_json(string $url): mixed {
    $body = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'LanguageBridge/0.2 (+https://language.63.lv/)',
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $body = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($body === false || $status < 200 || $status >= 300) return null;
    } else {
        $ctx = stream_context_create(['http'=>[
            'timeout'=>10,
            'header'=>"Accept: application/json\r\nUser-Agent: LanguageBridge/0.2\r\n"
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) return null;
    }
    return json_decode((string)$body, true);
}

if ($lang === 'en') {
    $url = 'https://api.dictionaryapi.dev/api/v2/entries/en/' . rawurlencode($q);
    $data = fetch_json($url);
    if ($data === null) {
        http_response_code(502);
        echo json_encode(['ok'=>false,'error'=>'English dictionary lookup failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok'=>true,'query'=>$q,'source'=>'dictionaryapi.dev','data'=>$data], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}

$encoded = rawurlencode($q);
$words = fetch_json('https://api.tezaurs.lv/v1/words/' . $encoded);
$inflections = fetch_json('https://api.tezaurs.lv/v1/inflections/' . $encoded);
$transcriptions = fetch_json('https://api.tezaurs.lv/v1/transcriptions/' . $encoded . '?encoding=ipa');
if ($words === null && $inflections === null && $transcriptions === null) {
    http_response_code(502);
    echo json_encode(['ok'=>false,'error'=>'Tēzaurs lookup failed'], JSON_UNESCAPED_UNICODE);
    exit;
}
echo json_encode([
    'ok'=>true,
    'query'=>$q,
    'source'=>'api.tezaurs.lv',
    'words'=>$words,
    'inflections'=>$inflections,
    'transcriptions'=>$transcriptions
], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
