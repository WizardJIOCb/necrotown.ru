<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

require_method('GET');
$userId = require_user_id();

json_response([
    'ok' => true,
    'state' => game_state($userId),
]);

