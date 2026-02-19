<?php
	header('Content-Type: application/json; charset=utf-8');

	function session_id_from_query(): string {
		$sid = isset($_GET['sid']) ? (string)$_GET['sid'] : '';
		$sid = preg_replace('/[^a-zA-Z0-9_-]/', '', $sid);
		return $sid;
	}

	function state_file_for_sid(string $sid): string {
		return __DIR__ . '/stato' . ($sid !== '' ? ('_' . $sid) : '') . '.json';
	}

	function default_state(): array {
		return [
			'status' => 'lobby',
			'version' => 0,
			'updatedAt' => time(),
			'chatVotes' => ['round' => 0, 'entries' => []],
		];
	}

	function load_state(string $file): array {
		if (!file_exists($file)) return default_state();
		$raw = @file_get_contents($file);
		if ($raw === false || trim($raw) === '') return default_state();
		$data = json_decode($raw, true);
		if (!is_array($data)) return default_state();
		if (!isset($data['version'])) $data['version'] = 0;
		if (!isset($data['status'])) $data['status'] = 'lobby';
		if (!isset($data['updatedAt'])) $data['updatedAt'] = time();
		return $data;
	}

	function save_state(string $file, array $state): bool {
		$state['updatedAt'] = time();
		$state['version'] = isset($state['version']) ? ((int)$state['version'] + 1) : 1;
		$json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		if ($json === false) return false;
		return file_put_contents($file, $json, LOCK_EX) !== false;
	}

	$sid = session_id_from_query();
	$file = state_file_for_sid($sid);
	$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
	$action = isset($_GET['action']) ? (string)$_GET['action'] : '';

	if ($method === 'GET') {
		echo json_encode(load_state($file), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	if ($method === 'POST') {
		if ($action === 'reset') {
			$state = default_state();
			$state['status'] = 'lobby';
			if (!save_state($file, $state)) {
				http_response_code(500);
				echo json_encode(['error' => 'cannot save state']);
				exit;
			}
			echo json_encode(['ok' => true, 'sid' => $sid, 'state' => $state]);
			exit;
		}

		$payload = file_get_contents('php://input') ?: '{}';
		$decoded = json_decode($payload, true);
		if (!is_array($decoded)) {
			http_response_code(400);
			echo json_encode(['error' => 'invalid json']);
			exit;
		}
		if (!isset($decoded['status'])) $decoded['status'] = 'running';

		if (!save_state($file, $decoded)) {
			http_response_code(500);
			echo json_encode(['error' => 'cannot save state']);
			exit;
		}

		echo json_encode(['ok' => true, 'sid' => $sid]);
		exit;
	}

	http_response_code(405);
	echo json_encode(['error' => 'method not allowed']);