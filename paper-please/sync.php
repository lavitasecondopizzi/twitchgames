<?php
	declare(strict_types=1);

	header('Content-Type: application/json; charset=utf-8');

	function sid_from_query(): string {
		$sid = isset($_GET['sid']) ? (string)$_GET['sid'] : '';
		return preg_replace('/[^a-zA-Z0-9_-]/', '', $sid);
	}

	function state_file(string $sid): string {
		return __DIR__ . '/stato' . ($sid !== '' ? ('_' . $sid) : '') . '.json';
	}

	function default_state(): array {
		return [
			'status' => 'lobby',
			'version' => 0,
			'updatedAt' => time(),
			'currentIndex' => 0,
			'decisions' => [],
			'world' => ['regime' => 50, 'popolo' => 50, 'ribelli' => 50],
			'chat' => ['round' => 1, 'suggestions' => [], 'votes' => []],
			'lastOutcome' => ['index' => null, 'decision' => null, 'text' => ''],
			'gameOver' => false,
			'gameOverReason' => '',
			'gameOverCause' => '',
			'runCompleted' => false,
		];
	}

	function read_state(string $file): array {
		if (!file_exists($file)) return default_state();
		$raw = @file_get_contents($file);
		if ($raw === false || trim($raw) === '') return default_state();
		$data = json_decode($raw, true);
		if (!is_array($data)) return default_state();
		if (!isset($data['version'])) $data['version'] = 0;
		if (!isset($data['status'])) $data['status'] = 'running';
		return $data;
	}

	function write_state(string $file, array $data): bool {
		$data['updatedAt'] = time();
		$data['version'] = isset($data['version']) ? ((int)$data['version'] + 1) : 1;
		$json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		if ($json === false) return false;

		$tmp = $file . '.tmp';
		if (@file_put_contents($tmp, $json, LOCK_EX) === false) return false;
		return @rename($tmp, $file);
	}

	$sid = sid_from_query();
	$stateFile = state_file($sid);
	$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
	$action = isset($_GET['action']) ? (string)$_GET['action'] : '';

	if ($method === 'GET') {
		echo json_encode(read_state($stateFile), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	if ($method === 'POST') {
		if ($action === 'reset') {
			$state = default_state();
			if (!write_state($stateFile, $state)) {
				http_response_code(500);
				echo json_encode(['error' => 'Cannot write state']);
				exit;
			}
			echo json_encode(['ok' => true, 'sid' => $sid]);
			exit;
		}

		$raw = file_get_contents('php://input') ?: '';
		$data = json_decode($raw, true);
		if (!is_array($data)) {
			http_response_code(400);
			echo json_encode(['error' => 'Invalid JSON']);
			exit;
		}
		if (!isset($data['status'])) $data['status'] = 'running';

		if (!write_state($stateFile, $data)) {
			http_response_code(500);
			echo json_encode(['error' => 'Cannot write state']);
			exit;
		}

		echo json_encode(['ok' => true, 'sid' => $sid]);
		exit;
	}

	http_response_code(405);
	echo json_encode(['error' => 'Method not allowed']);