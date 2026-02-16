<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
// risposta semplice in testo
header('Content-Type: text/plain; charset=utf-8');

// ATTENTO: assicurati che questo sia lo stesso file usato da sync.php
$STATE_FILE = __DIR__ . '/stato.json';

// leggo parametri GET
$cmd  = isset($_GET['cmd'])  ? strtolower(trim($_GET['cmd'])) : '';
$name = isset($_GET['name']) ? intval($_GET['name']) : '';
$user = isset($_GET['user']) ? trim($_GET['user']) : 'anon';

// validazioni base
if ($cmd !== 'rosso' && $cmd !== 'verde') {
    http_response_code(400);
    echo "Comando non valido. Usa cmd=rosso o cmd=verde.";
    exit;
}

if ($name === '') {
    http_response_code(400);
    echo "Nome personaggio mancante (parametro name=).";
    exit;
}

if ($user === '') {
    $user = 'anon';
}

// carica stato esistente (se c'è)
$state = [];

if (file_exists($STATE_FILE)) {
    $json = file_get_contents($STATE_FILE);
    if ($json !== false && $json !== '') {
        $data = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            // JSON rotto: non facciamo saltare tutto
            // ma ripartiamo da uno stato base
            $data = [];
        }
        if (is_array($data)) {
            $state = $data;
        }
    }
}

// assicuro struttura chatVotes
if (!isset($state['chatVotes']) || !is_array($state['chatVotes'])) {
    $state['chatVotes'] = [
        'round'   => 0,
        'entries' => []
    ];
}
if (!isset($state['chatVotes']['entries']) || !is_array($state['chatVotes']['entries'])) {
    $state['chatVotes']['entries'] = [];
}

// preparo la nuova entry
$entry = [
    'user' => $user,
    'cmd'  => $cmd,
    'name' => $name,
    'ts'   => date('c'), // ISO 8601
];

// riferimento comodo all'array entries
$entries = &$state['chatVotes']['entries'];

// controlla se l'ultimo voto è identico (stesso user/cmd/cell)
// per evitare loop o doppie chiamate del bot
$last = end($entries);
if ($last !== false &&
    isset($last['user'], $last['cmd'], $last['name']) &&
    $last['user'] === $user &&
    $last['cmd']  === $cmd &&
    trim(strtolower($last['name'])) === trim(strtolower($name))
) {
    // voto duplicato consecutivo: non lo aggiungiamo di nuovo
    echo "IGNORATO: duplicato di {$user} -> {$cmd} {$name}";
    // riportiamo il puntatore dell'array all'inizio, per sicurezza
    reset($entries);
    exit;
}

// se non è duplicato, aggiungiamo il voto
$entries[] = $entry;
reset($entries); // opzionale, per non lasciare il puntatore alla fine

// salvo
if (file_put_contents($STATE_FILE, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
    http_response_code(500);
    echo "Impossibile scrivere il file di stato.";
    exit;
}

echo "Grazie mille {$user} per aver votato, ho registrato il tuo voto!";
