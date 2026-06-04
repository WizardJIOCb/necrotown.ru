<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? '';

if ($action === 'me') {
    $userId = current_user_id();
    if ($userId === null) {
        json_response(['ok' => true, 'authenticated' => false]);
    }

    json_response([
        'ok' => true,
        'authenticated' => true,
        'state' => game_state($userId),
    ]);
}

if ($action === 'logout') {
    require_method('POST');
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', $params['secure'], $params['httponly']);
    }
    session_destroy();
    json_response(['ok' => true]);
}

require_method('POST');
$data = read_json();

if ($action === 'register') {
    $username = clean_string($data['username'] ?? '');
    $email = clean_string($data['email'] ?? '');
    $password = (string) ($data['password'] ?? '');

    if (!preg_match('/^[a-zA-Zа-яА-ЯёЁ0-9_-]{3,24}$/u', $username)) {
        json_response(['ok' => false, 'error' => 'Логин: 3-24 символа, буквы, цифры, _ или -.'], 422);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_response(['ok' => false, 'error' => 'Укажи корректный email.'], 422);
    }

    if (mb_strlen($password) < 6) {
        json_response(['ok' => false, 'error' => 'Пароль должен быть не короче 6 символов.'], 422);
    }

    $pdo = db();
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $avatarSeed = bin2hex(random_bytes(4));

    try {
        $pdo->beginTransaction();

        $userStmt = $pdo->prepare(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
        );
        $userStmt->execute([$username, $email, $hash]);
        $userId = (int) $pdo->lastInsertId();

        $heroStmt = $pdo->prepare(
            'INSERT INTO heroes (user_id, name, avatar_seed) VALUES (?, ?, ?)'
        );
        $heroStmt->execute([$userId, $username, $avatarSeed]);

        $resourceStmt = $pdo->prepare(
            'INSERT INTO resources (user_id, bones, souls, iron, ether, plague)
             VALUES (?, 120, 35, 80, 18, 7)'
        );
        $resourceStmt->execute([$userId]);

        $buildingStmt = $pdo->prepare(
            'INSERT INTO buildings (user_id, type, name, level, status, description, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );

        $buildings = [
            ['crypt', 'Склеп', 1, 'Готов', 'Сердце поселения. Здесь хранятся кости и появляются первые рабочие.', 10],
            ['forge', 'Кузница', 1, 'Готов', 'Переплавляет железо в снаряжение для отрядов и строителей.', 20],
            ['academy', 'Обелиск знаний', 1, 'Изучение', 'Открывает исследования города, армии и ритуалов.', 30],
            ['barracks', 'Казармы', 1, 'Набор', 'Позволяет собирать отряды для защиты и походов.', 40],
            ['market', 'Тёмный рынок', 1, 'Тихо', 'Место обмена ресурсами, слухами и редкими предметами.', 50],
            ['wall', 'Стена праха', 1, 'Готов', 'Защитный периметр города от живых и слишком наглых соседей.', 60],
        ];

        foreach ($buildings as $building) {
            $buildingStmt->execute([$userId, ...$building]);
        }

        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        if ($e->getCode() === '23000') {
            json_response(['ok' => false, 'error' => 'Такой логин или email уже занят.'], 409);
        }

        throw $e;
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;

    json_response([
        'ok' => true,
        'state' => game_state($userId),
    ], 201);
}

if ($action === 'login') {
    $login = clean_string($data['login'] ?? '');
    $password = (string) ($data['password'] ?? '');

    if ($login === '' || $password === '') {
        json_response(['ok' => false, 'error' => 'Укажи логин и пароль.'], 422);
    }

    $stmt = db()->prepare(
        'SELECT id, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1'
    );
    $stmt->execute([$login, $login]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_response(['ok' => false, 'error' => 'Неверный логин или пароль.'], 401);
    }

    $userId = (int) $user['id'];
    db()->prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$userId]);

    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;

    json_response([
        'ok' => true,
        'state' => game_state($userId),
    ]);
}

json_response(['ok' => false, 'error' => 'Неизвестное действие.'], 404);

