<?php
// list_images.php
// Restituisce la lista di file immagine dentro img/<folder> in JSON

header('Content-Type: application/json; charset=utf-8');

$baseDir = __DIR__ . '/img';

// cartella passata via GET, es: ?folder=pokemon
$folder = isset($_GET['folder']) ? $_GET['folder'] : '';
$folder = trim($folder, "/");

// sicurezza: consentiamo solo lettere, numeri, _ e -
if ($folder !== '' && !preg_match('/^[a-zA-Z0-9_-]+$/', $folder)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid folder name"]);
    exit;
}

$dir = $baseDir . ($folder !== '' ? "/$folder" : '');

if (!is_dir($dir)) {
    http_response_code(404);
    echo json_encode(["error" => "Folder not found", "folder" => $folder]);
    exit;
}

$allowedExt = ['jpg','jpeg','png','gif','webp'];
$files = scandir($dir);
$result = [];

foreach ($files as $file) {
    if ($file === '.' || $file === '..') continue;
    $path = "$dir/$file";
    if (!is_file($path)) continue;
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    if (!in_array($ext, $allowedExt)) continue;

    $result[] = $file;
}

// ordiniamo per nome
sort($result);

echo json_encode($result);
