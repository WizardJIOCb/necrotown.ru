<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
header('Cache-Control: private, no-store');
require_method('POST');
$effective = require_user_id();
$owner = (int)$_SESSION['user_id'];
if (!is_game_admin($owner)) json_response(['ok'=>false,'error'=>'Недостаточно прав.'],403);
$input = read_json();
$action = $input['action'] ?? '';
if ($action === 'leave' && playing_as_character()) {
    $key = $_SERVER['HTTP_X_PLAYER_VIEW'];
    db()->prepare('DELETE FROM player_presence WHERE session_key=UNHEX(?)')->execute([hash('sha256', session_id().$key)]);
    unset($_SESSION['player_views'][$key]);
    error_log("Game admin returned: owner=$owner target=$effective");
    json_response(['ok'=>true]);
}
if (playing_as_character() || !isset($_SESSION['admin_token']) ||
    !hash_equals($_SESSION['admin_token'], $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '')) {
    json_response(['ok'=>false,'error'=>'Откройте админку из своего профиля.'],403);
}
$id = filter_var($input['id'] ?? null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
if ($action !== 'enter' || !$id || $id === $owner) json_response(['ok'=>false,'error'=>'Выберите другого персонажа.'],422);
$q = db()->prepare('SELECT u.username,h.name FROM users u JOIN heroes h ON h.user_id=u.id WHERE u.id=?');
$q->execute([$id]);$hero=$q->fetch();
if (!$hero) json_response(['ok'=>false,'error'=>'Персонаж не найден.'],404);
$key = bin2hex(random_bytes(32));
$_SESSION['player_views'] = array_filter($_SESSION['player_views'] ?? [], fn($v) => $v['until']>time());
$_SESSION['player_views'][$key] = ['owner'=>$owner,'target'=>$id,'until'=>time()+8*3600];
error_log("Game admin entered: owner=$owner target=$id");
json_response(['ok'=>true,'key'=>$key,'name'=>$hero['name'],'username'=>$hero['username']]);
