<?php
declare(strict_types=1);

const CITY_CYCLE = 300;
const CITY_STORAGE = 144;

function city_progress(int $id,bool $lock=false): array
{
    $pdo=db();
    $q=$pdo->prepare('SELECT city_level, technologies, UNIX_TIMESTAMP(last_collection) AS last_collection FROM city_progress WHERE user_id=?'.($lock?' FOR UPDATE':''));
    $q->execute([$id]);$row=$q->fetch();
    if (!$row) {
        $pdo->prepare("INSERT INTO city_progress (user_id, technologies) VALUES (?, '[]') ON DUPLICATE KEY UPDATE user_id=user_id")->execute([$id]);
        $q->execute([$id]);$row=$q->fetch();
    }
    $row['technologies']=json_decode($row['technologies'],true,512,JSON_THROW_ON_ERROR);
    return $row;
}

function technology_effects(array $known): array
{
    $buff=['discount'=>0,'production'=>0,'power'=>0,'guard'=>0,'vitality'=>0];
    $research=content_group('research');
    foreach ($known as $id) if (isset($research[$id])) {
        $t=$research[$id];$buff[$t['effect']]+=$t['amount'];
    }
    return $buff;
}

function development_view(array $progress,array $buildings): array
{
    $buff=technology_effects($progress['technologies']);$offers=[];$rates=[];
    $rules=content_group('construction');$city=(int)$progress['city_level'];
    $items=[['id'=>'city','type'=>'city','level'=>$city],...$buildings];
    foreach ($items as $b) {
        $rule=$rules[$b['type']]??null;if (!$rule) continue;
        $level=(int)$b['level'];$cost=[];
        foreach ($rule['cost'] as $k=>$v) $cost[$k]=(int)ceil($v*$level*(100-min(90,$buff['discount']))/100);
        $cap=$b['type']==='city'?$rule['maxLevel']:min($city+1,$rule['maxLevel']);
        $offers[(string)$b['id']]=['level'=>$level,'cap'=>$cap,'cost'=>$cost];
        if (isset($rule['resource'])) {
            $k=$rule['resource'];
            $offers[(string)$b['id']]['production'] = [$k=>$rule['yieldAmount']];
            $rates[$k]=($rates[$k]??0)+$level*$rule['yieldAmount'];
        }
    }
    foreach ($rates as &$rate) $rate=(int)floor($rate*(100+$buff['production'])/100);
    unset($rate);
    return ['level'=>$city,'known'=>$progress['technologies'],'research'=>content_group('research'),'offers'=>$offers,'rates'=>$rates,
        'cycle'=>CITY_CYCLE,'capacity'=>CITY_STORAGE,'lastCollection'=>(int)$progress['last_collection'],'serverTime'=>time()];
}
