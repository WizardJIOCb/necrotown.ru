<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
require_method('POST');
$id=require_user_id();
if (strtolower(explode(';',$_SERVER['CONTENT_TYPE']??'')[0])!=='application/json') json_response(['ok'=>false,'error'=>'Нужен JSON.'],415);
$input=read_json();$action=$input['action']??'';$key=$input['key']??'';
if (!is_string($key)) json_response(['ok'=>false,'error'=>'Неверная цель.'],422);
$pdo=db();
try {
    $pdo->beginTransaction();
    $progress=city_progress($id,true);
    $q=$pdo->prepare('SELECT id,type,level FROM buildings WHERE user_id=? ORDER BY id FOR UPDATE');$q->execute([$id]);$buildings=$q->fetchAll();
    $q=$pdo->prepare('SELECT bones,souls,iron,ether,plague FROM resources WHERE user_id=? FOR UPDATE');$q->execute([$id]);$money=$q->fetch();
    $view=development_view($progress,$buildings);
    $cycles=min(CITY_STORAGE,max(0,intdiv($view['serverTime']-$view['lastCollection'],CITY_CYCLE)));
    if ($action==='collect' && !$cycles) throw new DomainException('Следующая добыча ещё не готова.');
    if ($cycles>0) {
        foreach ($view['rates'] as $resource=>$rate) $money[$resource]+=$rate*$cycles;
        $last=$view['serverTime']-max(0,$view['serverTime']-$view['lastCollection'])%CITY_CYCLE;
        $pdo->prepare('UPDATE city_progress SET last_collection=FROM_UNIXTIME(?) WHERE user_id=?')->execute([$last,$id]);
    }
    $cost=[];
    if ($action==='upgrade') {
        $offer=$view['offers'][$key]??null;
        if (!$offer || ($input['level']??null)!==$offer['level']) throw new DomainException('Уровень изменился. Обновите раздел.');
        if ($offer['level'] >= $offer['cap']) throw new DomainException('Достигнут предел улучшения.');
        $cost=$offer['cost'];
        if ($key==='city') $pdo->prepare('UPDATE city_progress SET city_level=city_level+1 WHERE user_id=?')->execute([$id]);
        else $pdo->prepare('UPDATE buildings SET level=level+1 WHERE user_id=? AND id=?')->execute([$id,$key]);
    } elseif ($action==='research') {
        $tech=$view['research'][$key]??null;
        if (!$tech || $tech['cityLevel']>$view['level'] || in_array($key,$view['known'],true)) throw new DomainException('Это исследование сейчас недоступно.');
        $cost=$tech['cost'];$known=[...$view['known'],$key];
        $pdo->prepare('UPDATE city_progress SET technologies=? WHERE user_id=?')->execute([json_encode($known),$id]);
    } elseif ($action!=='collect') throw new DomainException('Неизвестное действие.');
    if ($action!=='collect' && (!is_array($input['cost']??null) || ($input['cost']!=$cost))) throw new DomainException('Цена изменилась. Обновите раздел.');
    foreach ($cost as $k=>$value) {
        if ($money[$k]<$value) throw new DomainException('Недостаточно ресурсов.');
        $money[$k]-=$value;
    }
    $pdo->prepare('UPDATE resources SET bones=?,souls=?,iron=?,ether=?,plague=? WHERE user_id=?')
        ->execute([$money['bones'],$money['souls'],$money['iron'],$money['ether'],$money['plague'],$id]);
    $pdo->commit();json_response(['ok'=>true,'state'=>game_state($id)]);
} catch (DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();json_response(['ok'=>false,'error'=>$e->getMessage()],422);
} catch(Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();error_log('City upgrade: '.$e->getMessage());
    json_response(['ok'=>false,'error'=>'Не удалось сохранить развитие.'],500);
}
