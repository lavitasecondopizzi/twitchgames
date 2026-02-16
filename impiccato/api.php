<?php
// api.php
session_start();

header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/game_state.json';
$maxErrors = 6;

/**
 * Dizionario di parole complesse.
 * Puoi spostarle in un file o aggiungerne quante vuoi.
 */
function getDictionary() {
    return [
        'AUTENTICAZIONE MULTIFATTORE',
        'SINCRONIZZAZIONE ASINCRONA',
        'OTTIMIZZAZIONE PREMATURA',
        'PROGRAMMATORE FULLSTACK',
        'INTEGRAZIONE CONTINUA',
        'COMPATIBILITA RETROATTIVA',
        'SOVRACCARICO COGNITIVO',
        'CALCOLO COMBINATORIO',
        'ALGORITMO GENETICO',
        'INTELLIGENZA ARTIFICIALE',
        'SERIALIZZAZIONE DEI DATI',
        'CONCORRENZA OTTIMISTICA',
        'ARCHITETTURA EVENT DRIVEN',
        'INTERFACCIA REATTIVA',
        'BILANCIAMENTO DEL CARICO',
    ];
}

/**
 * Ritorna una parola casuale dal dizionario in UPPERCASE.
 */
function getRandomWord() {
    $dict = getDictionary();
    $word = $dict[array_rand($dict)];
    return mb_strtoupper($word, 'UTF-8');
}

/**
 * Crea lo stato "vuoto" di un giocatore.
 */
function createEmptyPlayerState($id, $name, $maxErrors) {
    return [
        'id'             => $id,
        'name'           => $name,
        'secretWord'     => '',
        'displayWord'    => '',
        'correctLetters' => [],
        'wrongLetters'   => [],
        'maxErrors'      => $maxErrors,
        'status'         => 'idle', // idle | playing | won | lost
        'lastGuess'      => null,
    ];
}

/**
 * Costruisce la stringa da mostrare (underscore dove non ci sono spazi/trattini).
 */
function buildDisplayFromSecret($secret) {
    $len = mb_strlen($secret, 'UTF-8');
    $display = '';
    for ($i = 0; $i < $len; $i++) {
        $char = mb_substr($secret, $i, 1, 'UTF-8');
        if ($char === ' ' || $char === '-') {
            $display .= $char;
        } else {
            $display .= '_';
        }
    }
    return $display;
}

function load_state($file, $maxErrors) {
    if (file_exists($file)) {
        $json = file_get_contents($file);
        $data = json_decode($json, true);
        if (is_array($data)) {
            return $data;
        }
    }
    // stato di default a 2 giocatori
    return [
        'mode'    => 'guest', // guest | chat (solo descrittivo)
        'status'  => 'idle',  // idle | playing | finished
        'players' => [
            'p1' => createEmptyPlayerState('p1', 'Giocatore 1', $maxErrors),
            'p2' => createEmptyPlayerState('p2', 'Giocatore 2', $maxErrors),
        ],
    ];
}

function save_state($file, $state) {
    file_put_contents($file, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : null;

$state = load_state($file, $maxErrors);

if ($method === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = json_decode($raw, true);

    // NUOVA PARTITA: genera 2 parole casuali diverse
    if ($action === 'new') {
        $mode = isset($body['mode']) ? $body['mode'] : 'guest';

        $p1Name = isset($body['players']['p1']['name']) && trim($body['players']['p1']['name']) !== ''
            ? trim($body['players']['p1']['name'])
            : 'Giocatore 1';

        $p2Name = isset($body['players']['p2']['name']) && trim($body['players']['p2']['name']) !== ''
            ? trim($body['players']['p2']['name'])
            : ($mode === 'chat' ? 'Chat' : 'Giocatore 2');

        // scegli due parole casuali
        $w1 = getRandomWord();
        do {
            $w2 = getRandomWord();
        } while ($w2 === $w1); // garantiamo che siano diverse

        // normalizza (togliamo caratteri strani, teniamo lettere, spazi e trattini)
        $w1 = preg_replace('/[^A-ZÀ-ÖØ-Ý \\-]/u', '', $w1);
        $w2 = preg_replace('/[^A-ZÀ-ÖØ-Ý \\-]/u', '', $w2);

        $state = [
            'mode'    => $mode,
            'status'  => 'playing',
            'players' => [
                'p1' => [
                    'id'             => 'p1',
                    'name'           => $p1Name,
                    'secretWord'     => $w1,
                    'displayWord'    => buildDisplayFromSecret($w1),
                    'correctLetters' => [],
                    'wrongLetters'   => [],
                    'maxErrors'      => $maxErrors,
                    'status'         => 'playing',
                    'lastGuess'      => null,
                ],
                'p2' => [
                    'id'             => 'p2',
                    'name'           => $p2Name,
                    'secretWord'     => $w2,
                    'displayWord'    => buildDisplayFromSecret($w2),
                    'correctLetters' => [],
                    'wrongLetters'   => [],
                    'maxErrors'      => $maxErrors,
                    'status'         => 'playing',
                    'lastGuess'      => null,
                ],
            ],
        ];

        save_state($file, $state);
        echo json_encode($state);
        exit;
    }

    // GIOCA UNA LETTERA PER UNO DEI DUE GIOCATORI
    if ($action === 'guess') {
        $playerId = isset($body['player']) ? $body['player'] : null;
        $letter   = isset($body['letter']) ? $body['letter'] : '';

        if (!isset($state['players'][$playerId])) {
            echo json_encode($state);
            exit;
        }

        $player = $state['players'][$playerId];

        if ($player['status'] !== 'playing') {
            echo json_encode($state);
            exit;
        }

        $letter = mb_strtoupper(trim($letter), 'UTF-8');

        if (mb_strlen($letter, 'UTF-8') !== 1 || !preg_match('/^[A-ZÀ-ÖØ-Ý]$/u', $letter)) {
            echo json_encode($state);
            exit;
        }

        if (in_array($letter, $player['correctLetters'], true) ||
            in_array($letter, $player['wrongLetters'], true)) {
            echo json_encode($state);
            exit;
        }

        $secret  = $player['secretWord'];
        $display = $player['displayWord'];

        $len        = mb_strlen($secret, 'UTF-8');
        $newDisplay = '';
        $found      = false;

        for ($i = 0; $i < $len; $i++) {
            $char     = mb_substr($secret, $i, 1, 'UTF-8');
            $dispChar = mb_substr($display, $i, 1, 'UTF-8');

            if ($char === ' ' || $char === '-') {
                $newDisplay .= $char;
                continue;
            }

            if ($char === $letter) {
                $newDisplay .= $char;
                $found = true;
            } else {
                $newDisplay .= ($dispChar === '_' ? '_' : $dispChar);
            }
        }

        if ($found) {
            $player['correctLetters'][] = $letter;
            $player['displayWord']      = $newDisplay;
            if (mb_strpos($newDisplay, '_', 0, 'UTF-8') === false) {
                $player['status'] = 'won';
            }
        } else {
            $player['wrongLetters'][] = $letter;
            if (count($player['wrongLetters']) >= $player['maxErrors']) {
                $player['status'] = 'lost';
            }
        }

        $player['lastGuess'] = $letter;

        // rimettiamo dentro allo stato globale
        $state['players'][$playerId] = $player;

        // se entrambi non sono più "playing" marchiamo lo stato globale come finished
        $allFinished = true;
        foreach ($state['players'] as $p) {
            if ($p['status'] === 'playing') {
                $allFinished = false;
                break;
            }
        }
        $state['status'] = $allFinished ? 'finished' : 'playing';

        save_state($file, $state);
        echo json_encode($state);
        exit;
    }
}

// GET: restituisce lo stato corrente
echo json_encode($state);
