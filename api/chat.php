<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$userId = require_user_id();
$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $stmt = $pdo->query(
        'SELECT cm.id, u.username, cm.message, cm.created_at
         FROM chat_messages cm
         JOIN users u ON u.id = cm.user_id
         ORDER BY cm.id DESC
         LIMIT 30'
    );

    $messages = array_reverse($stmt->fetchAll());
    json_response(['ok' => true, 'messages' => $messages]);
}

require_method('POST');
$data = read_json();
$message = clean_string($data['message'] ?? '');

if (mb_strlen($message) < 1 || mb_strlen($message) > 300) {
    json_response(['ok' => false, 'error' => 'Сообщение должно быть от 1 до 300 символов.'], 422);
}

$stmt = $pdo->prepare('INSERT INTO chat_messages (user_id, message) VALUES (?, ?)');
$stmt->execute([$userId, $message]);

json_response(['ok' => true]);

