<?php
	error_reporting(E_ALL);
	ini_set('display_errors', 1);
	header('Content-Type: text/plain; charset=utf-8');

	$sid = isset($_GET['sid']) ? (string)$_GET['sid'] : '';
	$sid = preg_replace('/[^a-zA-Z0-9_-]/', '', $sid);
	$STATE_FILE = __DIR__ . '/stato' . ($sid !== '' ? ('_' . $sid) : '') . '.json';

	$cmd  = isset($_GET['cmd']) ? strtolower(trim($_GET['cmd'])) : '';
	$name = isset($_GET['name']) ? trim((string)$_GET['name']) : '';
	$user = isset($_GET['user']) ? trim((string)$_GET['user']) : 'anon';

	if ($cmd !== 'rosso' && $cmd !== 'verde'){
		http_response_code(400);
		echo 'Comando non valido. Usa cmd=rosso o cmd=verde.';
		exit;
	}
	if ($name === ''){
		http_response_code(400);
		echo 'Nome personaggio mancante (parametro name=).';
		exit;
	}
	if ($user === '') $user = 'anon';

	$state = [];
	if (file_exists($STATE_FILE)){
		$json = file_get_contents($STATE_FILE);
		$data = json_decode($json ?: '{}', true);
		if (is_array($data)) $state = $data;
	}
	if (!isset($state['chatVotes']) || !is_array($state['chatVotes'])){
		$state['chatVotes'] = ['round' => 0, 'entries' => []];
	}
	if (!isset($state['chatVotes']['entries']) || !is_array($state['chatVotes']['entries'])){
		$state['chatVotes']['entries'] = [];
	}

	$entry = ['user' => $user, 'cmd' => $cmd, 'name' => $name, 'ts' => date('c')];
	$entries = &$state['chatVotes']['entries'];

	$last = end($entries);
	if ($last !== false && isset($last['user'], $last['cmd'], $last['name'])
		&& $last['user'] === $user && $last['cmd'] === $cmd
		&& trim(strtolower((string)$last['name'])) === trim(strtolower($name))){
		echo "IGNORATO: duplicato di {$user} -> {$cmd} {$name}";
		reset($entries);
		exit;
	}

	$entries[] = $entry;
	$state['status'] = 'running';
	$state['updatedAt'] = time();
	$state['version'] = isset($state['version']) ? ((int)$state['version'] + 1) : 1;

	if (file_put_contents($STATE_FILE, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX) === false){
		http_response_code(500);
		echo 'Impossibile scrivere il file di stato.';
		exit;
	}

	echo "Grazie {$user}, voto registrato";