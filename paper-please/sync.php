<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$stateFile = __DIR__ . '/stato.json';

/**
 * SICUREZZA POST
 * - Consigliato: consenti POST solo da localhost (bot sullo stesso server).
 * - Se in futuro vuoi consentire POST da LAN, usa una chiave (header X-PP-KEY) e mettila anche nel bot.
 */
$ALLOW_POST_LOCALHOST_ONLY = true;

// (opzionale) abilita chiave condivisa
$ENABLE_SHARED_KEY = false;
$SHARED_KEY = 'CHANGE_ME_LONG_RANDOM_STRING'; // se abiliti, cambialo davvero

function default_state(): array {
  return [
    "currentIndex" => 0,
    "decisions" => [],
    "world" => ["regime" => 50, "popolo" => 50, "ribelli" => 50],
    "chat" => ["round" => 1, "suggestions" => [], "votes" => []],
    "lastOutcome" => ["index" => null, "decision" => null, "text" => ""],
    "gameOver" => false,
    "gameOverReason" => "",
    "gameOverCause" => "",
    "runCompleted" => false
  ];
}

function read_state(string $file): array {
  if (!file_exists($file)) return default_state();
  $raw = @file_get_contents($file);
  if ($raw === false || trim($raw) === '') return default_state();
  $data = json_decode($raw, true);
  if (!is_array($data)) return default_state();
  return $data;
}

function write_state(string $file, array $data): bool {
  $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false) return false;

  $tmp = $file . '.tmp';
  if (@file_put_contents($tmp, $json, LOCK_EX) === false) return false;
  return @rename($tmp, $file);
}

function is_localhost_request(): bool {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  return ($ip === '127.0.0.1' || $ip === '::1');
}

function get_header(string $name): ?string {
  // Apache/Nginx: i header custom diventano HTTP_X_PP_KEY, ecc.
  $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
  if (isset($_SERVER[$key])) return (string)$_SERVER[$key];
  return null;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $data = read_state($stateFile);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($method === 'POST') {
  // ---- BLOCCO SICUREZZA POST ----
  if ($ALLOW_POST_LOCALHOST_ONLY && !is_localhost_request()) {
    http_response_code(403);
    echo json_encode(["error" => "POST forbidden (localhost only)"]);
    exit;
  }

  if ($ENABLE_SHARED_KEY) {
    $hdr = get_header('X-PP-KEY');
    if (!$hdr || !hash_equals($SHARED_KEY, $hdr)) {
      http_response_code(403);
      echo json_encode(["error" => "Invalid X-PP-KEY"]);
      exit;
    }
  }
  // ------------------------------

  $raw = file_get_contents('php://input') ?: '';
  $data = json_decode($raw, true);

  if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid JSON"]);
    exit;
  }

  // Sanity minima
  if (!isset($data["world"]) || !is_array($data["world"])) {
    $data["world"] = ["regime" => 50, "popolo" => 50, "ribelli" => 50];
  }
  if (!isset($data["chat"]) || !is_array($data["chat"])) {
    $data["chat"] = ["round" => 1, "suggestions" => [], "votes" => []];
  }
  if (!isset($data["lastOutcome"]) || !is_array($data["lastOutcome"])) {
    $data["lastOutcome"] = ["index" => null, "decision" => null, "text" => ""];
  }

  if (!write_state($stateFile, $data)) {
    http_response_code(500);
    echo json_encode(["error" => "Cannot write stato.json (permissions?)"]);
    exit;
  }

  echo json_encode(["ok" => true]);
  exit;
}

http_response_code(405);
echo json_encode(["error" => "Method not allowed"]);
