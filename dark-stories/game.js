(() => {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || '').toUpperCase();
  const role = !!document.querySelector('.master-page') ? 'master' : (params.get('role') || 'guest');
  const isMaster = role === 'master';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let client, cases = [], currentIndex = 0, state = {started:false, solved:false, revealedHints:[], history:[], queue:[], scores:{}, solvedBy:[]}, twitchSocket = null, twitchChannel = '';
  const status = (message, error = false) => { if ($('connectionStatus')) { $('connectionStatus').textContent = message; $('connectionStatus').style.color = error ? '#b71919' : ''; } };
  const gameState = () => ({
    started:state.started, solved:state.solved, index:currentIndex,
    title:cases[currentIndex]?.title || '', story:cases[currentIndex]?.story || '',
    revealedHints:[...(state.revealedHints || [])], history:[...(state.history || [])],
    queue:(state.queue || []).map(q => ({id:q.id,author:q.author,question:q.question,source:q.source,answer:q.answer || null})),
    scores:{...(state.scores || {})}, solvedBy:[...(state.solvedBy || [])],
    solutionRevealed:!!state.solutionRevealed
  });
  function sendState(){ if(isMaster && client) client.broadcast('game_state',gameState()).catch(err=>status('Errore sincronizzazione: '+err.message,true)); }
  function renderPlayer(s){
    $('connection').classList.add('hidden');
    $('waitingView').classList.toggle('hidden',!!s.started);
    $('playerView').classList.toggle('hidden',!s.started);
    if(!s.started)return;
    $('roundLabel').textContent='MISTERO '+(s.index+1)+' / '+cases.length;
    $('storyTitle').textContent=s.title;
    $('storyText').textContent=s.story;
    $('hints').innerHTML=(s.revealedHints||[]).map((hint,i)=>'<div class="hint"><b>INDIZIO '+(i+1)+':</b> '+esc(hint)+'</div>').join('');
    $('answerHistory').innerHTML=(s.history||[]).slice().reverse().map(item=>'<div class="entry"><strong>'+esc(item.author)+' · '+esc(item.answer)+'</strong>'+esc(item.question)+'</div>').join('')||'<p class="muted">Ancora nessuna risposta.</p>';
    $('leaderboard').innerHTML=scoreMarkup(s.scores);
    $('solvedNotice').classList.toggle('hidden',!s.solved);
    if(s.solved) $('solvedNotice').textContent='MISTERO RISOLTO da '+(s.solvedBy||[]).join(', ')+'. Il Master può rivelare la soluzione e passare al prossimo mistero.';
    $('questionInput').disabled=!!s.solved;
    $('questionForm').querySelector('button').disabled=!!s.solved;
    if(s.solutionRevealed && s.solution) $('storyText').textContent=s.story+'\n\nSOLUZIONE: '+s.solution;
  }
  function scoreMarkup(scores){
    const rows=Object.entries(scores||{}).sort((a,b)=>b[1]-a[1]);
    return rows.map(([name,points],i)=>'<div class="entry"><strong>'+(i+1)+'. '+esc(name)+'</strong>'+points+' punti</div>').join('')||'<p class="muted">Nessun punto assegnato.</p>';
  }
  function renderMaster(s){
    $('connection').classList.add('hidden'); $('masterView').classList.remove('hidden');
    $('masterRound').textContent='MISTERO '+(s.index+1)+' / '+cases.length;
    $('masterTitle').textContent=s.title || cases[currentIndex]?.title || 'Mistero';
    $('masterStory').textContent=s.story || cases[currentIndex]?.story || '';
    $('masterSolution').textContent=cases[currentIndex]?.solution || '';
    $('masterHints').innerHTML=(s.revealedHints||[]).map((hint,i)=>'<div class="hint"><b>INDIZIO '+(i+1)+':</b> '+esc(hint)+'</div>').join('')||'Nessun indizio rivelato.';
    $('startRound').disabled=!!s.started;
    $('nextRound').disabled=!s.started || (!s.solved && !s.solutionRevealed) || currentIndex>=cases.length-1;
    $('hintButton').disabled=!s.started || s.solved || (s.revealedHints||[]).length>=cases[currentIndex].hints.length;
    $('revealSolution').disabled=!s.started || !s.solved;
    $('masterLeaderboard').innerHTML=scoreMarkup(s.scores);
    $('questionQueue').innerHTML=(s.queue||[]).map(q=>{
      const answered=q.answer ? '<div class="notice">Risposta: '+esc(q.answer)+'</div>' :
      '<div class="answer-controls"><button class="btn secondary" data-answer="SÌ" data-id="'+esc(q.id)+'">SÌ</button><button class="btn secondary" data-answer="NO" data-id="'+esc(q.id)+'">NO</button><button class="btn secondary" data-answer="IRRILEVANTE" data-id="'+esc(q.id)+'">IRRILEVANTE</button></div>';
      return '<article class="question"><div class="meta">'+esc(q.source)+' · '+esc(q.author)+'</div><p>'+esc(q.question)+'</p>'+answered+'</article>';
    }).join('')||'<p class="muted">Nessuna domanda in coda.</p>';
    $('questionQueue').querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>answerQuestion(btn.dataset.id,btn.dataset.answer)));
    $('masterStatus').textContent=s.solved ? 'Mistero risolto. Verifica la soluzione e rivela la risposta.' : 'Domande in arrivo dalla chat e dall’ospite.';
  }
  function render(s){
    if(!s)return;
    currentIndex=Number.isInteger(s.index)?s.index:currentIndex;
    state={...state,...s,queue:s.queue||[],scores:s.scores||{},history:s.history||[],revealedHints:s.revealedHints||[],solvedBy:s.solvedBy||[]};
    if(isMaster)renderMaster({...gameState(),...s}); else renderPlayer(s);
  }
  async function publish(){
    const s=gameState();
    // The solution remains master-only until the Master explicitly reveals it.
    if(client) await client.broadcast('game_state',s);
    renderMaster(s);
  }
  async function sendQuestion(author,question,source='OSPITE'){
    const clean=String(question||'').replace(/\s+/g,' ').trim();
    if(!clean || clean.length>300)return;
    if(isMaster){addQuestion(author,clean,source);return;}
    if(!client)return;
    await client.broadcast('game_event',{type:'question',author:String(author||'Anonimo').slice(0,24),question:clean,source});
  }
  function addQuestion(author,question,source){
    if(state.solved)return;
    const duplicate=state.queue.some(q=>q.question.toLowerCase()===question.toLowerCase()&&q.author.toLowerCase()===author.toLowerCase());
    if(duplicate)return;
    state.queue.push({id:crypto.randomUUID(),author:String(author||'Anonimo').slice(0,24),question,source,answer:null});
    publish();
  }
  async function answerQuestion(id,answer){
    const q=state.queue.find(item=>item.id===id); if(!q||q.answer)return;
    q.answer=answer; state.history.push({author:q.author,question:q.question,answer,source:q.source});
    await publish();
  }
  async function startRound(){
    if(!cases.length)return;
    state.started=true;state.solved=false;state.solutionRevealed=false;state.revealedHints=[];state.history=[];state.queue=[];state.solvedBy=[];
    await publish();
  }
  async function revealHint(){
    const list=cases[currentIndex]?.hints||[];
    if(state.revealedHints.length<list.length)state.revealedHints.push(list[state.revealedHints.length]);
    await publish();
  }
  async function approveSolution(name,answer){
    const clean=String(name||'').trim().slice(0,24);if(!clean)return;
    const key=clean.toLowerCase();
    if(state.solvedBy.some(n=>n.toLowerCase()===key)){ $('masterStatus').textContent='Questo giocatore ha già ricevuto punti per il mistero.';return; }
    state.solved=true;state.solvedBy.push(clean);state.scores[clean]=(state.scores[clean]||0)+3;
    state.history.push({author:clean,question:'SOLUZIONE: '+answer,answer:'APPROVATA +3 PUNTI',source:'MASTER'});
    $('solverName').value='';$('solverAnswer').value='';
    await publish();
    $('masterStatus').textContent=clean+' ha risolto il mistero: +3 punti.';
  }
  async function revealSolution(){
    state.solutionRevealed=true;
    const s=gameState();s.solution=cases[currentIndex].solution;
    await client.broadcast('game_state',s);
    renderMaster(s);
  }
  async function nextRound(){
    if(currentIndex>=cases.length-1){$('masterStatus').textContent='Hai raggiunto l’ultimo mistero.';return;}
    currentIndex++;state.started=false;state.solved=false;state.solutionRevealed=false;state.revealedHints=[];state.history=[];state.queue=[];state.solvedBy=[];
    await publish();
  }
  function connectTwitch(){
    const channel=$('twitchChannel').value.trim().replace(/^#/,'').replace(/^@/,'').toLowerCase();
    if(!/^[a-z0-9_]{1,25}$/.test(channel)){ $('twitchStatus').textContent='Inserisci un nome canale Twitch valido.';return; }
    if(twitchSocket)twitchSocket.close();
    twitchChannel=channel;
    const ws=new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    twitchSocket=ws;
    $('twitchStatus').textContent='Connessione a #'+channel+'…';
    ws.onopen=()=>{ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');ws.send('PASS SCHMOOPIIE');ws.send('NICK justinfan'+Math.floor(Math.random()*90000+10000));ws.send('JOIN #'+channel);};
    ws.onmessage=event=>{
      const lines=String(event.data).split('\r\n');
      for(const line of lines){
        if(line.startsWith('PING ')){ws.send('PONG '+line.slice(5));continue;}
        const match=line.match(/^(?:@([^ ]+) )?:([^! ]+)!.* PRIVMSG #[^ ]+ :(.*)$/);
        if(!match)continue;
        const tags=Object.fromEntries((match[1]||'').split(';').map(t=>{const i=t.indexOf('=');return i<0?[t,'']:[t.slice(0,i),t.slice(i+1)];}));
        const author=tags['display-name']||match[2];
        const message=match[3].trim();
        const q=message.match(/^!(?:ds|domanda)\s+(.{3,300})$/i);
        if(q)addQuestion(author,q[1],'TWITCH');
        const solution=message.match(/^!soluzione\s+(.{3,300})$/i);
        if(solution && !state.solved){$('solverName').value=author;$('solverAnswer').value=solution[1];$('masterStatus').textContent='Soluzione proposta in chat da '+author+'. Verificala e approvala.';}
      }
    };
    ws.onclose=()=>{if($('twitchStatus'))$('twitchStatus').textContent='Chat Twitch disconnessa.';};
    ws.onerror=()=>{if($('twitchStatus'))$('twitchStatus').textContent='Errore di connessione alla chat Twitch.';};
    $('twitchStatus').textContent='Collegamento richiesto a #'+channel+'. Le domande si inviano con !ds testo.';
  }
  async function init(){
    if(!/^[A-Z0-9]{6}$/.test(room)){status('Codice stanza mancante o non valido. Torna alla lobby e riapri il gioco.',true);return;}
    try{
      cases=await fetch('cases.json').then(r=>{if(!r.ok)throw new Error('Impossibile caricare i misteri.');return r.json();});
      client=new TortelloSupabaseRoom({room,role:isMaster?'master':role,nickname:isMaster?'Master':(params.get('player')||'Ospite'),game:'dark-stories'});
      client.on('connected',()=>status('Connesso alla stanza '+room+'.'));
      client.on('game-state',payload=>{if(payload)render(payload);});
      client.on('game-event',payload=>{
        if(isMaster && payload?.type==='question')addQuestion(payload.author,payload.question,payload.source||'OSPITE');
        if(!isMaster && payload?.type==='solution-revealed'){const s=gameState();s.solution=payload.solution;s.solutionRevealed=true;render(s);}
      });
      client.on('presence',presence=>{
        if(!isMaster){
          const master=Object.values(presence||{}).flat().some(entry=>entry.role==='master');
          status(master?'Master collegato.':'In attesa del Master…');
          if(master)client.broadcast('state_request',{requester:role}).catch(()=>{});
        }else{
          status('Master collegato alla stanza '+room+'.');
          client.broadcast('state_request',{requester:'master'}).catch(()=>{});
        }
      });
      client.on('state-request',()=>{if(isMaster)sendState();});
      await client.connect();
      if(isMaster){
        currentIndex=0;
        renderMaster({...gameState(),index:0,title:cases[0].title,story:cases[0].story});
        $('startRound').addEventListener('click',startRound);
        $('nextRound').addEventListener('click',nextRound);
        $('hintButton').addEventListener('click',revealHint);
        $('revealSolution').addEventListener('click',revealSolution);
        $('connectTwitch').addEventListener('click',connectTwitch);
        $('manualQuestionForm').addEventListener('submit',e=>{e.preventDefault();addQuestion($('manualAuthor').value,$('manualQuestion').value,'TWITCH MANUALE');$('manualQuestion').value='';});
        $('solutionForm').addEventListener('submit',e=>{e.preventDefault();approveSolution($('solverName').value,$('solverAnswer').value);});
        $('rejectSolution').addEventListener('click',()=>{$('masterStatus').textContent='Soluzione non approvata. Attendi altri tentativi o fornisci un indizio.';$('solverAnswer').value='';});
      }else{
        $('nickname').value=sessionStorage.getItem('tortelloGuestNickname')||params.get('player')||'';
        $('questionForm').addEventListener('submit',e=>{e.preventDefault();const name=$('nickname').value.trim();const question=$('questionInput').value;sessionStorage.setItem('tortelloGuestNickname',name);sendQuestion(name,question,'OSPITE').then(()=>{$('questionInput').value='';}).catch(()=>status('Impossibile inviare la domanda.',true));});
      }
    }catch(error){console.error(error);status(error.message||'Errore di connessione.',true);}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&client&&isMaster)sendState();});
  window.addEventListener('beforeunload',()=>{try{twitchSocket?.close();client?.close();}catch(_){}});
  init();
})();