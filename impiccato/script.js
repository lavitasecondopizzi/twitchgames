const urlParams = new URLSearchParams(window.location.search);
const sidParam = (urlParams.get('sid') || '').trim();
const apiUrl = sidParam ? `api.php?sid=${encodeURIComponent(sidParam)}` : 'api.php';

const btnNewGame      = document.getElementById('btnNewGame');
const modeRadios      = document.querySelectorAll('input[name="mode"]');
const player1NameInput = document.getElementById('player1Name');
const player2NameInput = document.getElementById('player2Name');

let currentState = null;
let currentMode  = 'guest';

const players = ['p1', 'p2'];

// mappa delle parti dell omino per ogni giocatore
const hangmanParts = {
  p1: [
    document.getElementById('p1-head'),
    document.getElementById('p1-body'),
    document.getElementById('p1-arm-l'),
    document.getElementById('p1-arm-r'),
    document.getElementById('p1-leg-l'),
    document.getElementById('p1-leg-r'),
  ],
  p2: [
    document.getElementById('p2-head'),
    document.getElementById('p2-body'),
    document.getElementById('p2-arm-l'),
    document.getElementById('p2-arm-r'),
    document.getElementById('p2-leg-l'),
    document.getElementById('p2-leg-r'),
  ]
};

modeRadios.forEach(r => {
  r.addEventListener('change', () => {
    currentMode = r.value;
  });
});


async function startGameFromInputs() {
  const p1Name = player1NameInput.value.trim() || 'Giocatore 1';
  const p2Name = player2NameInput.value.trim() || (currentMode === 'chat' ? 'Chat' : 'Giocatore 2');
  
  const body = {
    mode: currentMode,
    players: {
      p1: { name: p1Name },
      p2: { name: p2Name }
    }
  };
  
  const join = apiUrl.includes('?') ? '&' : '?';
  const res = await fetch(apiUrl + join + 'action=new', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  
  currentState = await res.json();
  renderState();
}

btnNewGame.addEventListener('click', startGameFromInputs);

// crea tastiere separate per p1 e p2
function createLetterButtons() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  
  players.forEach(playerId => {
    const container = document.getElementById(`lettersArea-${playerId}`);
    container.innerHTML = '';
    
    alphabet.forEach(letter => {
      const btn = document.createElement('button');
      btn.textContent = letter;
      btn.className = 'letter-btn';
      btn.dataset.letter = letter;
      btn.dataset.player = playerId;
      btn.addEventListener('click', () => onLetterClick(playerId, letter));
      container.appendChild(btn);
    });
  });
}

async function onLetterClick(playerId, letter) {
  if (!currentState || !currentState.players || !currentState.players[playerId]) return;
  const pState = currentState.players[playerId];
  if (pState.status !== 'playing') return;
  
  await guessLetter(playerId, letter);
}

async function guessLetter(playerId, letter) {
  const join = apiUrl.includes('?') ? '&' : '?';
  const res = await fetch(apiUrl + join + 'action=guess', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({player: playerId, letter})
  });
  currentState = await res.json();
  renderState();
}

// Se in futuro vuoi far giocare la chat via bot, puoi chiamare questa:
// window.guessLetterFromChat('p1', 'A') / ('p2', 'B')
window.guessLetterFromChat = async function(playerId, letter) {
  if (!currentState || !currentState.players || !currentState.players[playerId]) return;
  const pState = currentState.players[playerId];
  if (pState.status !== 'playing') return;
  await guessLetter(playerId, letter);
};

function renderState() {
  if (!currentState || !currentState.players) return;
  
  players.forEach(playerId => {
    const p = currentState.players[playerId];
    
    const nameEl       = document.getElementById(`playerName-${playerId}`);
    const statusTextEl = document.getElementById(`statusText-${playerId}`);
    const wordDisplay  = document.getElementById(`wordDisplay-${playerId}`);
    const errorsCount  = document.getElementById(`errorsCount-${playerId}`);
    const maxErrors    = document.getElementById(`maxErrors-${playerId}`);
    const wrongLetters = document.getElementById(`wrongLetters-${playerId}`);
    const lastGuess    = document.getElementById(`lastGuess-${playerId}`);
    
    if (!p) return;
    
    nameEl.textContent = p.name;
    wordDisplay.textContent = p.displayWord.split('').join(' ');
    errorsCount.textContent = p.wrongLetters.length;
    maxErrors.textContent   = p.maxErrors;
    wrongLetters.textContent = p.wrongLetters.join(', ') || '-';
    lastGuess.textContent = p.lastGuess || '-';
    
    // testo stato
    let statusText = 'In attesa…';
    if (p.status === 'playing') {
      statusText = 'Sta giocando…';
    } else if (p.status === 'won') {
      statusText = 'HA VINTO! 🎉';
    } else if (p.status === 'lost') {
      statusText = 'HA PERSO 💀';
    }
    statusTextEl.textContent = statusText;
    
    // lettere disabilitate
    const usedLetters = new Set([
      ...p.correctLetters,
      ...p.wrongLetters
    ]);
    
    document.querySelectorAll(`#lettersArea-${playerId} .letter-btn`).forEach(btn => {
      const l = btn.dataset.letter;
      if (usedLetters.has(l)) {
        btn.disabled = true;
        btn.classList.add('used');
      } else {
        btn.disabled = (p.status !== 'playing');
        btn.classList.remove('used');
      }
    });
    
    // aggiorna l omino
    drawHangman(playerId, p.wrongLetters.length);
  });
}

function drawHangman(playerId, errors) {
  const parts = hangmanParts[playerId];
  if (!parts) return;
  parts.forEach((part, index) => {
    if (!part) return;
    part.style.opacity = (index < errors) ? '1' : '0';
  });
}

// Polling stato (utile se il bot chiama direttamente l API)
async function fetchState() {
  try {
    const res = await fetch(apiUrl);
    const state = await res.json();
    currentState = state;
    renderState();
  } catch (e) {
    console.error(e);
  }
}

// init
createLetterButtons();

const modeFromUrl = (urlParams.get('mode') || '').trim();
if (modeFromUrl === 'guest' || modeFromUrl === 'chat') {
  currentMode = modeFromUrl;
  const radio = document.querySelector(`input[name="mode"][value="${modeFromUrl}"]`);
  if (radio) radio.checked = true;
}

const p1FromUrl = (urlParams.get('p1') || '').trim();
const p2FromUrl = (urlParams.get('p2') || '').trim();
if (p1FromUrl) player1NameInput.value = p1FromUrl;
if (p2FromUrl) player2NameInput.value = p2FromUrl;

fetchState();
if (urlParams.get('autostart') === '1') {
  startGameFromInputs();
}
setInterval(fetchState, 3000);