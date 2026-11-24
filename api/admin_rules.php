<?php
declare(strict_types=1);

const ADMIN_TABLES = [
    'accounts' => ['users','id',['username','email']],
    'heroes' => ['heroes','user_id',['name','level','experience','health','attack','defense','energy','avatar_seed']],
    'resources' => ['resources','user_id',['bones','souls','iron','ether','plague']],
    'buildings' => ['buildings','id',['type','name','level','status','description','sort_order']],
    'chat' => ['chat_messages','id',['message','created_at']],
    'development' => ['city_progress','user_id',['city_level','technologies']],
    'statistics' => ['battle_stats','user_id',['legacy_wins','wins','losses','retreats','replay_wins','orders','souls_won','best_turns']],
];

function admin_check(bool $ok, string $message): void
{
    if (!$ok) throw new DomainException($message);
}

function admin_choices(string $section): array
{
    $nodes = array_keys(content_group('nodes'));
    $units = array_keys(content_group('units'));
    return match ($section) {
        'chapters' => ['art' => array_values(array_unique(array_column(content_defaults()['chapters'], 'art'))),
            'requires' => array_merge([''], array_keys(content_group('chapters')))],
        'nodes' => ['chapter'=>array_keys(content_group('chapters')), 'from'=>$nodes, 'enemies'=>array_values(array_diff($units,['blade','shield','seer','breaker','ranger']))],
        'units' => ['gear'=>['sword','shield','seer','club','bow','crown'], 'model'=>['skel','ogre','giant','foot']],
        'buildings' => ['type'=>array_keys(content_group('templates'))],
        'saves' => ['cleared'=>$nodes, 'party'=>['blade','shield','seer','breaker','ranger']],
        'development' => ['technologies'=>array_keys(content_group('research'))],
        'research' => ['effect'=>['discount','production','power','guard','vitality']],
        'construction' => ['resource'=>['bones','souls','iron','ether','plague']],
        default => [],
    };
}

function admin_integer(mixed $n, int $min, int $max, string $field): void
{
    admin_check(is_int($n) && $n >= $min && $n <= $max, "Поле $field должно быть целым числом от $min до $max.");
}

function admin_ids(mixed $values, array $allowed, int $min, int $max, string $field): void
{
    admin_check(is_array($values) && array_is_list($values) && count($values) >= $min && count($values) <= $max, "Проверьте количество элементов в поле $field.");
    foreach ($values as $v) admin_check(is_string($v) && in_array($v, $allowed, true), "Неизвестное значение в поле $field.");
}

function admin_routes(array $nodes, array $chapters): void
{
    foreach ($chapters as $chapter) {
        $visited = [];
        $cursor = $chapter['id'];
        while ($cursor !== null) {
            admin_check(isset($chapters[$cursor]) && !isset($visited[$cursor]), 'Зависимости глав образуют цикл.');
            $visited[$cursor] = true;
            $cursor = $chapters[$cursor]['requires'];
        }
        $group = array_filter($nodes, fn($n) => $n['chapter'] === $chapter['id']);
        admin_check(count($group) > 0, 'В каждой главе должна быть хотя бы одна точка.');
        $reachable = [];
        foreach ($group as $n) {
            admin_check(!array_diff($n['from'], array_keys($group)), 'Маршруты должны соединять точки одной карты.');
            if (!$n['from']) $reachable[] = $n['id'];
        }
        do {
            $before = count($reachable);
            foreach ($group as $n) if (!in_array($n['id'], $reachable, true) && array_intersect($n['from'], $reachable)) $reachable[] = $n['id'];
        } while ($before !== count($reachable));
        admin_check(count($reachable) === count($group), 'Одна или несколько точек недоступны от начала карты.');
    }
}

function admin_validate_battle(mixed $b, array $progress): void
{
    if ($b === null) return;
    admin_check(is_array($b) && in_array($b['node'] ?? null, array_keys(content_group('nodes')), true), 'Неизвестная точка текущего боя.');
    admin_check(in_array($b['status'] ?? null, ['play','won','lost'], true), 'Неверное состояние боя.');
    admin_integer($b['max'] ?? null, 1, 10000000, 'max');
    admin_integer($b['hp'] ?? null, 0, $b['max'], 'hp');
    admin_integer($b['turn'] ?? null, 1, 1000000, 'turn');
    admin_integer($b['charge'] ?? null, 0, 3, 'charge');
    foreach (['powerBonus','guardBonus'] as $key) admin_integer($b[$key]??0,0,10000000,$key);
    admin_check(is_string($b['log'] ?? null) && mb_strlen($b['log']) <= 1000 && is_bool($b['replay'] ?? false), 'Проверьте журнал и признак повтора.');
    $foes = $b['foes'] ?? null;
    admin_check(is_array($foes) && array_is_list($foes) && count($foes) >= 1 && count($foes) <= 6, 'В бою должно быть от 1 до 6 противников.');
    $alive = false;
    foreach ($foes as $f) {
        admin_check(is_array($f) && is_string($f['kind'] ?? null) && isset(content_group('units')[$f['kind']]), 'Неизвестный противник.');
        admin_integer($f['max'] ?? null, 1, 10000000, 'foe.max');
        admin_integer($f['hp'] ?? null, 0, $f['max'], 'foe.hp');
        admin_integer($f['intent'] ?? null, 0, 10000000, 'foe.intent');
        $alive = $alive || $f['hp'] > 0;
    }
    admin_check(match($b['status']) {
        'won' => !$alive && in_array($b['node'], $progress['cleared'], true),
        'lost' => $b['hp'] === 0 && $alive,
        default => $b['hp'] > 0 && $alive,
    }, 'Исход боя должен соответствовать здоровью отрядов и списку пройденных точек.');
}

function admin_values(string $section, array $before, mixed $input): array
{
    admin_check(is_array($input) && !array_diff_key($input,$before) && !array_diff_key($before,$input), 'Неверный набор полей.');
    $choices = admin_choices($section);
    $values = [];
    foreach ($before as $key=>$old) {
        $v = $input[$key];
        if ($key === 'battle') {
            admin_validate_battle($v, $input);
        } elseif ($key === 'scene') {
            admin_check(is_array($v) && array_is_list($v) && count($v)===2 && in_array($v[1],['ashen','frost','fen','ember','dunes'],true), 'Проверьте ключ местности и зерно сцены.');
            admin_integer($v[0],0,2147483647,'scene');
        } elseif ($key==='cost') {
            admin_check(is_array($v) && count($v)>0 && !array_diff(array_keys($v),['bones','souls','iron','ether','plague']), 'Проверьте ресурсы в стоимости.');
            foreach ($v as $type=>$n) admin_integer($n,0,100000,$type);
        } elseif (in_array($key,['from','enemies','cleared','party','technologies'], true)) {
            $min = match($key) {'enemies'=>1,'party'=>3,default=>0};
            $max = match($key) {'enemies'=>6,'party'=>3,default=>count($choices[$key])};
            admin_ids($v, $choices[$key], $min, $max, $key);
            if ($key!=='enemies') admin_check(count(array_unique($v))===count($v),'Уберите повторяющиеся значения.');
        } elseif (isset($choices[$key])) {
            admin_check(in_array($v ?? '', $choices[$key], true), "Неизвестное значение поля $key.");
            if ($key==='requires' && $v==='') $v=null;
        } elseif (is_int($old)) {
            $max = in_array($key,['x','y'],true) ? 100 : 1000000;
            $min = in_array($key,['level','baseHealth','city_level','maxLevel','cityLevel'],true) ? 1 : 0;
            admin_integer($v,$min,$max,$key);
        } else {
            $max = match($key) {'message'=>300,'email'=>190,'avatar_seed'=>16,'username'=>24,'status','region'=>64,'symbol'=>12,'name'=>$section==='heroes'?24:64,default=>2048};
            admin_check(is_string($v) && mb_strlen($v)<=$max, "Слишком длинное значение поля $key.");
            if (in_array($key,['name','message','username','email'],true)) admin_check(trim($v)!=='','Заполните обязательные поля.');
            if ($key==='description' && mb_strlen($v)>2000) throw new DomainException('Описание слишком длинное.');
            if ($key==='username') admin_check((bool)preg_match('/^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,24}$/uD',$v),'Недопустимый логин.');
            if ($key==='email') admin_check((bool)filter_var($v,FILTER_VALIDATE_EMAIL),'Некорректная почта.');
            if ($key==='created_at') {
                $time = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s',$v);
                admin_check($time && $time->format('Y-m-d H:i:s')===$v,'Укажите дату и время в формате ГГГГ-ММ-ДД ЧЧ:ММ:СС.');
            }
        }
        $values[$key] = $v;
    }
    if ($section==='saves') admin_check(!array_diff($values['party'], allies($values)), 'Некоторые союзники ещё не открыты в этом сохранении.');
    return $values;
}
