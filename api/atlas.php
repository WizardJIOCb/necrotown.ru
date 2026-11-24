<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
require __DIR__.'/campaign_rules.php';
require_method('GET');
header('Cache-Control: no-store');
json_response(atlas() + ['artVersions' => art_versions()]);
