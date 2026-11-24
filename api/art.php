<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
session_write_close();
require_method('GET');
$asset = $_GET['asset'] ?? '';
$digest = $_GET['v'] ?? '';
if (!is_string($asset) || !is_string($digest) || !preg_match('/^[a-f0-9]{64}$/D',$digest)) {
    http_response_code(404);exit;
}
$q=db()->prepare('SELECT image_data FROM game_art WHERE asset=? AND digest=?');
$q->execute([$asset,$digest]);
$bytes=$q->fetchColumn();
if ($bytes===false) {http_response_code(404);exit;}
header('Content-Type: image/webp');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=31536000, immutable');
echo $bytes;
