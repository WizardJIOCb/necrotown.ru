<?php
declare(strict_types=1);

const DB_NAME = 'necrotown';
const DB_USER = 'nginx';
const DB_SOCKET = '/var/run/mysqld/mysqld.sock';

ini_set('display_errors', '0');
ini_set('session.use_strict_mode', '1');

$isSecure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,
    'path' => '/',
    'secure' => $isSecure,
    'httponly' => true,
    'samesite' => 'Lax',
]);

session_start();

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf('mysql:unix_socket=%s;dbname=%s;charset=utf8mb4', DB_SOCKET, DB_NAME);
    $pdo = new PDO($dsn, DB_USER, '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_response(['ok' => false, 'error' => 'Некорректный JSON.'], 400);
    }

    return $data;
}

function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
        json_response(['ok' => false, 'error' => 'Метод не поддерживается.'], 405);
    }
}

function current_user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
}

function require_user_id(): int
{
    $userId = current_user_id();
    if ($userId === null) {
        json_response(['ok' => false, 'error' => 'Нужно войти в игру.'], 401);
    }

    return $userId;
}

function clean_string(mixed $value): string
{
    return trim((string) $value);
}

function game_state(int $userId): array
{
    $pdo = db();

    $heroStmt = $pdo->prepare(
        'SELECT u.id, u.username, u.email, h.name, h.level, h.experience, h.health,
                h.attack, h.defense, h.energy, h.avatar_seed
         FROM users u
         JOIN heroes h ON h.user_id = u.id
         WHERE u.id = ?'
    );
    $heroStmt->execute([$userId]);
    $hero = $heroStmt->fetch();

    if (!$hero) {
        json_response(['ok' => false, 'error' => 'Герой не найден.'], 404);
    }

    $resourceStmt = $pdo->prepare(
        'SELECT bones, souls, iron, ether, plague FROM resources WHERE user_id = ?'
    );
    $resourceStmt->execute([$userId]);
    $resources = $resourceStmt->fetch() ?: [
        'bones' => 0,
        'souls' => 0,
        'iron' => 0,
        'ether' => 0,
        'plague' => 0,
    ];

    $buildingStmt = $pdo->prepare(
        'SELECT id, type, name, level, status, description
         FROM buildings
         WHERE user_id = ?
         ORDER BY sort_order, id'
    );
    $buildingStmt->execute([$userId]);

    return [
        'hero' => [
            'id' => (int) $hero['id'],
            'username' => $hero['username'],
            'email' => $hero['email'],
            'name' => $hero['name'],
            'level' => (int) $hero['level'],
            'experience' => (int) $hero['experience'],
            'health' => (int) $hero['health'],
            'attack' => (int) $hero['attack'],
            'defense' => (int) $hero['defense'],
            'energy' => (int) $hero['energy'],
            'avatarSeed' => $hero['avatar_seed'],
        ],
        'resources' => array_map('intval', $resources),
        'buildings' => array_map(static function (array $building): array {
            return [
                'id' => (int) $building['id'],
                'type' => $building['type'],
                'name' => $building['name'],
                'level' => (int) $building['level'],
                'status' => $building['status'],
                'description' => $building['description'],
            ];
        }, $buildingStmt->fetchAll()),
    ];
}
