<?php
declare(strict_types=1);

function content_defaults(): array
{
    static $defaults;
    if ($defaults === null) {
        $atlas = json_decode(file_get_contents(__DIR__.'/../campaign/atlas.json'), true, 512, JSON_THROW_ON_ERROR);
        $defaults = json_decode(file_get_contents(__DIR__.'/../city/catalog.json'), true, 512, JSON_THROW_ON_ERROR);
        foreach (['nodes', 'chapters'] as $section) {
            $defaults[$section] = array_column($atlas[$section], null, 'id');
        }
        $defaults['units'] = $atlas['units'];
    }
    return $defaults;
}

function content_group(string $section): array
{
    static $edits;
    if ($edits === null) {
        $edits = db()->query('SELECT section, edits FROM game_content')->fetchAll(PDO::FETCH_KEY_PAIR);
    }
    $changes = isset($edits[$section]) ? json_decode($edits[$section], true, 512, JSON_THROW_ON_ERROR) : [];
    return array_replace(content_defaults()[$section], $changes);
}

function is_game_admin(int $userId): bool
{
    $stmt = db()->prepare('SELECT 1 FROM game_admins WHERE user_id = ?');
    $stmt->execute([$userId]);
    return (bool)$stmt->fetchColumn();
}

function art_versions(): array
{
    return db()->query('SELECT asset,digest FROM game_art')->fetchAll(PDO::FETCH_KEY_PAIR);
}

function art_paths(): array
{
    $paths = [];
    foreach (['city','campaign'] as $dir) {
        foreach (glob(__DIR__.'/../'.$dir.'/*.webp') as $path) $paths[pathinfo($path, PATHINFO_FILENAME)]='/'.$dir.'/'.basename($path);
    }
    return $paths;
}
