<?php
declare(strict_types=1);

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function json_out(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function speech_config(): array {
    $config = [];
    $local = __DIR__ . '/config.local.php';
    if (is_file($local)) {
        $loaded = require $local;
        if (is_array($loaded)) $config = $loaded;
    }
    $key = trim((string)($config['azure_speech_key'] ?? getenv('AZURE_SPEECH_KEY') ?: ''));
    $region = trim((string)($config['azure_speech_region'] ?? getenv('AZURE_SPEECH_REGION') ?: ''));
    return ['key' => $key, 'region' => $region];
}

$config = speech_config();
$configured = $config['key'] !== '' && $config['region'] !== '';

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['status'])) {
    json_out([
        'ok' => true,
        'configured' => $configured,
        'provider' => 'azure-speech',
        'voices' => $configured ? [
            'lv-LV-EveritaNeural',
            'en-GB-SoniaNeural',
            'en-GB-RyanNeural'
        ] : []
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_out(['ok' => false, 'error' => 'POST required'], 405);
}
if (!$configured) {
    json_out(['ok' => false, 'error' => 'Online voice is not configured on this server.'], 503);
}

$raw = file_get_contents('php://input');
$data = json_decode((string)$raw, true);
if (!is_array($data)) json_out(['ok' => false, 'error' => 'Invalid JSON'], 400);

$text = trim((string)($data['text'] ?? ''));
$voice = trim((string)($data['voice'] ?? ''));
$rate = (float)($data['rate'] ?? 1.0);
$allowed = [
    'lv-LV-EveritaNeural' => 'lv-LV',
    'en-GB-SoniaNeural' => 'en-GB',
    'en-GB-RyanNeural' => 'en-GB',
];
if ($text === '' || mb_strlen($text) > 2500) json_out(['ok' => false, 'error' => 'Text must be 1-2500 characters.'], 400);
if (!isset($allowed[$voice])) json_out(['ok' => false, 'error' => 'Voice is not allowed.'], 400);
$rate = max(0.65, min(1.15, $rate));
$ratePct = (int)round(($rate - 1.0) * 100);
$rateValue = ($ratePct >= 0 ? '+' : '') . $ratePct . '%';
$lang = $allowed[$voice];

$xmlText = htmlspecialchars($text, ENT_XML1 | ENT_QUOTES, 'UTF-8');
$xmlVoice = htmlspecialchars($voice, ENT_XML1 | ENT_QUOTES, 'UTF-8');
$xmlRate = htmlspecialchars($rateValue, ENT_XML1 | ENT_QUOTES, 'UTF-8');
$ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' . $lang . '">' .
        '<voice name="' . $xmlVoice . '"><prosody rate="' . $xmlRate . '">' . $xmlText . '</prosody></voice></speak>';

$url = 'https://' . rawurlencode($config['region']) . '.tts.speech.microsoft.com/cognitiveservices/v1';
$audio = false;
$status = 0;
$errorBody = '';

if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $ssml,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Ocp-Apim-Subscription-Key: ' . $config['key'],
            'Content-Type: application/ssml+xml',
            'X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3',
            'User-Agent: LanguageBridge/0.4.4'
        ],
    ]);
    $audio = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($audio === false) $errorBody = curl_error($ch);
    curl_close($ch);
} else {
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'timeout' => 30,
        'ignore_errors' => true,
        'header' => "Ocp-Apim-Subscription-Key: {$config['key']}\r\n" .
                    "Content-Type: application/ssml+xml\r\n" .
                    "X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3\r\n" .
                    "User-Agent: LanguageBridge/0.4.4\r\n",
        'content' => $ssml,
    ]]);
    $audio = @file_get_contents($url, false, $ctx);
    $headers = $http_response_header ?? [];
    foreach ($headers as $h) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $h, $m)) $status = (int)$m[1];
    }
}

if ($audio === false || $status < 200 || $status >= 300) {
    error_log('LanguageBridge Azure TTS failed: HTTP ' . $status . ' ' . $errorBody);
    json_out(['ok' => false, 'error' => 'Online voice request failed. Check the Azure Speech key and region.'], 502);
}

header('Content-Type: audio/mpeg');
header('Content-Length: ' . strlen((string)$audio));
header('Content-Disposition: inline; filename="speech.mp3"');
echo $audio;
