<?php
declare(strict_types=1);
require __DIR__ . '/includes/admin-bootstrap.php';

header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');
header('X-Robots-Tag: noindex, nofollow');

$action = (string)($_GET['action'] ?? 'state');
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$input = [];
if ($method !== 'GET') {
    $raw = file_get_contents('php://input');
    $decoded = json_decode((string)$raw, true);
    if (is_array($decoded)) $input = $decoded;
}

try {
    switch ($action) {
        case 'public_settings':
            if ($method !== 'GET') lb_json_out(['ok'=>false,'message'=>'GET required.'], 405);
            lb_json_out(['ok'=>true,'settings'=>lb_public_settings(),'version'=>LB_ADMIN_VERSION]);

        case 'event':
            if ($method !== 'POST') lb_json_out(['ok'=>false,'message'=>'POST required.'], 405);
            $event = lb_clean_text($input['event'] ?? '', 24);
            $view = lb_clean_text($input['view'] ?? 'home', 24);
            $meta = is_array($input['meta'] ?? null) ? $input['meta'] : [];
            lb_analytics_event($event, $view, [
                'ui' => lb_clean_text($meta['ui'] ?? '', 4),
                'learning' => lb_clean_text($meta['learning'] ?? '', 4),
                'levels' => lb_clean_text($meta['level'] ?? '', 4),
            ]);
            lb_json_out(['ok'=>true]);

        case 'state':
            if ($method !== 'GET') lb_json_out(['ok'=>false,'message'=>'GET required.'], 405);
            lb_json_out([
                'ok'=>true,
                'csrfToken'=>lb_csrf_token(),
                'user'=>lb_current_user(),
                'settings'=>lb_public_settings(),
                'version'=>LB_ADMIN_VERSION,
            ]);

        case 'login':
            if ($method !== 'POST') lb_json_out(['ok'=>false,'message'=>'POST required.'], 405);
            lb_require_csrf();
            $login = strtolower(lb_clean_text($input['login'] ?? '', 190));
            $password = (string)($input['password'] ?? '');
            if ($login === '' || $password === '') lb_json_out(['ok'=>false,'message'=>'Email/username and password are required.'], 400);
            lb_check_login_limit($login);
            $user = lb_find_user_by_login($login);
            $valid = $user && ($user['status'] ?? '') === 'active' && ($user['role'] ?? '') === 'superadmin' && password_verify($password, (string)($user['passwordHash'] ?? ''));
            lb_record_login_attempt($login, (bool)$valid);
            if (!$valid) {
                lb_audit('login_failed', ['login'=>$login]);
                lb_json_out(['ok'=>false,'message'=>'Invalid administrator credentials.'], 401);
            }
            session_regenerate_id(true);
            $_SESSION['lb_admin_user'] = (string)$user['id'];
            $_SESSION['lb_csrf'] = bin2hex(random_bytes(24));
            $storedUser = lb_read_admin_user();
            if ($storedUser && (string)($storedUser['id'] ?? '') === (string)$user['id']) {
                $storedUser['lastLoginAt'] = gmdate('c');
                lb_write_admin_user($storedUser);
            }
            lb_audit('login_success');
            lb_json_out(['ok'=>true,'user'=>lb_current_user(),'csrfToken'=>lb_csrf_token()]);

        case 'logout':
            if ($method !== 'POST') lb_json_out(['ok'=>false,'message'=>'POST required.'], 405);
            lb_require_csrf();
            if (lb_current_user()) lb_audit('logout');
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $p = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', (bool)$p['secure'], (bool)$p['httponly']);
            }
            session_destroy();
            lb_boot_session();
            lb_json_out(['ok'=>true,'csrfToken'=>lb_csrf_token()]);

        case 'admin_dashboard':
            if ($method !== 'GET') lb_json_out(['ok'=>false,'message'=>'GET required.'], 405);
            $admin = lb_require_admin();
            $audit = lb_read_json(lb_storage_path('audit.json'), []);
            lb_json_out([
                'ok'=>true,
                'admin'=>$admin,
                'stats'=>lb_analytics_summary(),
                'settings'=>lb_settings(),
                'audit'=>array_slice(is_array($audit)?$audit:[], 0, 100),
                'storage'=>[
                    'analyticsBytes'=>is_file(lb_storage_path('analytics.json')) ? filesize(lb_storage_path('analytics.json')) : 0,
                    'auditBytes'=>is_file(lb_storage_path('audit.json')) ? filesize(lb_storage_path('audit.json')) : 0,
                ],
                'version'=>LB_ADMIN_VERSION,
            ]);

        case 'admin_settings':
            if ($method !== 'POST') lb_json_out(['ok'=>false,'message'=>'POST required.'], 405);
            lb_require_csrf();
            lb_require_admin();
            $incoming = is_array($input['settings'] ?? null) ? $input['settings'] : [];
            $existing = lb_settings();
            $logoSize = max(42, min(96, (int)($incoming['branding']['logoSize'] ?? $existing['branding']['logoSize'])));
            $logoMobile = max(38, min(76, (int)($incoming['branding']['logoMobileSize'] ?? $existing['branding']['logoMobileSize'])));
            $goal = max(5, min(250, (int)($incoming['practice']['dailyXpGoal'] ?? $existing['practice']['dailyXpGoal'])));
            $retention = max(7, min(365, (int)($incoming['analytics']['retentionDays'] ?? $existing['analytics']['retentionDays'])));
            $featureKeys = ['coach','pron','dictionary','grammar','stories','resources','games','reader','installButton'];
            $features = [];
            foreach ($featureKeys as $key) $features[$key] = !empty($incoming['features'][$key]);
            $noticeText = trim((string)($incoming['notice']['text'] ?? ''));
            if (function_exists('mb_substr')) $noticeText = mb_substr($noticeText, 0, 500); else $noticeText = substr($noticeText, 0, 500);
            $clean = [
                'branding'=>['logoSize'=>$logoSize,'logoMobileSize'=>$logoMobile],
                'practice'=>['dailyXpGoal'=>$goal],
                'features'=>$features,
                'analytics'=>['enabled'=>!empty($incoming['analytics']['enabled']),'retentionDays'=>$retention],
                'notice'=>['enabled'=>!empty($incoming['notice']['enabled']),'text'=>$noticeText],
            ];
            lb_save_settings($clean);
            lb_audit('settings_saved', ['logoSize'=>$logoSize,'dailyXpGoal'=>$goal,'analyticsEnabled'=>$clean['analytics']['enabled']]);
            lb_json_out(['ok'=>true,'settings'=>$clean]);

        case 'admin_password':
            if ($method !== 'POST') lb_json_out(['ok'=>false,'message'=>'POST required.'], 405);
            lb_require_csrf();
            $admin = lb_require_admin();
            $current = (string)($input['currentPassword'] ?? '');
            $new = (string)($input['newPassword'] ?? '');
            if (strlen($new) < 12) lb_json_out(['ok'=>false,'message'=>'New password must be at least 12 characters.'], 400);
            $stored = lb_find_user_by_id((string)$admin['id']);
            if (!$stored || !password_verify($current, (string)($stored['passwordHash'] ?? ''))) lb_json_out(['ok'=>false,'message'=>'Current password is incorrect.'], 400);
            $hash = password_hash($new, PASSWORD_DEFAULT);
            $stored['passwordHash'] = $hash;
            $stored['passwordChangedAt'] = gmdate('c');
            lb_write_admin_user($stored);
            lb_audit('password_changed');
            lb_json_out(['ok'=>true]);

        case 'admin_analytics_reset':
            if ($method !== 'POST') lb_json_out(['ok'=>false,'message'=>'POST required.'], 405);
            lb_require_csrf();
            lb_require_admin();
            lb_write_json(lb_storage_path('analytics.json'), ['days'=>[],'updatedAt'=>gmdate('c')]);
            lb_audit('analytics_reset');
            lb_json_out(['ok'=>true]);

        default:
            lb_json_out(['ok'=>false,'message'=>'Unknown action.'], 404);
    }
} catch (Throwable $e) {
    error_log('Language Bridge admin error: ' . $e->getMessage());
    lb_json_out(['ok'=>false,'message'=>$e instanceof InvalidArgumentException ? $e->getMessage() : 'Server error. Check storage permissions and configuration.'], 500);
}
