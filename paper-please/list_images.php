<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$baseImgDir = __DIR__ . '/img'; // root immagini

if (!is_dir($baseImgDir)) {
  http_response_code(200);
  echo json_encode([]);
  exit;
}

$allowedExt = ['jpg','jpeg','png','webp'];
$files = [];

foreach (scandir($baseImgDir) as $f) {
  if ($f === '.' || $f === '..') continue;
  $path = $baseImgDir . '/' . $f;
  if (!is_file($path)) continue;

  $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
  if (!in_array($ext, $allowedExt, true)) continue;

  $files[] = $f;
}

natsort($files);
echo json_encode(array_values($files), JSON_UNESCAPED_SLASHES);
