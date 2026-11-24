<?php
declare(strict_types=1);

function record_battle_stats(int $id,array $previous,array $save,string $action,int $reward): void
{
    $pdo=db();
    $pdo->prepare('INSERT INTO battle_stats(user_id,legacy_wins) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id=user_id')->execute([$id,count($previous['cleared'])]);
    $b=$save['battle'];
    $won=$action==='order' && $b['status']==='won';
    $lost=$action==='order' && $b['status']==='lost';
    $retreat=$action==='leave' && $previous['battle']['status']==='play';
    $turns=$won?$b['turn']-1:0;
    $pdo->prepare('UPDATE battle_stats SET wins=wins+?, losses=losses+?, retreats=retreats+?, replay_wins=replay_wins+?,
        orders=orders+?, souls_won=souls_won+?, best_turns=IF(? > 0 AND (best_turns=0 OR best_turns>?), ?,best_turns) WHERE user_id=?')
       ->execute([(int)$won,(int)$lost,(int)$retreat,(int)($won&&($b['replay']??false)),(int)($action==='order'),$reward,$turns,$turns,$turns,$id]);
}
