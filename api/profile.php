<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
header('Cache-Control: private, no-store');
$own=current_user_id();$pdo=db();
if ($_SERVER['REQUEST_METHOD']==='POST') {
    $id=require_user_id();$input=read_json();
    if (!isset($_SESSION['password_token']) || !hash_equals($_SESSION['password_token'],$_SERVER['HTTP_X_PROFILE_TOKEN']??'')) json_response(['ok'=>false,'error'=>'Обновите профиль.'],403);
    $current=$input['current']??null;$new=$input['password']??null;
    if (!is_string($current)||!is_string($new)||mb_strlen($new)<6||strlen($new)>72||str_contains($new,"\0")) json_response(['ok'=>false,'error'=>'Новый пароль должен содержать минимум 6 символов и занимать до 72 байт.'],422);
    $q=$pdo->prepare('SELECT password_hash FROM users WHERE id=?');$q->execute([$id]);$hash=$q->fetchColumn();
    if (!$hash || !password_verify($current,$hash)) json_response(['ok'=>false,'error'=>'Неверный текущий пароль.'],422);
    $q=$pdo->prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?');
    $q->execute([password_hash($new,PASSWORD_DEFAULT),$id,$hash]);
    if (!$q->rowCount()) json_response(['ok'=>false,'error'=>'Пароль уже изменился.'],409);
    session_regenerate_id(true);$_SESSION['password_token']=bin2hex(random_bytes(32));
    json_response(['ok'=>true,'token'=>$_SESSION['password_token']]);
}
require_method('GET');
$public=array_key_exists('id',$_GET);
$id=$public ? filter_var($_GET['id'],FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]) : require_user_id();
if (!$id) json_response(['ok'=>false,'error'=>'Профиль не найден.'],404);
$q=$pdo->prepare('SELECT u.id,u.username,DATE(u.created_at) AS joined,h.name,h.level,h.experience,h.health,h.attack,h.defense,h.energy,
    COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.progress,\'$.battle.status\'))=\'play\',0) AS active_battle,
    COALESCE(p.city_level,1) AS city_level,COALESCE(JSON_LENGTH(p.technologies),0) AS studies,
    COALESCE(JSON_LENGTH(s.progress,\'$.cleared\'),0) AS cleared,
    COALESCE(t.legacy_wins,JSON_LENGTH(s.progress,\'$.cleared\'),0) AS legacy_wins,
    COALESCE(t.wins,0) AS wins, COALESCE(t.losses,0) AS losses, COALESCE(t.retreats,0) AS retreats,
    COALESCE(t.replay_wins,0) AS replay_wins,COALESCE(t.orders,0) AS orders,COALESCE(t.souls_won,0) AS souls_won,COALESCE(t.best_turns,0) AS best_turns
    FROM users u JOIN heroes h ON h.user_id=u.id LEFT JOIN city_progress p ON p.user_id=u.id
    LEFT JOIN campaign_saves s ON s.user_id=u.id LEFT JOIN battle_stats t ON t.user_id=u.id WHERE u.id=?');
$q->execute([$id]);$profile=$q->fetch();
if (!$profile) json_response(['ok'=>false,'error'=>'Профиль не найден.'],404);
$extra=[];
if (!$public) {$extra['token']=$_SESSION['password_token']??=bin2hex(random_bytes(32));}
json_response(['ok'=>true,'profile'=>$profile,'portrait'=>art_versions()['regent']??null]+$extra);
