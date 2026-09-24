<?php
declare(strict_types=1);
$configFile = __DIR__ . '/config.local.php';
$config = is_file($configFile) ? require $configFile : [];
header('Cache-Control: no-store');

function fail(string $message, int $status = 400): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
if (empty($config['enable_legacy_doc_conversion'])) fail('Legacy DOC/ODT/RTF conversion is disabled. Save the document as DOCX for fully device-only conversion.', 503);
if ($_SERVER['REQUEST_METHOD'] !== 'POST' || empty($_FILES['file']['tmp_name'])) fail('No document uploaded.');
$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) fail('Document upload failed.');
if (($file['size'] ?? 0) > 25 * 1024 * 1024) fail('Legacy document is too large for temporary conversion.');
$ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
if (!in_array($ext, ['doc','odt','rtf'], true)) fail('Only DOC, ODT and RTF use this converter.');
$soffice = (string)($config['libreoffice_binary'] ?? 'soffice');
$tmp = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'book-reader-' . bin2hex(random_bytes(8));
if (!@mkdir($tmp, 0700, true)) fail('Temporary conversion folder could not be created.', 500);
$src = $tmp . DIRECTORY_SEPARATOR . 'source.' . $ext;
$out = $tmp . DIRECTORY_SEPARATOR . 'source.docx';
$cleanup = static function() use ($tmp): void {
    if (!is_dir($tmp)) return;
    foreach (glob($tmp . DIRECTORY_SEPARATOR . '*') ?: [] as $f) @unlink($f);
    @rmdir($tmp);
};
register_shutdown_function($cleanup);
if (!@move_uploaded_file($file['tmp_name'], $src)) fail('Temporary upload could not be secured.', 500);
$cmd = escapeshellcmd($soffice) . ' --headless --convert-to docx --outdir ' . escapeshellarg($tmp) . ' ' . escapeshellarg($src) . ' 2>&1';
exec($cmd, $lines, $status);
if ($status !== 0 || !is_file($out)) fail('LibreOffice conversion is unavailable on this server. Install LibreOffice or upload DOCX instead.', 503);
$data = @file_get_contents($out);
if ($data === false) fail('Converted document could not be read.', 500);
header('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document');
header('Content-Length: ' . strlen($data));
header('Content-Disposition: attachment; filename="converted.docx"');
echo $data;
$cleanup();
