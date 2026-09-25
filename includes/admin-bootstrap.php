<?php
declare(strict_types=1);

const LB_ADMIN_VERSION = '0.7.0';

function lb_admin_root(): string { return dirname(__DIR__); }
function lb_storage_path(string $name = ''): string {
    $base = lb_admin_root() . '/storage';
    if (!is_dir($base)) @mkdir($base, 0750, true);
    return $name === '' ? $base : $base . '/' . ltrim($name, '/');
}
function lb_admin_config(): array {
    static $config = null;
    if (is_array($config)) return $config;
    $path = lb_admin_root() . '/admin-config.local.php';
    $config = is_file($path) ? (array)require $path : [];
    return $config;
}
function lb_boot_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $cfg = lb_admin_config();
    session_name((string)($cfg['session_name'] ?? 'language_bridge_admin'));
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}
function lb_json_out(array $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function lb_read_json(string $path, mixed $default = []): mixed {
    if (!is_file($path)) return $default;
    $raw = @file_get_contents($path);
    if ($raw === false || trim($raw) === '') return $default;
    $data = json_decode($raw, true);
    return json_last_error() === JSON_ERROR_NONE ? $data : $default;
}
function lb_write_json(string $path, mixed $value): void {
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    $json = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    if (@file_put_contents($tmp, $json, LOCK_EX) === false || !@rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Storage is not writable.');
    }
    @chmod($path, 0640);
}
function lb_update_json(string $path, callable $mutator, mixed $default = []): mixed {
    $lockPath = $path . '.lock';
    $lock = @fopen($lockPath, 'c+');
    if (!$lock) throw new RuntimeException('Could not open storage lock.');
    try {
        if (!flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock storage.');
        $current = lb_read_json($path, $default);
        $next = $mutator($current);
        lb_write_json($path, $next);
        flock($lock, LOCK_UN);
        fclose($lock);
        return $next;
    } catch (Throwable $e) {
        @flock($lock, LOCK_UN);
        @fclose($lock);
        throw $e;
    }
}
function lb_clean_text(mixed $value, int $max = 200): string {
    $text = trim(preg_replace('/\s+/u', ' ', (string)$value) ?? '');
    return function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
}
function lb_id(string $prefix): string { return $prefix . '-' . strtoupper(bin2hex(random_bytes(6))); }
function lb_csrf_token(): string {
    lb_boot_session();
    if (empty($_SESSION['lb_csrf'])) $_SESSION['lb_csrf'] = bin2hex(random_bytes(24));
    return (string)$_SESSION['lb_csrf'];
}
function lb_require_csrf(): void {
    lb_boot_session();
    $token = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token === '' || !hash_equals(lb_csrf_token(), $token)) lb_json_out(['ok'=>false,'message'=>'Security token expired. Refresh and try again.'], 419);
}
function lb_user_store_path(): string { return lb_storage_path('admin-user.php'); }
function lb_read_admin_user(): ?array {
    $path = lb_user_store_path();
    if (!is_file($path)) return null;
    $row = require $path;
    return is_array($row) ? $row : null;
}
function lb_write_admin_user(array $user): void {
    $path = lb_user_store_path();
    $dir = dirname($path);
    if (!is_dir($dir)) @mkdir($dir, 0750, true);
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    $php = "<?php\ndeclare(strict_types=1);\nreturn " . var_export($user, true) . ";\n";
    if (@file_put_contents($tmp, $php, LOCK_EX) === false || !@rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Administrator account storage is not writable.');
    }
    @chmod($path, 0640);
}
function lb_seed_admin(): void {
    if (lb_read_admin_user()) return;
    $cfg = lb_admin_config();
    $seed = (array)($cfg['seed_admin'] ?? []);
    $email = strtolower(trim((string)($seed['email'] ?? '')));
    $hash = trim((string)($seed['password_hash'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $hash === '') return;
    lb_write_admin_user([
        'id' => lb_id('ADM'),
        'fullName' => lb_clean_text($seed['full_name'] ?? 'Administrator', 120),
        'username' => lb_clean_text($seed['username'] ?? 'admin', 80),
        'email' => $email,
        'passwordHash' => $hash,
        'role' => 'superadmin',
        'status' => 'active',
        'createdAt' => gmdate('c'),
        'lastLoginAt' => null,
        'passwordChangedAt' => null,
    ]);
}
function lb_users(): array {
    lb_seed_admin();
    $user = lb_read_admin_user();
    return $user ? [$user] : [];
}

function lb_find_user_by_login(string $login): ?array {
    $needle = strtolower(trim($login));
    foreach (lb_users() as $user) {
        if (strtolower((string)($user['email'] ?? '')) === $needle || strtolower((string)($user['username'] ?? '')) === $needle) return $user;
    }
    return null;
}
function lb_find_user_by_id(string $id): ?array {
    foreach (lb_users() as $user) if ((string)($user['id'] ?? '') === $id) return $user;
    return null;
}
function lb_public_user(array $user): array {
    unset($user['passwordHash']);
    return $user;
}
function lb_current_user(): ?array {
    lb_boot_session();
    $id = (string)($_SESSION['lb_admin_user'] ?? '');
    if ($id === '') return null;
    $user = lb_find_user_by_id($id);
    if (!$user || ($user['status'] ?? '') !== 'active') {
        unset($_SESSION['lb_admin_user']);
        return null;
    }
    return lb_public_user($user);
}
function lb_require_admin(): array {
    $user = lb_current_user();
    if (!$user) lb_json_out(['ok'=>false,'message'=>'Authentication required.'], 401);
    if (($user['role'] ?? '') !== 'superadmin') lb_json_out(['ok'=>false,'message'=>'Super Admin access required.'], 403);
    return $user;
}
function lb_login_key(string $login): string {
    $secret = (string)(lb_admin_config()['app_secret'] ?? 'language-bridge');
    return hash_hmac('sha256', strtolower(trim($login)) . '|' . (string)($_SERVER['REMOTE_ADDR'] ?? ''), $secret);
}
function lb_check_login_limit(string $login): void {
    $key = lb_login_key($login);
    $rows = lb_read_json(lb_storage_path('login-attempts.json'), []);
    $times = array_values(array_filter((array)($rows[$key]['times'] ?? []), static fn($t) => (int)$t >= time() - 900));
    if (count($times) >= 8) throw new RuntimeException('Too many login attempts. Try again in 15 minutes.');
}
function lb_record_login_attempt(string $login, bool $success): void {
    $key = lb_login_key($login);
    lb_update_json(lb_storage_path('login-attempts.json'), function ($rows) use ($key, $success) {
        $rows = is_array($rows) ? $rows : [];
        if ($success) { unset($rows[$key]); return $rows; }
        $times = array_values(array_filter((array)($rows[$key]['times'] ?? []), static fn($t) => (int)$t >= time() - 900));
        $times[] = time();
        $rows[$key] = ['times' => array_slice($times, -8)];
        return $rows;
    }, []);
}
function lb_default_settings(): array {
    return [
        'branding' => [
            'logoSize' => 64,
            'logoMobileSize' => 52,
        ],
        'practice' => [
            'dailyXpGoal' => 30,
        ],
        'features' => [
            'coach' => true,
            'pron' => true,
            'dictionary' => true,
            'grammar' => true,
            'stories' => true,
            'resources' => true,
            'games' => true,
            'reader' => true,
            'installButton' => true,
        ],
        'analytics' => [
            'enabled' => true,
            'retentionDays' => 90,
        ],
        'notice' => [
            'enabled' => false,
            'text' => '',
        ],
    ];
}
function lb_merge_settings(array $base, array $saved): array {
    foreach ($saved as $k => $v) {
        if (is_array($v) && isset($base[$k]) && is_array($base[$k])) $base[$k] = lb_merge_settings($base[$k], $v);
        else $base[$k] = $v;
    }
    return $base;
}
function lb_settings(): array {
    $saved = lb_read_json(lb_storage_path('settings.json'), []);
    return lb_merge_settings(lb_default_settings(), is_array($saved) ? $saved : []);
}
function lb_save_settings(array $settings): void { lb_write_json(lb_storage_path('settings.json'), $settings); }
function lb_public_settings(): array {
    $s = lb_settings();
    return [
        'branding' => $s['branding'],
        'practice' => $s['practice'],
        'features' => $s['features'],
        'analytics' => ['enabled' => (bool)($s['analytics']['enabled'] ?? true)],
        'notice' => $s['notice'],
    ];
}
function lb_audit(string $action, array $context = []): void {
    $user = lb_current_user();
    lb_update_json(lb_storage_path('audit.json'), function ($rows) use ($action, $context, $user) {
        $rows = is_array($rows) ? $rows : [];
        array_unshift($rows, [
            'createdAt' => gmdate('c'),
            'action' => $action,
            'admin' => $user ? (string)($user['email'] ?? '') : '',
            'context' => $context,
        ]);
        return array_slice($rows, 0, 250);
    }, []);
}
function lb_analytics_event(string $event, string $view, array $meta = []): void {
    $settings = lb_settings();
    if (empty($settings['analytics']['enabled'])) return;
    $allowedEvents = ['session','view','install'];
    $allowedViews = ['home','coach','pron','dict','practice','stories','library','games','reader'];
    if (!in_array($event, $allowedEvents, true)) return;
    if (!in_array($view, $allowedViews, true)) $view = 'home';
    $day = gmdate('Y-m-d');
    $retention = max(7, min(365, (int)($settings['analytics']['retentionDays'] ?? 90)));
    lb_update_json(lb_storage_path('analytics.json'), function ($data) use ($event, $view, $day, $retention, $meta) {
        $data = is_array($data) ? $data : [];
        $days = is_array($data['days'] ?? null) ? $data['days'] : [];
        $row = is_array($days[$day] ?? null) ? $days[$day] : [];
        $row['views'] = is_array($row['views'] ?? null) ? $row['views'] : [];
        $row['ui'] = is_array($row['ui'] ?? null) ? $row['ui'] : [];
        $row['learning'] = is_array($row['learning'] ?? null) ? $row['learning'] : [];
        $row['levels'] = is_array($row['levels'] ?? null) ? $row['levels'] : [];
        $row['events'] = (int)($row['events'] ?? 0) + 1;
        if ($event === 'session') $row['sessions'] = (int)($row['sessions'] ?? 0) + 1;
        if ($event === 'view') {
            $row['pageViews'] = (int)($row['pageViews'] ?? 0) + 1;
            $row['views'][$view] = (int)($row['views'][$view] ?? 0) + 1;
        }
        if ($event === 'install') $row['installClicks'] = (int)($row['installClicks'] ?? 0) + 1;
        foreach ([['ui',['en','lv']],['learning',['en','lv']],['levels',['A1','A2','B1','B2','C1','C2']]] as [$key,$allowed]) {
            $value = (string)($meta[$key] ?? '');
            if (in_array($value, $allowed, true)) $row[$key][$value] = (int)($row[$key][$value] ?? 0) + 1;
        }
        $days[$day] = $row;
        $cutoff = gmdate('Y-m-d', time() - ($retention * 86400));
        foreach (array_keys($days) as $key) if ($key < $cutoff) unset($days[$key]);
        ksort($days);
        $data['days'] = $days;
        $data['updatedAt'] = gmdate('c');
        return $data;
    }, ['days'=>[]]);
}

function lb_analytics_summary(): array {
    $data = lb_read_json(lb_storage_path('analytics.json'), ['days'=>[]]);
    $days = is_array($data['days'] ?? null) ? $data['days'] : [];
    $summary = ['today'=>['sessions'=>0,'pageViews'=>0,'installClicks'=>0],'last7'=>['sessions'=>0,'pageViews'=>0],'last30'=>['sessions'=>0,'pageViews'=>0],'views'=>[],'daily'=>[]];
    $now = new DateTimeImmutable('today', new DateTimeZone('UTC'));
    foreach ($days as $date => $row) {
        if (!is_array($row)) continue;
        try { $d = new DateTimeImmutable((string)$date, new DateTimeZone('UTC')); } catch (Throwable) { continue; }
        $age = abs((int)$now->diff($d)->format('%r%a'));
        $sessions = (int)($row['sessions'] ?? 0);
        $pageViews = (int)($row['pageViews'] ?? 0);
        if ($date === $now->format('Y-m-d')) {
            $summary['today'] = ['sessions'=>$sessions,'pageViews'=>$pageViews,'installClicks'=>(int)($row['installClicks'] ?? 0)];
        }
        if ($age <= 6) { $summary['last7']['sessions'] += $sessions; $summary['last7']['pageViews'] += $pageViews; }
        if ($age <= 29) {
            $summary['last30']['sessions'] += $sessions; $summary['last30']['pageViews'] += $pageViews;
            foreach ((array)($row['views'] ?? []) as $view => $count) $summary['views'][$view] = (int)($summary['views'][$view] ?? 0) + (int)$count;
        }
        if ($age <= 13) $summary['daily'][] = ['date'=>$date,'sessions'=>$sessions,'pageViews'=>$pageViews];
    }
    usort($summary['daily'], static fn($a,$b) => strcmp((string)$a['date'], (string)$b['date']));
    arsort($summary['views']);
    return $summary;
}


lb_boot_session();
lb_seed_admin();
