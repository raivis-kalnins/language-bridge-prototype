<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params([
        'httponly' => true,
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'samesite' => 'Lax',
    ]);
    session_start();
}

$configFile = __DIR__ . '/config.local.php';
$config = is_file($configFile) ? require $configFile : [];
$storageDir = __DIR__ . '/storage';
$usersFile = $storageDir . '/users.json';
$signupsFile = $storageDir . '/signup_requests.json';
$settingsFile = $storageDir . '/settings.json';
if (!is_dir($storageDir)) @mkdir($storageDir, 0770, true);
if (!is_file($usersFile)) @file_put_contents($usersFile, "[]\n", LOCK_EX);
if (!is_file($signupsFile)) @file_put_contents($signupsFile, "[]\n", LOCK_EX);

function out(array $payload, int $status = 200): never {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function input(): array {
    $type = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_contains($type, 'application/json')) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw ?: '{}', true);
        return is_array($data) ? $data : [];
    }
    return $_POST;
}
function json_load(string $file): array {
    $raw = @file_get_contents($file);
    $data = json_decode($raw ?: '[]', true);
    return is_array($data) ? array_values(array_filter($data, 'is_array')) : [];
}
function object_load(string $file): array {
    $raw = @file_get_contents($file);
    $data = json_decode($raw ?: '{}', true);
    return is_array($data) ? $data : [];
}
function json_save(string $file, array $items): bool {
    $json = json_encode(array_values($items), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) return false;
    $tmp = $file . '.tmp';
    if (@file_put_contents($tmp, $json . "\n", LOCK_EX) === false) return false;
    return @rename($tmp, $file);
}
function object_save(string $file, array $data): bool {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false) return false;
    $tmp = $file . '.tmp';
    if (@file_put_contents($tmp, $json . "\n", LOCK_EX) === false) return false;
    return @rename($tmp, $file);
}
function clean_line(string $value, int $max = 200): string {
    $value = trim(preg_replace('/[\r\n\t]+/u', ' ', $value) ?? '');
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}
function request_id(): string {
    try { return bin2hex(random_bytes(10)); } catch (Throwable) { return sha1(uniqid('', true)); }
}
function random_secret(): string {
    try { return bin2hex(random_bytes(32)); } catch (Throwable) { return hash('sha256', uniqid('', true) . microtime(true)); }
}
function app_settings(array $config, string $settingsFile): array {
    $stored = object_load($settingsFile);
    $settings = [
        'hcaptcha_site_key' => (string)($stored['hcaptcha_site_key'] ?? $config['hcaptcha_site_key'] ?? ''),
        'hcaptcha_secret' => (string)($stored['hcaptcha_secret'] ?? $config['hcaptcha_secret'] ?? ''),
        'signup_to_email' => (string)($stored['signup_to_email'] ?? $config['signup_to_email'] ?? $config['super_admin_email'] ?? ''),
        'mail_from' => (string)($stored['mail_from'] ?? $config['mail_from'] ?? ''),
        'app_base_url' => rtrim((string)($stored['app_base_url'] ?? $config['app_base_url'] ?? ''), '/'),
        'approval_secret' => (string)($stored['approval_secret'] ?? $config['approval_secret'] ?? ''),
        'approval_hours' => max(1, min(168, (int)($stored['approval_hours'] ?? $config['approval_hours'] ?? 48))),
    ];
    if ($settings['approval_secret'] === '') {
        $settings['approval_secret'] = random_secret();
        $stored['approval_secret'] = $settings['approval_secret'];
        @object_save($settingsFile, array_merge($stored, [
            'approval_secret' => $settings['approval_secret'],
        ]));
    }
    return $settings;
}
function public_user(array $u): array {
    return [
        'email' => (string)($u['email'] ?? ''),
        'role' => (string)($u['role'] ?? 'member'),
        'book_limit' => (int)($u['book_limit'] ?? 3),
        'unlimited' => (bool)($u['unlimited'] ?? false),
        'subscription_status' => (string)($u['subscription_status'] ?? 'active'),
        'payment_status' => (string)($u['payment_status'] ?? (!empty($u['unlimited']) ? 'waived' : 'unknown')),
        'extra_books' => (int)($u['extra_books'] ?? 0),
    ];
}
function session_user(): ?array {
    return !empty($_SESSION['reader_user']) && is_array($_SESSION['reader_user']) ? $_SESSION['reader_user'] : null;
}
function require_admin(): array {
    $u = session_user();
    if (!$u || ($u['role'] ?? '') !== 'superadmin') out(['ok' => false, 'message' => 'Administrator access required.'], 403);
    return $u;
}
function verify_hcaptcha(array $settings, string $token): bool {
    $secret = trim((string)($settings['hcaptcha_secret'] ?? ''));
    $sitekey = trim((string)($settings['hcaptcha_site_key'] ?? ''));
    if ($secret === '' || $sitekey === '' || trim($token) === '') return false;
    $fields = [
        'secret' => $secret,
        'response' => trim($token),
        'sitekey' => $sitekey,
    ];
    $remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($remote !== '') $fields['remoteip'] = $remote;
    $body = http_build_query($fields, '', '&');
    $raw = false;
    if (function_exists('curl_init')) {
        $ch = curl_init('https://api.hcaptcha.com/siteverify');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $raw = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 10,
            'ignore_errors' => true,
        ]]);
        $raw = @file_get_contents('https://api.hcaptcha.com/siteverify', false, $ctx);
    }
    if (!is_string($raw) || $raw === '') return false;
    $result = json_decode($raw, true);
    return is_array($result) && ($result['success'] ?? false) === true;
}
function require_hcaptcha(array $settings, array $data): void {
    if (!verify_hcaptcha($settings, (string)($data['captcha_token'] ?? ''))) {
        out(['ok' => false, 'code' => 'captcha_required', 'message' => 'Please complete the CAPTCHA and try again.'], 422);
    }
}
function approval_signature(array $settings, string $id, int $expires, string $nonce): string {
    return hash_hmac('sha256', $id . '|' . $expires . '|' . $nonce, (string)$settings['approval_secret']);
}
function approval_url(array $settings, array $record): string {
    $base = rtrim((string)($settings['app_base_url'] ?? ''), '/');
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string)($_SERVER['HTTP_HOST'] ?? '')) ?: 'localhost';
        $base = ($https ? 'https://' : 'http://') . $host;
        $path = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
        if ($path !== '') $base .= $path;
    }
    $id = (string)($record['id'] ?? '');
    $expires = (int)($record['approval_expires'] ?? 0);
    $nonce = (string)($record['approval_nonce'] ?? '');
    $token = approval_signature($settings, $id, $expires, $nonce);
    return $base . '/?approve=' . rawurlencode($id) . '&expires=' . $expires . '&token=' . rawurlencode($token) . '&view=account';
}
function verify_approval(array $settings, array $record, int $expires, string $token): bool {
    if ($expires < time() || $expires <= 0) return false;
    if ((int)($record['approval_expires'] ?? 0) !== $expires) return false;
    $nonce = (string)($record['approval_nonce'] ?? '');
    if ($nonce === '') return false;
    $expected = approval_signature($settings, (string)($record['id'] ?? ''), $expires, $nonce);
    return hash_equals($expected, $token);
}
function send_signup_approval(array $settings, array $record): bool {
    $to = trim((string)($settings['signup_to_email'] ?? ''));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $email = (string)($record['email'] ?? '');
    $name = (string)($record['name'] ?? '');
    $books = (int)($record['books'] ?? 3);
    $monthly = (int)($record['monthly_eur'] ?? (3 + max(0, $books - 3)));
    $paymentStatus = (string)($record['payment_status'] ?? 'pending');
    $message = (string)($record['message'] ?? '');
    $uiLanguage = (string)($record['ui_language'] ?? 'en-GB');
    $link = approval_url($settings, $record);
    $subject = 'Book Reader approval required: ' . $email;
    $body = "New Book Reader signup request\n\n"
          . "Name: " . ($name !== '' ? $name : '-') . "\n"
          . "Email: " . $email . "\n"
          . "Requested retained books: " . $books . "\n"
          . "Requested monthly price: EUR " . $monthly . "\n"
          . "Payment status: " . $paymentStatus . " (Super Admin must confirm)\n"
          . "Interface language: " . $uiLanguage . "\n"
          . "Message: " . ($message !== '' ? $message : '-') . "\n"
          . "Created: " . (string)($record['created_at'] ?? '') . "\n\n"
          . "APPROVE SECURELY:\n" . $link . "\n\n"
          . "This signed link expires at: " . gmdate('c', (int)($record['approval_expires'] ?? 0)) . "\n"
          . "For security, the link requires a Super Admin login before the account can be activated.\n";
    $from = trim((string)($settings['mail_from'] ?? ''));
    $headers = [];
    if (filter_var($from, FILTER_VALIDATE_EMAIL)) $headers[] = 'From: Book Reader <' . $from . '>';
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) $headers[] = 'Reply-To: ' . $email;
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    return @mail($to, $subject, $body, implode("\r\n", $headers));
}
function activation_signature(array $settings, string $email, int $expires, string $nonce): string {
    return hash_hmac('sha256', 'activate|' . strtolower($email) . '|' . $expires . '|' . $nonce, (string)$settings['approval_secret']);
}
function activation_url(array $settings, array $record): string {
    $base = rtrim((string)($settings['app_base_url'] ?? ''), '/');
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string)($_SERVER['HTTP_HOST'] ?? '')) ?: 'localhost';
        $base = ($https ? 'https://' : 'http://') . $host;
        $path = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
        if ($path !== '') $base .= $path;
    }
    $email = strtolower((string)($record['email'] ?? ''));
    $expires = (int)($record['activation_expires'] ?? 0);
    $nonce = (string)($record['activation_nonce'] ?? '');
    $token = activation_signature($settings, $email, $expires, $nonce);
    return $base . '/?activate=' . rawurlencode($email) . '&expires=' . $expires . '&token=' . rawurlencode($token) . '&view=account';
}
function verify_activation(array $settings, array $record, int $expires, string $token): bool {
    if ($expires < time() || $expires <= 0) return false;
    if ((int)($record['activation_expires'] ?? 0) !== $expires) return false;
    $nonce = (string)($record['activation_nonce'] ?? '');
    if ($nonce === '') return false;
    $expected = activation_signature($settings, (string)($record['email'] ?? ''), $expires, $nonce);
    return hash_equals($expected, $token);
}
function send_member_activation(array $settings, array $record): bool {
    $to = strtolower(trim((string)($record['email'] ?? '')));
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $link = activation_url($settings, $record);
    $subject = 'Book Reader account approved - activate your account';
    $body = "Your Book Reader account has been approved by the Super Admin.\n\n"
          . "ACTIVATE YOUR ACCOUNT:\n" . $link . "\n\n"
          . "The link expires at: " . gmdate('c', (int)($record['activation_expires'] ?? 0)) . "\n"
          . "Open the secure link, complete CAPTCHA and choose your password.\n"
          . "If you did not request this account, ignore this email.\n";
    $from = trim((string)($settings['mail_from'] ?? ''));
    $headers = [];
    if (filter_var($from, FILTER_VALIDATE_EMAIL)) $headers[] = 'From: Book Reader <' . $from . '>';
    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
    return @mail($to, $subject, $body, implode("\r\n", $headers));
}
function save_pending_member(string $usersFile, string $email, int $extra, bool $unlimited, string $paymentStatus, int $activationExpires, string $activationNonce): bool {
    $users = json_load($usersFile);
    $found = false;
    foreach ($users as &$u) {
        if (strtolower((string)($u['email'] ?? '')) !== $email) continue;
        $found = true;
        $u['role'] = 'member'; $u['unlimited'] = $unlimited; $u['extra_books'] = $extra;
        $u['subscription_status'] = 'pending_activation'; $u['payment_status'] = $paymentStatus; $u['disabled'] = false;
        $u['activation_nonce'] = $activationNonce; $u['activation_expires'] = $activationExpires; $u['updated_at'] = gmdate('c');
        break;
    }
    unset($u);
    if (!$found) $users[] = ['email'=>$email,'role'=>'member','unlimited'=>$unlimited,'extra_books'=>$extra,'subscription_status'=>'pending_activation','payment_status'=>$paymentStatus,'disabled'=>false,'activation_nonce'=>$activationNonce,'activation_expires'=>$activationExpires,'created_at'=>gmdate('c')];
    return json_save($usersFile, $users);
}
function is_public_ip(string $ip): bool { return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false; }
function validate_public_url(string $url): array {
    $url = trim($url); if ($url === '' || strlen($url) > 2048) return [false, 'Invalid URL.'];
    $parts = parse_url($url); if (!is_array($parts) || !in_array(strtolower((string)($parts['scheme'] ?? '')), ['http','https'], true)) return [false, 'Only HTTP or HTTPS URLs are allowed.'];
    if (!empty($parts['user']) || !empty($parts['pass'])) return [false, 'URLs with embedded credentials are not allowed.'];
    $host = strtolower((string)($parts['host'] ?? '')); if ($host === '' || $host === 'localhost' || str_ends_with($host, '.local')) return [false, 'This host is not allowed.'];
    $ips=[]; if(filter_var($host,FILTER_VALIDATE_IP))$ips[]=$host; else { $records=@dns_get_record($host,DNS_A|DNS_AAAA); if(is_array($records))foreach($records as $r){if(!empty($r['ip']))$ips[]=(string)$r['ip'];if(!empty($r['ipv6']))$ips[]=(string)$r['ipv6'];} if(!$ips){$fallback=@gethostbyname($host);if($fallback&&$fallback!==$host)$ips[]=$fallback;} }
    if(!$ips)return[false,'Could not resolve this website.']; foreach(array_unique($ips) as $ip)if(!is_public_ip($ip))return[false,'Private or local network URLs are not allowed.']; return[true,$url];
}
function fetch_public_page(string $url): array {
    $current=$url;
    for($hop=0;$hop<4;$hop++){
        [$ok,$checked]=validate_public_url($current); if(!$ok)return['ok'=>false,'message'=>$checked];
        $headers='';$body='';$status=0;$type='';
        if(function_exists('curl_init')){
            $ch=curl_init($current); curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_HEADER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>6,CURLOPT_TIMEOUT=>15,CURLOPT_ENCODING=>'',CURLOPT_USERAGENT=>'BookReader/1.2.6 (+https://book.63.lv/)',CURLOPT_HTTPHEADER=>['Accept: text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1']]);
            $raw=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);$headerSize=(int)curl_getinfo($ch,CURLINFO_HEADER_SIZE);$type=strtolower((string)curl_getinfo($ch,CURLINFO_CONTENT_TYPE));$err=curl_error($ch);curl_close($ch);if(!is_string($raw))return['ok'=>false,'message'=>$err!==''?$err:'Could not load this URL.'];$headers=substr($raw,0,$headerSize);$body=substr($raw,$headerSize);
        } else {
            $ctx=stream_context_create(['http'=>['method'=>'GET','timeout'=>15,'ignore_errors'=>true,'follow_location'=>0,'max_redirects'=>0,'header'=>"User-Agent: BookReader/1.2.6 (+https://book.63.lv/)\r\nAccept: text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1\r\nAccept-Encoding: identity\r\n"]]);
            $fp=@fopen($current,'rb',false,$ctx);if(!$fp)return['ok'=>false,'message'=>'Could not load this URL.'];$meta=stream_get_meta_data($fp);$body=(string)stream_get_contents($fp,2*1024*1024+1);fclose($fp);$headerLines=$meta['wrapper_data']??[];if(!is_array($headerLines))$headerLines=[$headerLines];$headers=implode("\r\n",array_map('strval',$headerLines));foreach($headerLines as $line){$line=(string)$line;if(preg_match('#^HTTP/\S+\s+(\d{3})#i',$line,$m))$status=(int)$m[1];if(stripos($line,'Content-Type:')===0)$type=strtolower(trim(substr($line,13)));}
        }
        if($status>=300&&$status<400&&preg_match('/^Location:\s*(.+)$/mi',$headers,$m)){$location=trim($m[1]);if(!preg_match('#^https?://#i',$location)){$p=parse_url($current);if(str_starts_with($location,'//'))$location=($p['scheme']??'https').':'.$location;elseif(str_starts_with($location,'/'))$location=($p['scheme']??'https').'://'.($p['host']??'').$location;else{$path=(string)($p['path']??'/');$dir=rtrim(str_replace('\\','/',dirname($path)),'/');$location=($p['scheme']??'https').'://'.($p['host']??'').($dir?$dir.'/':'/').$location;}}$current=$location;continue;}
        if($status<200||$status>=300)return['ok'=>false,'message'=>'Website returned HTTP '.$status.'.'];if($type!==''&&!str_starts_with($type,'text/html')&&!str_starts_with($type,'application/xhtml+xml')&&!str_starts_with($type,'text/plain'))return['ok'=>false,'message'=>'This URL is not an HTML/text page.'];if(strlen($body)>2*1024*1024)return['ok'=>false,'message'=>'This page is too large to import (2 MB limit).'];
        $title='';if(preg_match('/<title[^>]*>(.*?)<\\/title>/is',$body,$m))$title=clean_line(html_entity_decode(strip_tags($m[1]),ENT_QUOTES|ENT_HTML5,'UTF-8'),160);return['ok'=>true,'html'=>$body,'title'=>$title,'final_url'=>$current];
    }
    return['ok'=>false,'message'=>'Too many redirects.'];
}
function find_request(array $items, string $id): array {
    foreach ($items as $item) if ((string)($item['id'] ?? '') === $id) return $item;
    return [];
}
function save_member(string $usersFile, string $email, string $password, int $extra, bool $unlimited, bool $disabled = false, ?string $paymentStatus = null): bool {
    $users = json_load($usersFile);
    $found = false;
    foreach ($users as &$u) {
        if (strtolower((string)($u['email'] ?? '')) !== $email) continue;
        $found = true;
        if ($password !== '') $u['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
        $u['unlimited'] = $unlimited;
        $u['extra_books'] = $extra;
        $u['subscription_status'] = $unlimited ? 'admin-grant' : 'active';
        if ($paymentStatus !== null) $u['payment_status'] = $paymentStatus;
        $u['disabled'] = $disabled;
        $u['updated_at'] = gmdate('c');
        break;
    }
    unset($u);
    if (!$found) {
        if ($password === '') return false;
        $users[] = [
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => 'member',
            'unlimited' => $unlimited,
            'extra_books' => $extra,
            'subscription_status' => $unlimited ? 'admin-grant' : 'active',
            'payment_status' => $paymentStatus ?? ($unlimited ? 'waived' : 'manual'),
            'disabled' => $disabled,
            'created_at' => gmdate('c'),
        ];
    }
    return json_save($usersFile, $users);
}

$settings = app_settings($config, $settingsFile);
$data = input();
$action = (string)($data['action'] ?? $_GET['action'] ?? 'session');

if ($action === 'session') {
    $u = session_user();
    out(['ok' => true, 'user' => $u ? public_user($u) : null]);
}

if ($action === 'login') {
    require_hcaptcha($settings, $data);
    $email = strtolower(trim((string)($data['email'] ?? '')));
    $password = (string)($data['password'] ?? '');
    if ($email === '' || $password === '') out(['ok' => false, 'message' => 'Email and password are required.'], 422);

    $adminEmail = strtolower(trim((string)($config['super_admin_email'] ?? '')));
    $adminHash = (string)($config['super_admin_password_hash'] ?? '');
    if ($adminEmail !== '' && $adminHash !== '' && hash_equals($adminEmail, $email) && password_verify($password, $adminHash)) {
        $u = ['email' => $adminEmail, 'role' => 'superadmin', 'book_limit' => 2147483647, 'unlimited' => true, 'subscription_status' => 'admin', 'extra_books' => 0];
        $_SESSION['reader_user'] = $u;
        session_regenerate_id(true);
        out(['ok' => true, 'user' => public_user($u)]);
    }

    foreach (json_load($usersFile) as $record) {
        if (strtolower((string)($record['email'] ?? '')) !== $email) continue;
        if (($record['disabled'] ?? false) === true) out(['ok' => false, 'message' => 'Account disabled.'], 403);
        if ((string)($record['subscription_status'] ?? '') === 'pending_activation') out(['ok' => false, 'message' => 'Account approved. Open the activation link sent to your email to set your password.'], 403);
        $hash = (string)($record['password_hash'] ?? '');
        if ($hash !== '' && password_verify($password, $hash)) {
            $extra = max(0, (int)($record['extra_books'] ?? 0));
            $record['book_limit'] = !empty($record['unlimited']) ? 2147483647 : 3 + $extra;
            $_SESSION['reader_user'] = public_user($record);
            session_regenerate_id(true);
            out(['ok' => true, 'user' => public_user($record)]);
        }
    }
    usleep(250000);
    out(['ok' => false, 'message' => 'Invalid email or password.'], 401);
}

if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    out(['ok' => true]);
}

if ($action === 'quote') {
    $count = max(1, min(999, (int)($data['books'] ?? $_GET['books'] ?? 3)));
    $price = 3 + max(0, $count - 3);
    out(['ok' => true, 'books' => $count, 'monthly_eur' => $price, 'base_books' => 3, 'extra_books' => max(0, $count - 3)]);
}

if ($action === 'fetch_url') {
    $last = (int)($_SESSION['reader_url_last'] ?? 0);
    if ($last > 0 && time() - $last < 2) out(['ok' => false, 'message' => 'Please wait a moment before loading another URL.'], 429);
    $url = trim((string)($data['url'] ?? ''));
    $result = fetch_public_page($url);
    if (!($result['ok'] ?? false)) out($result, 422);
    $_SESSION['reader_url_last'] = time(); out($result);
}

if ($action === 'signup_request') {
    if (trim((string)($data['website'] ?? '')) !== '') out(['ok' => true, 'mail_sent' => true]);
    require_hcaptcha($settings, $data);
    $last = (int)($_SESSION['reader_signup_last'] ?? 0);
    if ($last > 0 && time() - $last < 30) out(['ok' => false, 'message' => 'Please wait before sending another request.'], 429);

    $name = clean_line((string)($data['name'] ?? ''), 120);
    $email = strtolower(trim((string)($data['email'] ?? '')));
    $books = max(3, min(999, (int)($data['books'] ?? 3)));
    $message = trim((string)($data['message'] ?? ''));
    $message = function_exists('mb_substr') ? mb_substr($message, 0, 1500, 'UTF-8') : substr($message, 0, 1500);
    $uiLanguage = clean_line((string)($data['ui_language'] ?? 'en-GB'), 20);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'message' => 'Valid email required.'], 422);

    $requests = json_load($signupsFile);
    $record = [
        'id' => request_id(),
        'name' => $name,
        'email' => $email,
        'books' => $books,
        'monthly_eur' => 3 + max(0, $books - 3),
        'payment_status' => 'pending',
        'message' => $message,
        'ui_language' => $uiLanguage,
        'status' => 'pending',
        'created_at' => gmdate('c'),
        'approval_nonce' => random_secret(),
        'approval_expires' => time() + ((int)$settings['approval_hours'] * 3600),
    ];
    $requests[] = $record;
    if (!json_save($signupsFile, $requests)) out(['ok' => false, 'message' => 'Unable to save request.'], 500);
    $_SESSION['reader_signup_last'] = time();
    $mailSent = send_signup_approval($settings, $record);
    out(['ok' => true, 'mail_sent' => $mailSent, 'approval_required' => true]);
}

if ($action === 'admin_get_settings') {
    require_admin();
    out(['ok' => true, 'settings' => [
        'hcaptcha_site_key' => (string)$settings['hcaptcha_site_key'],
        'hcaptcha_secret_set' => trim((string)$settings['hcaptcha_secret']) !== '',
        'signup_to_email' => (string)$settings['signup_to_email'],
        'mail_from' => (string)$settings['mail_from'],
        'app_base_url' => (string)$settings['app_base_url'],
        'approval_hours' => (int)$settings['approval_hours'],
        'asset_revision' => (string)(object_load($settingsFile)['asset_revision'] ?? ''),
        'cache_cleared_at' => (string)(object_load($settingsFile)['cache_cleared_at'] ?? ''),
    ]]);
}

if ($action === 'admin_clear_cache') {
    require_admin();
    $stored = object_load($settingsFile);
    $revision = gmdate('YmdHis') . '-' . substr(request_id(), 0, 8);
    $stored['asset_revision'] = $revision;
    $stored['cache_cleared_at'] = gmdate('c');
    if (!object_save($settingsFile, $stored)) out(['ok' => false, 'message' => 'Unable to publish a new cache revision.'], 500);
    out(['ok' => true, 'revision' => $revision, 'cleared_at' => $stored['cache_cleared_at']]);
}

if ($action === 'admin_save_settings') {
    require_admin();
    $stored = object_load($settingsFile);
    $site = clean_line((string)($data['hcaptcha_site_key'] ?? ''), 120);
    $secret = trim((string)($data['hcaptcha_secret'] ?? ''));
    $signupTo = strtolower(trim((string)($data['signup_to_email'] ?? '')));
    $mailFrom = strtolower(trim((string)($data['mail_from'] ?? '')));
    $baseUrl = rtrim(trim((string)($data['app_base_url'] ?? '')), '/');
    $hours = max(1, min(168, (int)($data['approval_hours'] ?? 48)));
    if ($site === '') out(['ok' => false, 'message' => 'hCaptcha site key is required.'], 422);
    if (!filter_var($signupTo, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'message' => 'Valid approval email required.'], 422);
    if ($mailFrom !== '' && !filter_var($mailFrom, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'message' => 'Mail From must be a valid email address.'], 422);
    if ($baseUrl !== '' && !filter_var($baseUrl, FILTER_VALIDATE_URL)) out(['ok' => false, 'message' => 'Application URL must be a valid HTTPS URL.'], 422);
    if ($baseUrl !== '' && !str_starts_with(strtolower($baseUrl), 'https://')) out(['ok' => false, 'message' => 'Application URL must use HTTPS.'], 422);
    $stored['hcaptcha_site_key'] = $site;
    if ($secret !== '') $stored['hcaptcha_secret'] = $secret;
    $stored['signup_to_email'] = $signupTo;
    $stored['mail_from'] = $mailFrom;
    $stored['app_base_url'] = $baseUrl;
    $stored['approval_hours'] = $hours;
    if (empty($stored['approval_secret'])) $stored['approval_secret'] = $settings['approval_secret'];
    if (!object_save($settingsFile, $stored)) out(['ok' => false, 'message' => 'Unable to save security settings.'], 500);
    out(['ok' => true, 'reload_required' => true]);
}

if ($action === 'admin_list_users') {
    require_admin();
    $items = array_map(fn($u) => [
        'email' => (string)($u['email'] ?? ''),
        'unlimited' => (bool)($u['unlimited'] ?? false),
        'extra_books' => (int)($u['extra_books'] ?? 0),
        'subscription_status' => (string)($u['subscription_status'] ?? 'active'),
        'payment_status' => (string)($u['payment_status'] ?? (!empty($u['unlimited']) ? 'waived' : 'unknown')),
        'disabled' => (bool)($u['disabled'] ?? false),
        'created_at' => (string)($u['created_at'] ?? ''),
    ], json_load($usersFile));
    out(['ok' => true, 'users' => $items]);
}

if ($action === 'admin_save_user') {
    require_admin();
    $email = strtolower(trim((string)($data['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['ok' => false, 'message' => 'Valid email required.'], 422);
    $password = (string)($data['password'] ?? '');
    $unlimited = !empty($data['unlimited']);
    $extra = max(0, min(996, (int)($data['extra_books'] ?? 0)));
    $disabled = !empty($data['disabled']);
    $exists = false;
    foreach (json_load($usersFile) as $u) if (strtolower((string)($u['email'] ?? '')) === $email) { $exists = true; break; }
    if (!$exists && $password === '') out(['ok' => false, 'message' => 'Password is required for a new user.'], 422);
    if (!save_member($usersFile, $email, $password, $extra, $unlimited, $disabled)) out(['ok' => false, 'message' => 'Unable to save account.'], 500);
    out(['ok' => true]);
}

if ($action === 'admin_list_signups') {
    require_admin();
    $items = json_load($signupsFile);
    foreach ($items as &$item) {
        unset($item['approval_nonce']);
        $item['approval_expired'] = (int)($item['approval_expires'] ?? 0) < time();
    }
    unset($item);
    usort($items, fn($a, $b) => strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? '')));
    out(['ok' => true, 'requests' => $items]);
}

if ($action === 'admin_resend_approval') {
    require_admin();
    $id = trim((string)($data['id'] ?? ''));
    $items = json_load($signupsFile);
    $record = [];
    foreach ($items as &$item) {
        if ((string)($item['id'] ?? '') !== $id) continue;
        if (!in_array((string)($item['status'] ?? 'pending'), ['pending', 'awaiting_payment'], true)) out(['ok' => false, 'message' => 'This signup request is no longer pending.'], 409);
        $item['approval_nonce'] = random_secret();
        $item['approval_expires'] = time() + ((int)$settings['approval_hours'] * 3600);
        $item['approval_resent_at'] = gmdate('c');
        $record = $item;
        break;
    }
    unset($item);
    if (!$record) out(['ok' => false, 'message' => 'Signup request not found.'], 404);
    if (!json_save($signupsFile, $items)) out(['ok' => false, 'message' => 'Unable to update request.'], 500);
    $mailSent = send_signup_approval($settings, $record);
    out(['ok' => true, 'mail_sent' => $mailSent]);
}

if ($action === 'admin_approval_info') {
    require_admin();
    $id = trim((string)($data['id'] ?? ''));
    $expires = (int)($data['expires'] ?? 0);
    $token = trim((string)($data['token'] ?? ''));
    $record = find_request(json_load($signupsFile), $id);
    if (!$record) out(['ok' => false, 'message' => 'Signup request not found.'], 404);
    if (!in_array((string)($record['status'] ?? 'pending'), ['pending', 'awaiting_payment'], true)) out(['ok' => false, 'message' => 'This signup request has already been handled.'], 409);
    if (!verify_approval($settings, $record, $expires, $token)) out(['ok' => false, 'message' => 'Approval link is invalid or expired. Resend it from the admin panel.'], 403);
    unset($record['approval_nonce']);
    out(['ok' => true, 'request' => $record]);
}

if ($action === 'admin_approve_signup') {
    require_admin();
    $id = trim((string)($data['id'] ?? '')); $expires = (int)($data['expires'] ?? 0); $token = trim((string)($data['token'] ?? ''));
    $extra = max(0, min(996, (int)($data['extra_books'] ?? 0))); $unlimited = !empty($data['unlimited']); $paymentStatus = (string)($data['payment_status'] ?? 'pending');
    if (!in_array($paymentStatus, ['received', 'not_received'], true)) out(['ok'=>false,'message'=>'Choose whether payment has been received.'],422);
    $items=json_load($signupsFile);$record=find_request($items,$id);if(!$record)out(['ok'=>false,'message'=>'Signup request not found.'],404);if(!in_array((string)($record['status']??'pending'),['pending','awaiting_payment'],true))out(['ok'=>false,'message'=>'This signup request has already been handled.'],409);if(!verify_approval($settings,$record,$expires,$token))out(['ok'=>false,'message'=>'Approval link is invalid or expired.'],403);
    $adminEmail=(string)(session_user()['email']??'superadmin');$now=gmdate('c');
    if($paymentStatus==='not_received'&&!$unlimited){foreach($items as &$item){if((string)($item['id']??'')!==$id)continue;$item['status']='awaiting_payment';$item['payment_status']='not_received';$item['payment_checked_at']=$now;$item['payment_checked_by']=$adminEmail;$item['updated_at']=$now;break;}unset($item);if(!json_save($signupsFile,$items))out(['ok'=>false,'message'=>'Unable to update payment status.'],500);out(['ok'=>true,'activated'=>false,'approved'=>false,'payment_status'=>'not_received']);}
    $email=strtolower(trim((string)($record['email']??'')));if(!filter_var($email,FILTER_VALIDATE_EMAIL))out(['ok'=>false,'message'=>'Signup email is invalid.'],422);$memberPaymentStatus=$unlimited?'waived':'received';$activationExpires=time()+((int)$settings['approval_hours']*3600);$activationNonce=random_secret();if(!save_pending_member($usersFile,$email,$extra,$unlimited,$memberPaymentStatus,$activationExpires,$activationNonce))out(['ok'=>false,'message'=>'Unable to create pending account.'],500);$pendingRecord=['email'=>$email,'activation_expires'=>$activationExpires,'activation_nonce'=>$activationNonce];$activationSent=send_member_activation($settings,$pendingRecord);
    foreach($items as &$item){if((string)($item['id']??'')!==$id)continue;$item['status']='approved_waiting_activation';$item['payment_status']=$memberPaymentStatus;$item['payment_checked_at']=$now;$item['payment_checked_by']=$adminEmail;$item['approved_at']=$now;$item['approved_by']=$adminEmail;$item['activation_email_sent']=$activationSent;$item['approval_nonce']='';break;}unset($item);if(!json_save($signupsFile,$items))out(['ok'=>false,'message'=>'Account approved, but signup status could not be updated.'],500);out(['ok'=>true,'activated'=>false,'approved'=>true,'activation_sent'=>$activationSent,'email'=>$email,'payment_status'=>$memberPaymentStatus]);
}

if ($action === 'admin_resend_activation') {
    require_admin();$email=strtolower(trim((string)($data['email']??'')));if(!filter_var($email,FILTER_VALIDATE_EMAIL))out(['ok'=>false,'message'=>'Valid email required.'],422);$users=json_load($usersFile);$record=null;foreach($users as &$u){if(strtolower((string)($u['email']??''))!==$email)continue;if((string)($u['subscription_status']??'')!=='pending_activation')out(['ok'=>false,'message'=>'This account is not waiting for activation.'],409);$u['activation_nonce']=random_secret();$u['activation_expires']=time()+((int)$settings['approval_hours']*3600);$record=$u;break;}unset($u);if(!$record)out(['ok'=>false,'message'=>'Pending account not found.'],404);if(!json_save($usersFile,$users))out(['ok'=>false,'message'=>'Unable to update activation link.'],500);$sent=send_member_activation($settings,$record);out(['ok'=>true,'mail_sent'=>$sent]);
}

if ($action === 'activation_info') {
    $email=strtolower(trim((string)($data['email']??'')));$expires=(int)($data['expires']??0);$token=trim((string)($data['token']??''));$record=[];foreach(json_load($usersFile) as $u)if(strtolower((string)($u['email']??''))===$email){$record=$u;break;}if(!$record||(string)($record['subscription_status']??'')!=='pending_activation')out(['ok'=>false,'message'=>'Activation link is invalid or already used.'],403);if(!verify_activation($settings,$record,$expires,$token))out(['ok'=>false,'message'=>'Activation link is invalid or expired.'],403);out(['ok'=>true,'email'=>$email]);
}

if ($action === 'activate_account') {
    require_hcaptcha($settings,$data);$email=strtolower(trim((string)($data['email']??'')));$expires=(int)($data['expires']??0);$token=trim((string)($data['token']??''));$password=(string)($data['password']??'');if(strlen($password)<8)out(['ok'=>false,'message'=>'Password must contain at least 8 characters.'],422);$users=json_load($usersFile);$public=null;foreach($users as &$u){if(strtolower((string)($u['email']??''))!==$email)continue;if((string)($u['subscription_status']??'')!=='pending_activation'||!verify_activation($settings,$u,$expires,$token))out(['ok'=>false,'message'=>'Activation link is invalid or expired.'],403);$u['password_hash']=password_hash($password,PASSWORD_DEFAULT);$u['subscription_status']=!empty($u['unlimited'])?'admin-grant':'active';$u['activation_nonce']='';$u['activation_expires']=0;$u['activated_at']=gmdate('c');$u['updated_at']=gmdate('c');$extra=max(0,(int)($u['extra_books']??0));$u['book_limit']=!empty($u['unlimited'])?2147483647:3+$extra;$public=public_user($u);break;}unset($u);if(!$public)out(['ok'=>false,'message'=>'Activation account was not found.'],404);if(!json_save($usersFile,$users))out(['ok'=>false,'message'=>'Unable to activate account.'],500);$requests=json_load($signupsFile);foreach($requests as &$r){if(strtolower((string)($r['email']??''))===$email&&(string)($r['status']??'')==='approved_waiting_activation'){$r['status']='handled';$r['activated_at']=gmdate('c');break;}}unset($r);@json_save($signupsFile,$requests);$_SESSION['reader_user']=$public;session_regenerate_id(true);out(['ok'=>true,'user'=>$public]);
}

if ($action === 'admin_signup_status') {
    require_admin();
    $id = trim((string)($data['id'] ?? ''));
    $status = (string)($data['status'] ?? 'handled');
    if (!in_array($status, ['pending', 'awaiting_payment', 'approved_waiting_activation', 'handled'], true)) $status = 'handled';
    $items = json_load($signupsFile);
    $found = false;
    foreach ($items as &$item) {
        if ((string)($item['id'] ?? '') !== $id) continue;
        $item['status'] = $status;
        $item['updated_at'] = gmdate('c');
        if ($status === 'pending' && (string)($item['payment_status'] ?? '') === 'not_received') $item['payment_status'] = 'pending';
        if ($status === 'handled') $item['approval_nonce'] = '';
        $found = true;
        break;
    }
    unset($item);
    if (!$found) out(['ok' => false, 'message' => 'Signup request not found.'], 404);
    if (!json_save($signupsFile, $items)) out(['ok' => false, 'message' => 'Unable to update request.'], 500);
    out(['ok' => true]);
}

out(['ok' => false, 'message' => 'Unknown action.'], 404);
