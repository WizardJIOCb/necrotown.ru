<?php
declare(strict_types=1);

function atlas(): array
{
    static $atlas;
    return $atlas ??= json_decode(file_get_contents(__DIR__ . '/../campaign/atlas.json'), true, 512, JSON_THROW_ON_ERROR);
}

function new_campaign(): array
{
    return ['version' => 0, 'cleared' => [], 'party' => ['blade', 'shield', 'seer'], 'battle' => null];
}

function allies(array $save): array
{
    $allies = ['blade', 'shield', 'seer'];
    foreach (['quarry' => 'breaker', 'ford' => 'ranger'] as $node => $unit) {
        if (in_array($node, $save['cleared'], true)) $allies[] = $unit;
    }
    return $allies;
}

function intent(string $kind, int $turn): int
{
    $base = atlas()['units'][$kind]['attack'];
    if ($kind === 'king' && $turn % 3 === 0) return $base + 12;
    if (in_array($kind, ['brute', 'warden'], true)) return $turn % 2 === 0 ? $base + 7 : 3;
    return $base;
}

function campaign_step(array $save, array $input): array
{
    $nodes = array_column(atlas()['nodes'], null, 'id');
    $units = atlas()['units'];
    $action = $input['action'] ?? '';
    $battle = $save['battle'];
    if ($action === 'party') {
        $party = $input['party'] ?? [];
        if ($battle || !is_array($party) || !array_is_list($party) || count($party) !== 3 ||
            count(array_filter($party, 'is_string')) !== 3 || count(array_unique($party)) !== 3 ||
            array_diff($party, allies($save))) throw new DomainException('Выберите трёх разных союзников в лагере.');
        $save['party'] = $party;
    } elseif ($action === 'start') {
        $id = $input['node'] ?? '';
        $node = is_string($id) ? ($nodes[$id] ?? null) : null;
        if ($battle || !$node || in_array($id, $save['cleared'], true) ||
            ($node['from'] && !array_intersect($node['from'], $save['cleared']))) throw new DomainException('Этот путь пока закрыт.');
        $max = 60 + 3 * count($save['cleared']);
        $foes = [];
        foreach ($node['enemies'] as $kind) {
            $hp = $units[$kind]['stat'];
            $foes[] = ['kind' => $kind, 'hp' => $hp, 'max' => $hp, 'intent' => intent($kind, 1)];
        }
        $save['battle'] = ['node' => $id, 'turn' => 1, 'hp' => $max, 'max' => $max, 'charge' => 1,
            'foes' => $foes, 'status' => 'play', 'log' => 'Отряд готов. Выберите цель и отдайте приказ.'];
    } elseif ($action === 'leave' && $battle) {
        $save['battle'] = null;
    } elseif ($action === 'order' && $battle && $battle['status'] === 'play') {
        $card = $input['card'] ?? '';
        $target = $input['target'] ?? null;
        if (!is_int($target) || ($battle['foes'][$target]['hp'] ?? 0) <= 0 ||
            !in_array($card, ['strike', 'guard', 'nova'], true) ||
            ($card === 'nova' && $battle['charge'] < 2)) throw new DomainException('Этот приказ сейчас недоступен.');
        $power = array_sum(array_map(fn($kind) => $units[$kind]['attack'], $save['party']));
        $block = array_sum(array_map(fn($kind) => $units[$kind]['stat'], $save['party']));
        $splash = in_array('ranger', $save['party'], true) ? 2 : 0;
        $focus = $power;
        if ($card === 'guard') {
            $focus = intdiv($power, 2);
            $block += 13;
        } elseif ($card === 'nova') {
            $focus = $power + 4;
            $splash += 13;
        }
        $battle['charge'] = $card === 'nova' ? $battle['charge'] - 2 : min(3, $battle['charge'] + 1);
        $incoming = 0;
        foreach ($battle['foes'] as $i => &$foe) {
            $foe['hp'] = max(0, $foe['hp'] - ($i === $target ? $focus : $splash));
            if ($foe['hp'] > 0) $incoming += $foe['intent'];
            $foe['intent'] = intent($foe['kind'], $battle['turn'] + 1);
        }
        unset($foe);
        $loss = max(0, $incoming - $block);
        $heal = in_array('seer', $save['party'], true) ? 2 : 0;
        $battle['hp'] = max(0, min($battle['max'], $battle['hp'] + $heal) - $loss);
        $battle['log'] = sprintf('Удар по цели: %d. Щиты поглотили %d. Отряд потерял %d здоровья.', $focus, min($block, $incoming), $loss);
        $king = array_search('king', array_column($battle['foes'], 'kind'), true);
        if ($king !== false && $battle['foes'][$king]['hp'] > 0 && $battle['turn'] % 3 === 0) {
            foreach ($battle['foes'] as &$fallen) {
                if (!$fallen['hp']) {
                    $fallen['hp'] = max(1, intdiv($fallen['max'], 2));
                    $battle['log'] .= ' Король вернул в строй павшего союзника.';
                    break;
                }
            }
            unset($fallen);
        }
        $battle['turn']++;
        if (!array_sum(array_column($battle['foes'], 'hp'))) {
            $battle['status'] = 'won';
            $save['cleared'][] = $battle['node'];
        } elseif (!$battle['hp']) {
            $battle['status'] = 'lost';
        }
        $save['battle'] = $battle;
    } else {
        throw new DomainException('Сначала выберите доступную точку похода.');
    }
    $save['version']++;
    return $save;
}

