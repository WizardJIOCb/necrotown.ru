<?php
declare(strict_types=1);

function touch_player_presence(int $userId): void
{
    $key = hash('sha256', session_id());
    $now = time();
    $previous = $_SESSION['presence'] ?? null;
    if ($key === ($previous['key'] ?? null) && $now - $previous['at'] < 25) {
        return;
    }

    $pdo = db();
    $stmt = $pdo->prepare(
        'INSERT INTO player_presence (session_key, user_id) VALUES (UNHEX(?), ?)
         ON DUPLICATE KEY UPDATE last_seen = CURRENT_TIMESTAMP'
    );
    $stmt->execute([$key, $userId]);
    if ($key !== ($previous['key'] ?? null)) {
        $pdo->exec('DELETE FROM player_presence WHERE last_seen < CURRENT_TIMESTAMP - INTERVAL 1 DAY LIMIT 100');
    }
    $_SESSION['presence'] = ['key' => $key, 'at' => $now];
}

function leave_player_presence(): void
{
    if (current_user_id() !== null) {
        db()->prepare('DELETE FROM player_presence WHERE session_key = UNHEX(?)')
            ->execute([hash('sha256', session_id())]);
    }
}
