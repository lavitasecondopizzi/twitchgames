(() => {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || '').toUpperCase();
  const isMaster = !!document.querySelector('.master-page');
  const role = isMaster ? 'master' : (params.get('role') || 'guest');
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let client, cases = [], currentIndex = 0, roundNumber = 1, twitchSocket = null;
  let state = {started:false,solved:false,solutionRevealed:false,selectedStoryId:null,difficultyVotes:{},difficulty:'facile',revealedHints:[],history:[],queue:[],scores:{},solvedBy:[]};
  const status = (message,error=false) => { if($('connectionStatus')){$('connectionStatus').textContent=message;$('connectionStatus').style.color=error?'#b71919':'';} };
  const currentCase = () => cases.find(item=>item.id===state.selectedStoryId) || null;
  const difficultyNames = {facile:'FACILE',medio:'MEDIO',difficile:'DIFFICILE'};
  function voteTotals(votes=state.difficultyVotes){
    const totals={facile:0,medio:0,difficile:0};
    Object.values(votes||{}).forEach(v=>{if(totals[v.difficulty]!==undefined)totals[v.difficulty]++;});
    return totals;
  }
  function winningDifficulty(votes=state.difficultyVotes){
    const totals=voteTotals(votes); let best=state.difficulty||'facile';
    for(const level of ['facile','medio','difficile'])if(totals[level]>totals[best])best=level;
    return best;
  }
  const gameState = () => {
    const mystery=currentCase();
    const snapshot={
      started:state.started,solved:state.solved,solutionRevealed:!!state.solutionRevealed,
      index:currentIndex,roundNumber,selectedStoryId:state.selectedStoryId,
      difficulty:state.difficulty||'facile',difficultyVotes:{...(state.difficultyVotes||{})},
      title:mystery?.title||'',story:mystery?.story||'',
      revealedHints:[...(state.revealedHints||[])],history:[...(state.history||[])],
      queue:(state.queue||[]).map(q=>({id:q.id,author:q.author,question:q.question,source:q.source,answer:q.answer||null})),
      scores:{...(state.scores||{})},solvedBy:[...(state.solvedBy||[])]
    };
    if(state.solutionRevealed&&mystery)snapshot.solution=mystery.solution;
    return snapshot;
  };
  async function publish(){
    if(!client)return;
    const snapshot=gameState();
    await client.broadcast('game_state',snapshot);
    render(snapshot);
  }
  function scoreMarkup(scores){
    return Object.entries(scores||{}).sort((a,b)=>b[1]-a[1]).map(([name,points],i)=>'<div class="entry"><strong>'+(i+1)+'. '+esc(name)+'</strong>'+points+' punti</div>').join('')||'<p class="muted">Nessun punto assegnato.</p>';
  }
  function renderDifficultyOptions(){
    if(!$('storyChoice')||!$('masterDifficulty'))return;
    const level=$('masterDifficulty').value||state.difficulty||'facile';
    const eligible=cases.filter(item=>item.difficulty===level);
    const oldValue=$('storyChoice').value;
    $('storyChoice').innerHTML=eligible.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.title)+'</option>').join('');
    if(eligible.some(item=>item.id===oldValue))$('storyChoice').value=oldValue;
    else if(eligible.some(item=>item.id===state.selectedStoryId))$('storyChoice').value=state.selectedStoryId;
  }
  function renderPlayer(s){
    $('connection').classList.add('hidden');
    $('waitingView').classList.toggle('hidden',!!s.started);
    $('playerView').classList.toggle('hidden',!s.started);
    const totals=voteTotals(s.difficultyVotes||{});
    if($('difficultyStatus'))$('difficultyStatus').textContent='Voti ricevuti — Facile: '+totals.facile+' · Medio: '+totals.medio+' · Difficile: '+totals.difficile+'. La scelta finale della storia spetta al Master.';
    if(!s.started)return;
    $('roundLabel').textContent='MISTERO '+(s.roundNumber||s.index+1)+' · '+(difficultyNames[s.difficulty]||'FACILE');
    $('storyTitle').textContent=s.title||'Mistero in preparazione';
    $('storyText').textContent=s.story||'';
    $('hints').innerHTML=(s.revealedHints||[]).map((hint,i)=>'<div class="hint"><b>INDIZIO '+(i+1)+':</b> '+esc(hint)+'</div>').join('');
    $('answerHistory').innerHTML=(s.history||[]).slice().reverse().map(item=>'<div class="entry"><strong>'+esc(item.author)+' · '+esc(item.answer)+'</strong>'+esc(item.question)+'</div>').join('')||'<p class="muted">Ancora nessuna risposta.</p>';
    $('leaderboard').innerHTML=scoreMarkup(s.scores);
    $('solvedNotice').classList.toggle('hidden',!(s.solvedBy||[]).length);
    if((s.solvedBy||[]).length)$('solvedNotice').textContent='Soluzioni approvate: '+s.solvedBy.join(', ')+'. Ogni giocatore può ottenere punti una volta per mistero.';
    $('questionInput').disabled=!!s.solutionRevealed;
    $('questionForm').querySelector('button').disabled=!!s.solutionRevealed;
    $('solutionGuess').disabled=!!s.solutionRevealed;
    $('solutionGuessForm').querySelector('button').disabled=!!s.solutionRevealed;
    if(s.solutionRevealed&&s.solution)$('storyText').textContent=s.story+'\n\nSOLUZIONE: '+s.solution;
  }
  function renderMaster(s){
    $('connection').classList.add('hidden');$('masterView').classList.remove('hidden');
    const mystery=currentCase();
    $('masterRound').textContent='MISTERO '+(s.roundNumber||1)+' / '+cases.length;
    $('masterTitle').textContent=s.title||mystery?.title||'Scegli una storia';
    $('masterStory').textContent=s.story||mystery?.story||'Seleziona una difficoltà e una storia, poi avvia il mistero.';
    $('masterSolution').textContent=mystery?.solution||'La soluzione comparirà quando selezioni una storia.';
    const totals=voteTotals(s.difficultyVotes||{});
    $('difficultySummary').textContent='Facile: '+totals.facile+' · Medio: '+totals.medio+' · Difficile: '+totals.difficile+' voti. Difficoltà suggerita: '+(difficultyNames[winningDifficulty(s.difficultyVotes)]||'FACILE')+'.';
    if(!$('masterDifficulty').dataset.touched)$('masterDifficulty').value=s.difficulty||winningDifficulty(s.difficultyVotes);
    renderDifficultyOptions();
    $('startRound').disabled=!!s.started||!s.selectedStoryId;
    $('chooseStory').disabled=!!s.started;
    $('nextRound').disabled=!s.started||(!(s.solvedBy||[]).length&&!s.solutionRevealed)||roundNumber>=cases.length;
    $('hintButton').disabled=!s.started||!!s.solutionRevealed||(s.revealedHints||[]).length>=(mystery?.hints.length||0);
    $('revealSolution').disabled=!s.started||(!(s.solvedBy||[]).length&&!s.solutionRevealed);
    $('masterLeaderboard').innerHTML=scoreMarkup(s.scores);
    $('questionQueue').innerHTML=(s.queue||[]).map(q=>{
      const answered=q.answer?'<div class="notice">Risposta: '+esc(q.answer)+'</div>':'<div class="answer-controls"><button class="btn secondary" data-answer="SÌ" data-id="'+esc(q.id)+'">SÌ</button><button class="btn secondary" data-answer="NO" data-id="'+esc(q.id)+'">NO</button><button class="btn secondary" data-answer="IRRILEVANTE" data-id="'+esc(q.id)+'">IRRILEVANTE</button></div>';
      return '<article class="question"><div class="meta">'+esc(q.source)+' · '+esc(q.author)+'</div><p>'+esc(q.question)+'</p>'+answered+'</article>';
    }).join('')||'<p class="muted">Nessuna domanda in coda.</p>';
    $('questionQueue').querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>answerQuestion(btn.dataset.id,btn.dataset.answer)));
    $('masterHints').innerHTML=(s.revealedHints||[]).map((hint,i)=>'<div class="hint"><b>INDIZIO '+(i+1)+':</b> '+esc(hint)+'</div>').join('')||'Nessun indizio rivelato.';
    $('masterStatus').textContent=(s.solvedBy||[]).length?'Soluzioni approvate: '+s.solvedBy.join(', ')+'. Puoi approvare altri giocatori prima di rivelare la soluzione.':'Domande e tentativi in arrivo dalla chat e dall’ospite.';
  }
  function render(s){
    if(!s)return;
    currentIndex=Number.isInteger(s.index)?s.index:currentIndex;
    roundNumber=Number.isInteger(s.roundNumber)?s.roundNumber:roundNumber;
    state={...state,...s,difficultyVotes:s.difficultyVotes||state.difficultyVotes||{},queue:s.queue||[],scores:s.scores||{},history:s.history||[],revealedHints:s.revealedHints||[],solvedBy:s.solvedBy||[]};
    if(isMaster)renderMaster({...gameState(),...s});else renderPlayer(s);
  }
  async function submitDifficulty(author,difficulty,source='OSPITE'){
    if(!['facile','medio','difficile'].includes(difficulty))return;
    if(isMaster){recordDifficultyVote(author,difficulty,source);return;}
    await client.broadcast('game_event',{type:'difficulty_vote',author:String(author||'Anonimo').slice(0,24),difficulty,source});
    if($('difficultyStatus'))$('difficultyStatus').textContent='Hai votato: '+difficultyNames[difficulty]+'. Puoi cambiare voto prima dell’avvio.';
  }
  async function recordDifficultyVote(author,difficulty,source){
    if(state.started)return;
    const name=String(author||'Anonimo').slice(0,24);
    state.difficultyVotes[name.toLowerCase()]={author:name,difficulty,source};
    state.difficulty=winningDifficulty(state.difficultyVotes);
    if($('masterDifficulty')&&!$('masterDifficulty').dataset.touched)$('masterDifficulty').value=state.difficulty;
    await publish();
  }
  async function sendSolution(author,answer,source='OSPITE'){
    const clean=String(answer||'').replace(/\s+/g,' ').trim();if(!clean||clean.length>500)return;
    if(isMaster){$('solverName').value=author;$('solverAnswer').value=clean;$('masterStatus').textContent='Tentativo ricevuto da '+author+'. Verificalo prima di assegnare punti.';return;}
    await client.broadcast('game_event',{type:'solution',author:String(author||'Anonimo').slice(0,24),answer:clean,source});
  }
  async function sendQuestion(author,question,source='OSPITE'){
    const clean=String(question||'').replace(/\s+/g,' ').trim();if(!clean||clean.length>300)return;
    if(isMaster){addQuestion(author,clean,source);return;}
    await client.broadcast('game_event',{type:'question',author:String(author||'Anonimo').slice(0,24),question:clean,source});
  }
  function addQuestion(author,question,source){
    if(state.solutionRevealed)return;
    if(state.queue.some(q=>q.question.toLowerCase()===question.toLowerCase()&&q.author.toLowerCase()===author.toLowerCase()))return;
    state.queue.push({id:crypto.randomUUID(),author:String(author||'Anonimo').slice(0,24),question,source,answer:null});
    publish();
  }
  async function answerQuestion(id,answer){
    const q=state.queue.find(item=>item.id===id);if(!q||q.answer)return;
    q.answer=answer;state.history.push({author:q.author,question:q.question,answer,source:q.source});
    await publish();
  }
  async function chooseStory(){
    if(state.started)return;
    const selected=cases.find(item=>item.id===$('storyChoice').value);
    if(!selected)return;
    state.selectedStoryId=selected.id;state.difficulty=selected.difficulty;
    currentIndex=cases.indexOf(selected);
    await publish();
  }
  async function startRound(){
    const mystery=currentCase();if(!mystery){$('masterStatus').textContent='Seleziona prima una storia.';return;}
    state.difficulty=mystery.difficulty;state.started=true;state.solved=false;state.solutionRevealed=false;
    state.revealedHints=[];state.history=[];state.queue=[];state.solvedBy=[];
    await publish();
  }
  async function revealHint(){
    const list=currentCase()?.hints||[];
    if(state.revealedHints.length<list.length)state.revealedHints.push(list[state.revealedHints.length]);
    await publish();
  }
  async function approveSolution(name,answer){
    const clean=String(name||'').trim().slice(0,24);if(!clean)return;
    const key=clean.toLowerCase();
    if(state.solvedBy.some(n=>n.toLowerCase()===key)){$('masterStatus').textContent='Questo giocatore ha già ricevuto punti per il mistero.';return;}
    state.solvedBy.push(clean);state.scores[clean]=(state.scores[clean]||0)+3;
    state.history.push({author:clean,question:'SOLUZIONE: '+answer,answer:'APPROVATA +3 PUNTI',source:'MASTER'});
    $('solverName').value='';$('solverAnswer').value='';
    await publish();$('masterStatus').textContent=clean+' ha risolto il mistero: +3 punti.';
  }
  async function revealSolution(){
    state.solutionRevealed=true;
    const snapshot=gameState();
    await client.broadcast('game_state',snapshot);
    renderMaster(snapshot);
  }
  async function nextRound(){
    if(roundNumber>=cases.length){$('masterStatus').textContent='Hai raggiunto il limite di storie nel catalogo.';return;}
    roundNumber++;state.started=false;state.solved=false;state.solutionRevealed=false;
    state.selectedStoryId=null;state.revealedHints=[];state.history=[];state.queue=[];state.solvedBy=[];
    state.difficulty=winningDifficulty();
    $('masterDifficulty').dataset.touched='';
    await publish();
  }
  function connectTwitch(){
    const channel=$('twitchChannel').value.trim().replace(/^#/,'').replace(/^@/,'').toLowerCase();
    if(!/^[a-z0-9_]{1,25}$/.test(channel)){$('twitchStatus').textContent='Inserisci un nome canale Twitch valido.';return;}
    if(twitchSocket)twitchSocket.close();
    const ws=new WebSocket('wss://irc-ws.chat.twitch.tv:443');twitchSocket=ws;
    $('twitchStatus').textContent='Connessione a #'+channel+'…';
    ws.onopen=()=>{ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');ws.send('PASS SCHMOOPIIE');ws.send('NICK justinfan'+Math.floor(Math.random()*90000+10000));ws.send('JOIN #'+channel);};
    ws.onmessage=event=>{
      for(const line of String(event.data).split('\r\n')){
        if(line.startsWith('PING ')){ws.send('PONG '+line.slice(5));continue;}
        const match=line.match(/^(?:@([^ ]+) )?:([^! ]+)!.* PRIVMSG #[^ ]+ :(.*)$/);if(!match)continue;
        const tags=Object.fromEntries((match[1]||'').split(';').map(t=>{const i=t.indexOf('=');return i<0?[t,'']:[t.slice(0,i),t.slice(i+1)];}));
        const author=tags['display-name']||match[2],message=match[3].trim();
        const diff=message.match(/^!difficolt[aà]\s+(facile|medio|difficile)$/i);
        if(diff){recordDifficultyVote(author,diff[1].toLowerCase(),'TWITCH');continue;}
        const q=message.match(/^!(?:ds|domanda)\s+(.{3,300})$/i);if(q)addQuestion(author,q[1],'TWITCH');
        const solution=message.match(/^!soluzione\s+(.{3,500})$/i);
        if(solution&&!state.solutionRevealed){$('solverName').value=author;$('solverAnswer').value=solution[1];$('masterStatus').textContent='Tentativo in chat da '+author+'. Verificalo prima di assegnare punti.';}
      }
    };
    ws.onclose=()=>{if($('twitchStatus'))$('twitchStatus').textContent='Chat Twitch disconnessa.';};
    ws.onerror=()=>{if($('twitchStatus'))$('twitchStatus').textContent='Errore di connessione alla chat Twitch.';};
    $('twitchStatus').textContent='Connessione a #'+channel+' richiesta. Comandi: !difficolta facile|medio|difficile, !ds domanda, !soluzione tentativo.';
  }
  async function init(){
    if(!/^[A-Z0-9]{6}$/.test(room)){status('Codice stanza mancante o non valido. Torna alla lobby e riapri il gioco.',true);return;}
    try{
      cases=await fetch('cases.json').then(r=>{if(!r.ok)throw new Error('Impossibile caricare i misteri.');return r.json();});
      client=new TortelloSupabaseRoom({room,role:isMaster?'master':role,nickname:isMaster?'Master':(params.get('player')||'Ospite'),game:'dark-stories'});
      client.on('connected',()=>status('Connesso alla stanza '+room+'.'));
      client.on('game-state',payload=>{if(payload)render(payload);});
      client.on('game-event',payload=>{
        if(!isMaster)return;
        if(payload?.type==='difficulty_vote')recordDifficultyVote(payload.author,payload.difficulty,payload.source||'OSPITE');
        if(payload?.type==='question')addQuestion(payload.author,payload.question,payload.source||'OSPITE');
        if(payload?.type==='solution'&&!state.solutionRevealed){$('solverName').value=payload.author||'Anonimo';$('solverAnswer').value=payload.answer||'';$('masterStatus').textContent='Tentativo ricevuto da '+(payload.author||'Anonimo')+'. Verificalo prima di assegnare punti.';}
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
      client.on('state-request',()=>{if(isMaster)client.broadcast('game_state',gameState()).catch(()=>{});});
      await client.connect();
      if(isMaster){
        $('masterDifficulty').addEventListener('change',()=>{$('masterDifficulty').dataset.touched='1';renderDifficultyOptions();});
        $('chooseStory').addEventListener('click',chooseStory);
        $('startRound').addEventListener('click',startRound);
        $('nextRound').addEventListener('click',nextRound);
        $('hintButton').addEventListener('click',revealHint);
        $('revealSolution').addEventListener('click',revealSolution);
        $('connectTwitch').addEventListener('click',connectTwitch);
        $('manualQuestionForm').addEventListener('submit',e=>{e.preventDefault();addQuestion($('manualAuthor').value,$('manualQuestion').value,'TWITCH MANUALE');$('manualQuestion').value='';});
        $('solutionForm').addEventListener('submit',e=>{e.preventDefault();approveSolution($('solverName').value,$('solverAnswer').value);});
        $('rejectSolution').addEventListener('click',()=>{$('masterStatus').textContent='Tentativo non approvato. Attendi altri tentativi o fornisci un indizio.';$('solverAnswer').value='';});
        state.difficulty='facile';renderMaster({...gameState(),roundNumber:1});
      }else{
        const saved=sessionStorage.getItem('tortelloGuestNickname')||params.get('player')||'';
        $('nickname').value=saved;$('difficultyNickname').value=saved;
        $('difficultyForm').addEventListener('submit',e=>{e.preventDefault();const name=$('difficultyNickname').value.trim();sessionStorage.setItem('tortelloGuestNickname',name);submitDifficulty(name,$('difficultyChoice').value).catch(()=>status('Impossibile inviare il voto.',true));});
        $('questionForm').addEventListener('submit',e=>{e.preventDefault();const name=$('nickname').value.trim();sendQuestion(name,$('questionInput').value,'OSPITE').then(()=>$('questionInput').value='').catch(()=>status('Impossibile inviare la domanda.',true));});
        $('solutionGuessForm').addEventListener('submit',e=>{e.preventDefault();const name=$('nickname').value.trim();sendSolution(name,$('solutionGuess').value,'OSPITE').then(()=>$('solutionGuess').value='').catch(()=>status('Impossibile inviare il tentativo.',true));});
      }
    }catch(error){console.error(error);status(error.message||'Errore di connessione.',true);}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&client&&isMaster)client.broadcast('game_state',gameState()).catch(()=>{});});
  window.addEventListener('beforeunload',()=>{try{twitchSocket?.close();client?.close();}catch(_){}});
  init();
})();