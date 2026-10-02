(() => {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || '').toUpperCase();
  const $ = id => document.getElementById(id);
  const difficultyNames = { facile: 'FACILE', medio: 'MEDIO', difficile: 'DIFFICILE' };
  const HINT_DELAY_MS = 10 * 60 * 1000;
  let client = null;
  let timer = null;
  let currentState = { started:false, solved:false, solutionRevealed:false, difficulty:'facile', revealedHints:[], history:[], scores:{}, solvedBy:[] };

  function status(message, error=false) {
    const el = $('connectionStatus');
    if (el) { el.textContent = message; el.style.color = error ? '#b71919' : ''; }
  }

  function showLoading(message='CONNESSIONE ALLA DIRETTA…') {
    $('loadingText').textContent = message;
    $('loadingOverlay').classList.remove('hidden');
  }

  function hideLoading() { $('loadingOverlay').classList.add('hidden'); }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function scoreMarkup(scores) {
    return Object.entries(scores || {}).sort((a,b) => b[1] - a[1])
      .map(([name, points], i) => '<div class="entry"><strong>' + (i+1) + '. ' + esc(name) + '</strong>' + points + ' punti</div>')
      .join('') || '<p class="muted">Nessun punto assegnato.</p>';
  }

  function hintTimeRemaining(s) {
    if (!s.started || s.solutionRevealed) return 0;
    const hints = (s.revealedHints || []).length;
    if (hints >= 3) return 0;
    const anchor = hints > 0 ? s.lastHintAt : s.startedAt;
    if (!Number.isFinite(anchor) || anchor <= 0) return 0;
    return Math.max(0, HINT_DELAY_MS - (Date.now() - anchor));
  }

  function updateHintTimer(s) {
    const el = $('hintTimer');
    if (!el) return;
    if (!s.started || s.solutionRevealed) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const remaining = hintTimeRemaining(s);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const hints = (s.revealedHints || []).length;
    el.querySelector('.hint-timer-label').textContent =
      hints >= 3 ? 'TUTTI GLI INDIZI RIVELATI' :
      remaining > 0 ? 'PROSSIMO INDIZIO TRA ' + String(minutes).padStart(2,'0') + ':' + String(seconds).padStart(2,'0') :
      'INDIZIO DISPONIBILE AL MASTER';
    const progress = hints >= 3 ? 100 : Math.max(0, Math.min(100, 100 * (1 - remaining / HINT_DELAY_MS)));
    el.querySelector('.hint-timer-fill').style.width = progress + '%';
    el.classList.toggle('ready', remaining === 0 && hints < 3);
  }

  function render(s) {
    currentState = {...currentState, ...s};
    $('connection').classList.add('hidden');
    $('waitingView').classList.toggle('hidden', !!s.started);
    $('playerView').classList.toggle('hidden', !s.started);

    const difficulty = difficultyNames[s.difficulty] || 'FACILE';
    $('difficultyValue').textContent = difficulty;
    $('difficultyStatus').textContent = s.started
      ? 'DIFFICOLTÀ: ' + difficulty + ' · GESTITA DAL MASTER'
      : 'DIFFICOLTÀ ATTUALE: ' + difficulty + ' · SCELTA DALL’OSPITE';

    if (!s.started) {
      $('roundLabel').textContent = 'IN ATTESA DEL MISTERO';
      $('storyTitle').textContent = 'In attesa del Master';
      $('storyText').textContent = 'L’ospite può modificare la difficoltà. Il Master sceglierà la storia e avvierà il mistero.';
      $('hints').innerHTML = '';
      updateHintTimer(s);
      hideLoading();
      return;
    }

    $('roundLabel').textContent = 'MISTERO ' + (s.roundNumber || s.index + 1) + ' · ' + difficulty;
    $('storyTitle').textContent = s.title || 'Mistero in preparazione';
    $('storyText').textContent = s.story || '';
    if (s.solutionRevealed && s.solution) $('storyText').textContent += '\n\nSOLUZIONE: ' + s.solution;

    $('hints').innerHTML = (s.revealedHints || [])
      .map((hint,i) => '<div class="hint"><b>INDIZIO ' + (i+1) + ':</b> ' + esc(hint) + '</div>').join('');

    $('answerHistory').innerHTML = (s.history || []).slice().reverse()
      .map(item => '<div class="entry"><strong>' + esc(item.author) + ' · ' + esc(item.answer) + '</strong>' + esc(item.question) + '</div>')
      .join('') || '<p class="muted">Ancora nessuna risposta.</p>';

    $('leaderboard').innerHTML = scoreMarkup(s.scores);
    $('solvedNotice').classList.toggle('hidden', !(s.solvedBy || []).length);
    if ((s.solvedBy || []).length) $('solvedNotice').textContent = 'Soluzioni approvate: ' + s.solvedBy.join(', ') + '.';

    updateHintTimer(s);
    hideLoading();
  }

  function setupRules() {
    const overlay = $('rulesOverlay');
    const open = () => { overlay.classList.remove('hidden'); $('closeRules').focus(); };
    const close = () => { overlay.classList.add('hidden'); $('openRules').focus(); };
    $('openRules').addEventListener('click', open);
    $('closeRules').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
  }

  async function init() {
    if (!/^[A-Z0-9]{6}$/.test(room)) {
      hideLoading();
      status('Codice stanza mancante o non valido.', true);
      return;
    }

    try {
      client = new TortelloSupabaseRoom({room, role:'host', nickname:'Pizzi', game:'dark-stories'});

      client.on('connected', () => {
        status('Connesso alla diretta della stanza ' + room + '.');
        client.broadcast('state_request', {requester:'host'}).catch(() => {});
      });

      client.on('game-state', payload => { if (payload) render(payload); });

      client.on('presence', presence => {
        const master = Object.values(presence || {}).flat().some(entry => entry.role === 'master');
        status(master ? 'Master collegato. Diretta sincronizzata.' : 'In attesa del Master…');
        if (master) client.broadcast('state_request', {requester:'host'}).catch(() => {});
      });

      await client.connect();
      timer = setInterval(() => updateHintTimer(currentState), 1000);
    } catch (error) {
      hideLoading();
      status(error.message || 'Errore di connessione.', true);
    }
  }

  setupRules();
  showLoading();
  init();
})();