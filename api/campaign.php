<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/campaign_rules.php';

header('Cache-Control: no-store');
$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['POST', 'GET'], true)) json_response(['ok'=>false], 405);
$user = current_user_id();
$input = $method === 'POST' ? read_json() : null;
$pdo = null;
try {
    if ($user !== null) {
        $pdo = db();
        $pdo->beginTransaction();
        $init = $pdo->prepare('INSERT INTO campaign_saves (user_id, progress) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)');
        $init->execute([$user, json_encode(new_campaign())]);
        $row = $pdo->prepare('SELECT progress FROM campaign_saves WHERE user_id=? FOR UPDATE');
        $row->execute([$user]);
        $save = json_decode($row->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
    } else {
        $save = $_SESSION['campaign'] ?? new_campaign();
    }

    if ($input !== null) {
        if (($input['version'] ?? null) !== $save['version']) {
            if ($pdo) $pdo->rollBack();
            json_response(['ok'=>false, 'error'=>'Состояние похода обновилось.', 'save'=>$save], 409);
        }
        $previous = $save;
        $save = campaign_step($save, $input);
        if ($pdo) {
            $update = $pdo->prepare('UPDATE campaign_saves SET progress=? WHERE user_id=?');
            $update->execute([json_encode($save, JSON_UNESCAPED_UNICODE), $user]);
            if (count($previous['cleared']) < count($save['cleared'])) {
                $nodes = array_column(atlas()['nodes'], null, 'id');
                $reward = $nodes[$save['battle']['node']]['reward'];
                $pdo->prepare('UPDATE resources SET souls=souls+? WHERE user_id=?')->execute([$reward, $user]);
            }
        } else {
            $_SESSION['campaign'] = $save;
        }
    }
    if ($pdo) $pdo->commit();
    json_response(['ok'=>true, 'save'=>$save, 'account'=>$user !== null]);
} catch (DomainException $e) {
    if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
    json_response(['ok'=>false, 'error'=>$e->getMessage()], 422);
} catch (Throwable $e) {
    if ($pdo && $pdo->inTransaction()) $pdo->rollBack();
    error_log('Campaign storage: ' . $e->getMessage());
    json_response(['ok'=>false, 'error'=>'Не удалось сохранить поход. Обновите страницу.'], 500);
}

