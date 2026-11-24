<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
require __DIR__.'/campaign_rules.php';
require __DIR__.'/admin_rules.php';

header('Cache-Control: private, no-store');
$actor = require_user_id();
if (!is_game_admin($actor)) json_response(['ok'=>false,'error'=>'Доступ только для администраторов.'],403);
$_SESSION['admin_token'] ??= bin2hex(random_bytes(32));
$sections = [
    'heroes'=>'Герои','accounts'=>'Аккаунты','resources'=>'Ресурсы игроков','buildings'=>'Постройки игроков',
    'saves'=>'Сохранения похода','statistics'=>'Статистика боёв','development'=>'Развитие игроков','chat'=>'Сообщения чата','city'=>'Город','houses'=>'Вампирские дома',
    'construction'=>'Улучшения и добыча','research'=>'Технологии',
    'templates'=>'Стартовые постройки','starting'=>'Старт героя','chapters'=>'Карты кампании',
    'nodes'=>'Точки и маршруты','units'=>'Бойцы и противники','balance'=>'Баланс боя','art'=>'Иллюстрации',
];

function admin_list(string $section, string $search, int $page): array
{
    $offset = $page * 50;
    if ($section==='art') {
        $labels = ['regent'=>'Портрет некроманта','skyline'=>'Панорама города','crest'=>'Герб города','bones'=>'Кости','souls'=>'Души','iron'=>'Железо','ether'=>'Эфир','plague'=>'Мор'];
        foreach (['templates','houses'] as $group) foreach (content_group($group) as $id=>$item) $labels[$id]=$item['name'];
        foreach (content_group('chapters') as $chapter) $labels[pathinfo($chapter['art'],PATHINFO_FILENAME)]=$chapter['name'];
        $rows=[];
        foreach (art_paths() as $id=>$path) {
            $label=$labels[$id]??$id;
            if ($search==='' || mb_stripos("$id $label",$search)!==false) $rows[]=['id'=>$id,'label'=>$label];
        }
        return array_slice($rows,$offset,51);
    }
    if (isset(content_defaults()[$section])) {
        $rows = [];
        foreach (content_group($section) as $id=>$item) {
            $label = $item['name'] ?? (['hero'=>'Характеристики героя','resources'=>'Запас ресурсов','battle'=>'Правила боя'][$id] ?? $id);
            if ($search === '' || mb_stripos("$id $label", $search) !== false) $rows[] = ['id'=>$id,'label'=>$label];
        }
        return array_slice($rows,$offset,51);
    }
    [$source,$id,$label] = match($section) {
        'chat'=>['chat_messages t JOIN users u ON u.id=t.user_id','t.id',"CONCAT(u.username, ' · ', LEFT(t.message,70))"],
        'buildings'=>['buildings t JOIN users u ON u.id=t.user_id','t.id',"CONCAT(u.username, ' · ', t.name)"],
        default=>['users u','u.id','u.username']
    };
    $sort = $section==='chat' ? 't.id DESC' : "$label, $id";
    $q=db()->prepare("SELECT $id AS id,$label AS label FROM $source WHERE $label LIKE ? OR CAST($id AS CHAR)=? ORDER BY $sort LIMIT 51 OFFSET $offset");
    $q->execute(['%'.$search.'%', $search]);
    return $q->fetchAll();
}

function admin_record(string $section,string $id,bool $lock=false): array
{
    $suffix=$lock?' FOR UPDATE':'';
    if ($section==='art') {
        $paths=art_paths();admin_check(isset($paths[$id]),'Неизвестная иллюстрация.');
        $q=db()->prepare('SELECT digest FROM game_art WHERE asset=?'.$suffix);$q->execute([$id]);$digest=$q->fetchColumn();
        return [['image'=>$digest===false?$paths[$id]:'/api/art.php?asset='.$id.'&v='.$digest],$digest];
    }
    if (isset(content_defaults()[$section])) {
        $row = content_group($section)[$id] ?? null;
        admin_check($row!==null,'Запись не найдена.');
        unset($row['id']);
        if ($section==='nodes') $row += ['victory'=>'','ending'=>'','symbol'=>''];
        return [$row,null];
    }
    admin_check(ctype_digit($id) && (int)$id>0,'Неверный номер записи.');
    if ($section==='statistics' || $section==='development') {
        $q=db()->prepare('SELECT id FROM users WHERE id=?');$q->execute([$id]);
        admin_check((bool)$q->fetchColumn(),'Игрок не найден.');
        if ($section==='development') {
            $p=city_progress((int)$id,$lock);
            return [['city_level'=>(int)$p['city_level'],'technologies'=>$p['technologies']],null];
        }
        db()->prepare("INSERT INTO battle_stats(user_id,legacy_wins)
            SELECT u.id,COALESCE(JSON_LENGTH(s.progress,'$.cleared'),0) FROM users u LEFT JOIN campaign_saves s ON s.user_id=u.id WHERE u.id=?
            ON DUPLICATE KEY UPDATE battle_stats.user_id=battle_stats.user_id")->execute([$id]);
    }
    if ($section==='saves') {
        $q=db()->prepare("SELECT u.id, s.progress FROM users u LEFT JOIN campaign_saves s ON s.user_id=u.id WHERE u.id=?".$suffix);
        $q->execute([$id]);$row=$q->fetch();
        admin_check((bool)$row,'Игрок не найден.');
        $save=$row['progress']===null?new_campaign():json_decode($row['progress'],true,512,JSON_THROW_ON_ERROR);
        $version=$save['version'];unset($save['version']);
        return [$save,$version];
    }
    [$table,$pk,$cols]=ADMIN_TABLES[$section];
    $q=db()->prepare('SELECT '.implode(',',$cols)." FROM $table WHERE $pk=?".$suffix);
    $q->execute([$id]);$row=$q->fetch();
    admin_check((bool)$row,'Запись не найдена.');
    return [$row,null];
}

function admin_revision(array $record): string
{
    return hash('sha256',json_encode($record, JSON_THROW_ON_ERROR));
}

$pdo=db();
try {
    $post=$_SERVER['REQUEST_METHOD']==='POST';
    if (!$post) require_method('GET');
    $input=$post?read_json():$_GET;
    $section=$input['section']??'';
    if (!$post && $section==='') json_response(['ok'=>true,'sections'=>$sections,'token'=>$_SESSION['admin_token']]);
    admin_check(is_string($section) && isset($sections[$section]),'Неизвестный раздел.');
    $id=(string)($input['id']??'');
    if (!$post && $id==='') {
        $page=max(0,min(100000,(int)($_GET['page']??0)));
        $rows=admin_list($section,mb_substr(trim((string)($_GET['search']??'')),0,100),$page);
        json_response(['ok'=>true,'items'=>array_slice($rows,0,50),'more'=>count($rows)>50]);
    }
    if ($post) {
        if (!hash_equals($_SESSION['admin_token'],$_SERVER['HTTP_X_ADMIN_TOKEN']??'')) json_response(['ok'=>false,'error'=>'Обновите админку и повторите сохранение.'],403);
        $pdo->beginTransaction();
        if (isset(content_defaults()[$section])) {
            // Serialize changes to linked maps and routes before reading their current configuration.
            $pdo->exec("INSERT INTO game_content (section,edits) VALUES ('_lock','{}') ON DUPLICATE KEY UPDATE edits=edits");
        }
    }
    $record=admin_record($section,$id,$post);
    if (!$post) json_response(['ok'=>true,'values'=>$record[0],'revision'=>admin_revision($record),'choices'=>admin_choices($section)]);
    if (admin_revision($record)!==($input['revision']??null)) {
        $pdo->rollBack();json_response(['ok'=>false,'error'=>'Запись уже изменилась. Откройте её заново перед сохранением.'],409);
    }
    if ($section==='art' && ($input['action']??'')==='save') {
        $encoded=$input['values']['image']??null;
        admin_check(is_string($encoded) && strlen($encoded)<=2800000,'Максимальный размер изображения 2 МБ.');
        $bytes=base64_decode($encoded,true);
        $info=$bytes===false?false:@getimagesizefromstring($bytes);
        admin_check($info && $info[2]===IMAGETYPE_WEBP && strlen($bytes)<=2097152 && max($info[0],$info[1])<=4096,'Нужно изображение WebP до 4096 пикселей и 2 МБ.');
        $digest=hash('sha256',$bytes);
        $pdo->prepare('INSERT INTO game_art(asset,digest,image_data) VALUES (?,?,?) ON DUPLICATE KEY UPDATE digest=?,image_data=?')->execute([$id,$digest,$bytes,$digest,$bytes]);
    } elseif (($input['action']??'')==='delete' && $section==='chat') {
        $pdo->prepare('DELETE FROM chat_messages WHERE id=?')->execute([$id]);
    } else {
        admin_check(($input['action']??'')==='save','Неизвестная операция.');
        $values=admin_values($section,$record[0],$input['values']??null);
        if (isset(content_defaults()[$section])) {
            $row=$values;
            if (isset(content_defaults()[$section][$id]['id'])) $row=['id'=>$id]+$row;
            if ($section==='nodes' || $section==='chapters') {
                $nodes=content_group('nodes');$chapters=content_group('chapters');
                if ($section==='nodes') $nodes[$id]=$row; else $chapters[$id]=$row;
                admin_routes($nodes,$chapters);
            }
            if ($section==='units' && !in_array($id,['blade','seer','ranger','breaker','shield'],true)) admin_check($row['stat']>0,'У противника должно быть здоровье.');
            $q=$pdo->prepare('SELECT edits FROM game_content WHERE section=?');$q->execute([$section]);$raw=$q->fetchColumn();
            $edits=$raw===false?[]:json_decode($raw,true,512,JSON_THROW_ON_ERROR);$edits[$id]=$row;
            $json=json_encode($edits,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
            $pdo->prepare('INSERT INTO game_content (section,edits) VALUES (?,?) ON DUPLICATE KEY UPDATE edits=?')->execute([$section,$json,$json]);
        } elseif ($section==='saves') {
            $save=['version'=>$record[1]+1]+$values;$json=json_encode($save,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
            $pdo->prepare('INSERT INTO campaign_saves(user_id,progress) VALUES (?,?) ON DUPLICATE KEY UPDATE progress=?')->execute([$id,$json,$json]);
        } else {
            [$table,$pk,$cols]=ADMIN_TABLES[$section];
            if ($section==='development') $values['technologies']=json_encode($values['technologies'],JSON_THROW_ON_ERROR);
            $set=implode(',',array_map(fn($col)=>"$col=?",$cols));
            $pdo->prepare("UPDATE $table SET $set WHERE $pk=?")->execute([...array_values($values),$id]);
        }
    }
    $pdo->commit();json_response(['ok'=>true]);
} catch (DomainException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    json_response(['ok'=>false,'error'=>$e->getMessage()],422);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('Game admin: '.$e->getMessage());
    json_response(['ok'=>false,'error'=>'Не удалось сохранить или загрузить запись. Проверьте значения и уникальность логина и почты.'], $e instanceof PDOException && $e->getCode()==='23000'?409:500);
}
