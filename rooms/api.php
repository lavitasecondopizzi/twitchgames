<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const ROOM_TTL = 43200; // 12 ore

function json_response(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function room_code(string $value): string {
    return preg_replace('/[^A-Z0-9]/', '', strtoupper($value));
}

function valid_nick(string $value): string {
    $value = trim(preg_replace('/\s+/', ' ', $value));
    if (mb_strlen($value) < 2 || mb_strlen($value) > 16) {
        json_response(['ok' => false, 'error' => 'invalid_nickname'], 400);
    }
    return $value;
}

function valid_game(string $value): string {
    $allowed = ['impiccato', 'indovina-chi', 'paper-please', 'quiz-pizzi'];
    if (!in_array($value, $allowed, true)) {
        json_response(['ok' => false, 'error' => 'invalid_game'], 400);
    }
    return $value;
}

function token(): string {
    return bin2hex(random_bytes(24));
}

function data_dir(): string {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        json_response(['ok' => false, 'error' => 'storage_unavailable'], 500);
    }
    return $dir;
}

function room_path(string $code): string {
    return data_dir() . '/' . $code . '.json';
}

function load_room(string $code): ?array {
    $path = room_path($code);
    if (!is_file($path)) return null;

    $raw = @file_get_contents($path);
    $room = json_decode($raw ?: '', true);
    if (!is_array($room)) return null;

    if (($room['updatedAt'] ?? 0) + ROOM_TTL < time()) {
        @unlink($path);
        return null;
    }

    return $room;
}

function save_room(array $room): void {
    $path = room_path($room['code']);
    $tmp = $path . '.tmp-' . bin2hex(random_bytes(4));
    $json = json_encode($room, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($json === false || @file_put_contents($tmp, $json, LOCK_EX) === false || !@rename($tmp, $path)) {
        @unlink($tmp);
        json_response(['ok' => false, 'error' => 'storage_unavailable'], 500);
    }
}

function public_room(array $room): array {
    return [
        'code' => $room['code'],
        'game' => $room['game'],
        'status' => $room['status'],
        'host' => ['nickname' => $room['host']['nickname']],
        'guest' => $room['guest'] ? ['nickname' => $room['guest']['nickname']] : null,
        'createdAt' => $room['createdAt'],
        'updatedAt' => $room['updatedAt'],
    ];
}

function payload(): array {
    $raw = file_get_contents('php://input') ?: '{}';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_room(array $data): array {
    $code = room_code((string)($data['room'] ?? $_GET['room'] ?? ''));
    if (strlen($code) !== 6) {
        json_response(['ok' => false, 'error' => 'invalid_room'], 400);
    }

    $room = load_room($code);
    if (!$room) {
        json_response(['ok' => false, 'error' => 'room_not_found'], 404);
    }

    return [$code, $room];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? '');

if ($method === 'POST') {
    $data = payload();

    if ($action === 'create') {
        $game = valid_game((string)($data['game'] ?? ''));
        $hostNick = valid_nick((string)($data['hostNickname'] ?? 'Pizzi'));

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $code = '';
            $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            for ($i = 0; $i < 6; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }

            if (load_room($code) === null) {
                $now = time();
                $room = [
                    'code' => $code,
                    'game' => $game,
                    'status' => 'waiting',
                    'host' => [
                        'nickname' => $hostNick,
                        'token' => token(),
                    ],
                    'guest' => null,
                    'createdAt' => $now,
                    'updatedAt' => $now,
                ];
                save_room($room);
                json_response([
                    'ok' => true,
                    'room' => public_room($room),
                    'role' => 'host',
                    'token' => $room['host']['token'],
                ], 201);
            }
        }

        json_response(['ok' => false, 'error' => 'room_creation_failed'], 500);
    }

    if ($action === 'join') {
        [$code, $room] = require_room($data);

        if ($room['status'] !== 'waiting' || $room['guest'] !== null) {
            json_response(['ok' => false, 'error' => 'room_full_or_started'], 409);
        }

        $nickname = valid_nick((string)($data['nickname'] ?? ''));

        if (mb_strtolower($nickname) === mb_strtolower($room['host']['nickname'])) {
            json_response(['ok' => false, 'error' => 'nickname_taken'], 409);
        }

        $room['guest'] = [
            'nickname' => $nickname,
            'token' => token(),
        ];
        $room['updatedAt'] = time();
        save_room($room);

        json_response([
            'ok' => true,
            'room' => public_room($room),
            'role' => 'guest',
            'token' => $room['guest']['token'],
        ]);
    }

    if ($action === 'start') {
        [$code, $room] = require_room($data);
        $token = (string)($data['token'] ?? '');

        if (!hash_equals((string)$room['host']['token'], $token)) {
            json_response(['ok' => false, 'error' => 'unauthorized'], 403);
        }

        if ($room['guest'] === null) {
            json_response(['ok' => false, 'error' => 'guest_missing'], 409);
        }

        $room['status'] = 'playing';
        $room['updatedAt'] = time();
        save_room($room);

        json_response(['ok' => true, 'room' => public_room($room)]);
    }

    if ($action === 'leave') {
        [$code, $room] = require_room($data);
        $token = (string)($data['token'] ?? '');

        if (hash_equals((string)$room['host']['token'], $token)) {
            @unlink(room_path($code));
            json_response(['ok' => true]);
        }

        if ($room['guest'] && hash_equals((string)$room['guest']['token'], $token)) {
            $room['guest'] = null;
            $room['status'] = 'waiting';
            $room['updatedAt'] = time();
            save_room($room);
            json_response(['ok' => true, 'room' => public_room($room)]);
        }

        json_response(['ok' => false, 'error' => 'unauthorized'], 403);
    }

    json_response(['ok' => false, 'error' => 'unknown_action'], 400);
}

if ($method === 'GET' && $action === 'state') {
    [$code, $room] = require_room([]);
    json_response(['ok' => true, 'room' => public_room($room)]);
}

json_response(['ok' => false, 'error' => 'method_not_allowed'], 405);
