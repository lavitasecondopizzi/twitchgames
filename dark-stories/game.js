(() => {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || '').toUpperCase();
  const isMaster = !!document.querySelector('.master-page');
  const role = isMaster ? 'master' : (params.get('role') || 'guest');
  const lobbyNickname = (params.get('player') || '').trim().replace(/\s+/g,' ').slice(0,24);
  const guestNickname = (params.get('guest') || '').trim().replace(/\s+/g,' ').slice(0,24);
  const playerNickname = isMaster ? 'Pizzi' : (lobbyNickname || 'Ospite');
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let client, cases = [], currentIndex = 0, roundNumber = 1, twitchSocket = null;
  let state = {started:false,solved:false,solutionRevealed:false,selectedStoryId:null,difficultyVotes:{},difficulty:'facile',revealedHints:[],history:[],queue:[],scores:{},roundPoints:{},solvedBy:[],startedAt:null,lastHintAt:null};
  const HINT_DELAY_MS = 10 * 60 * 1000;
  let hintTimerInterval = null;
  function showLoading(message='CARICAMENTO IN CORSO…'){
    if(!$('loadingOverlay'))return;
    if($('loadingText'))$('loadingText').textContent=message;
    $('loadingOverlay').classList.remove('hidden');
  }
  function hideLoading(){if($('loadingOverlay'))$('loadingOverlay').classList.add('hidden');}
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
      revealedHints:[...(state.revealedHints||[])],startedAt:state.startedAt||null,lastHintAt:state.lastHintAt||null,history:[...(state.history||[])],
      queue:(state.queue||[]).map(q=>({id:q.id,author:q.author,question:q.question,source:q.source,answer:q.answer||null})),
      scores:{...(state.scores||{})},roundPoints:{...(state.roundPoints||{})},solvedBy:[...(state.solvedBy||[])]
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
  function renderStoryList(){
    const list=$('storyList');if(!list)return;
    const level=state.difficulty||'facile';
    const eligible=cases.filter(item=>item.difficulty===level);
    list.innerHTML=eligible.map(item=>'<button type="button" class="story-option '+(item.id===state.selectedStoryId?'selected':'')+'" data-story-id="'+esc(item.id)+'"><strong>'+esc(item.title)+'</strong><span>'+esc(item.story)+'</span></button>').join('')||'<p class="muted">Nessuna storia disponibile per questa difficoltà.</p>';
    list.querySelectorAll('[data-story-id]').forEach(button=>button.addEventListener('click',()=>chooseStory(button.dataset.storyId)));
  }
  function renderPlayer(s){
    $('connection').classList.add('hidden');
    if($('webcamLabelA'))$('webcamLabelA').textContent='PIZZI';
    if($('webcamLabelB'))$('webcamLabelB').textContent=playerNickname.toUpperCase();
    $('waitingView').classList.toggle('hidden',!!s.started);
    $('playerView').classList.toggle('hidden',!s.started);
    document.querySelectorAll('[data-difficulty]').forEach(button=>button.classList.toggle('selected',button.dataset.difficulty===(s.difficulty||'facile')));
    if($('difficultyStatus')&&!s.started)$('difficultyStatus').textContent='Difficoltà attuale: '+(difficultyNames[s.difficulty]||'FACILE')+'. Il Master sta scegliendo una storia.';
    if(!s.started)return;
    $('roundLabel').textContent='MISTERO '+(s.roundNumber||s.index+1)+' · '+(difficultyNames[s.difficulty]||'FACILE');
    $('storyTitle').textContent=s.title||'Mistero in preparazione';
    $('storyText').textContent=s.story||'';
    $('hints').innerHTML=(s.revealedHints||[]).map((hint,i)=>'<div class="hint"><b>INDIZIO '+(i+1)+':</b> '+esc(hint)+'</div>').join('');
    updateHintTimer(s);
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
  function lockHostInteractions(){
    document.querySelectorAll('[data-difficulty],#questionInput,#solutionGuess,#questionForm button,#solutionGuessForm button').forEach(el=>{el.disabled=true;el.setAttribute('aria-disabled','true');});
    const nickname=$('nickname');if(nickname){nickname.value='Pizzi';nickname.readOnly=true;}
    const waiting=$('waitingView');if(waiting)waiting.querySelector('h2').textContent='IN ATTESA DEL MISTERO';
    const help=document.querySelector('#waitingView > p');if(help)help.textContent='La partita è visualizzata in sola lettura.';
    const questionForm=$('questionForm');if(questionForm)questionForm.addEventListener('submit',e=>e.preventDefault());
    const solutionForm=$('solutionGuessForm');if(solutionForm)solutionForm.addEventListener('submit',e=>e.preventDefault());
  }
  function renderMaster(s){
    $('connection').classList.add('hidden');$('masterView').classList.remove('hidden');
    if($('webcamLabelA'))$('webcamLabelA').textContent='PIZZI';
    if($('webcamLabelB'))$('webcamLabelB').textContent=(guestNickname||'CHAT / OSPITE').toUpperCase();
    const mystery=currentCase();
    $('masterRound').textContent='MISTERO '+(s.roundNumber||1)+' / '+cases.length;
    $('masterTitle').textContent=s.title||mystery?.title||'Scegli una storia';
    $('masterStory').textContent=s.story||mystery?.story||'Scegli una storia dall’elenco della difficoltà selezionata.';
    $('masterSolution').textContent=mystery?.solution||'La soluzione comparirà quando selezioni una storia.';
    $('difficultySummary').textContent='Difficoltà scelta: '+(difficultyNames[s.difficulty]||'FACILE')+'. Elenco filtrato automaticamente.';
    renderStoryList();
    $('startRound').disabled=!!s.started||!s.selectedStoryId;
    
    $('nextRound').disabled=!s.started||(!(s.solvedBy||[]).length&&!s.solutionRevealed)||roundNumber>=cases.length;
    const hintRemaining = hintTimeRemaining(s);
    $('hintButton').disabled=!s.started||!!s.solutionRevealed||(s.revealedHints||[]).length>=(mystery?.hints.length||0)||hintRemaining>0;
    updateHintTimer(s);
    $('revealSolution').disabled=!s.started||(!(s.solvedBy||[]).length&&!s.solutionRevealed);
    $('masterLeaderboard').innerHTML=scoreMarkup(s.scores);
    $('questionQueue').innerHTML=(s.queue||[]).map((q,index)=>{
      const answered=q.answer?'<div class="notice">Risposta: '+esc(q.answer)+'</div>':'<div class="answer-controls"><button class="btn secondary" data-answer="SÌ" data-id="'+esc(q.id)+'">SÌ</button><button class="btn secondary" data-answer="NO" data-id="'+esc(q.id)+'">NO</button><button class="btn secondary" data-answer="IRRILEVANTE" data-id="'+esc(q.id)+'">IRRILEVANTE</button></div>';
      return '<article class="question"><div class="meta">'+esc(q.source)+' · '+esc(q.author)+' · '+(index+1)+'</div><p>'+esc(q.question)+'</p><div class="queue-controls"><button class="btn secondary" data-move="up" data-id="'+esc(q.id)+'" '+(index===0?'disabled':'')+'>↑</button><button class="btn secondary" data-move="down" data-id="'+esc(q.id)+'" '+(index===s.queue.length-1?'disabled':'')+'>↓</button></div>'+answered+'</article>';
    }).join('')||'<p class="muted">Nessuna domanda in coda.</p>';
    $('questionQueue').querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>answerQuestion(btn.dataset.id,btn.dataset.answer)));
    $('questionQueue').querySelectorAll('[data-move]').forEach(btn=>btn.addEventListener('click',()=>moveQuestion(btn.dataset.id,btn.dataset.move)));
    $('masterHints').innerHTML=(s.revealedHints||[]).map((hint,i)=>'<div class="hint"><b>INDIZIO '+(i+1)+':</b> '+esc(hint)+'</div>').join('')||'Nessun indizio rivelato.';
    $('masterStatus').textContent=(s.solvedBy||[]).length?'Soluzioni approvate: '+s.solvedBy.join(', ')+'. Puoi approvare altri giocatori prima di rivelare la soluzione.':'Domande e tentativi in arrivo dalla chat e dall’ospite.';
  }
  function render(s){
    if(!s)return;
    currentIndex=Number.isInteger(s.index)?s.index:currentIndex;
    roundNumber=Number.isInteger(s.roundNumber)?s.roundNumber:roundNumber;
    state={...state,...s,difficultyVotes:s.difficultyVotes||state.difficultyVotes||{},queue:s.queue||[],scores:s.scores||{},roundPoints:s.roundPoints||state.roundPoints||{},history:s.history||[],revealedHints:s.revealedHints||[],solvedBy:s.solvedBy||[]};
    renderPlayer(s);
    if(isMaster)lockHostInteractions();
    hideLoading();
  }
  async function selectDifficulty(difficulty){
    if(!['facile','medio','difficile'].includes(difficulty)||state.started)return;
    showLoading('INVIO DELLA SCELTA…');
    document.querySelectorAll('[data-difficulty]').forEach(button=>button.disabled=true);
    try{
      await client.broadcast('game_event',{type:'difficulty_select',difficulty});
      if($('difficultyStatus'))$('difficultyStatus').textContent='Difficoltà selezionata: '+difficultyNames[difficulty]+'. Il Master sta scegliendo una storia.';
    }catch(error){
      hideLoading();
      document.querySelectorAll('[data-difficulty]').forEach(button=>button.disabled=false);
      throw error;
    }
  }
  async function recordDifficultyVote(author,difficulty,source){
    if(state.started)return;
    const name=String(author||'Anonimo').slice(0,24);
    state.difficultyVotes[name.toLowerCase()]={author:name,difficulty,source};
    state.difficulty=winningDifficulty(state.difficultyVotes);
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
  function moveQuestion(id,direction){
    const index=state.queue.findIndex(item=>item.id===id);if(index<0)return;
    const target=index+(direction==='up'?-1:1);if(target<0||target>=state.queue.length)return;
    [state.queue[index],state.queue[target]]=[state.queue[target],state.queue[index]];
    publish();
  }
  function hintTimeRemaining(s=state){
    if(!s.started||s.solutionRevealed)return 0;
    const hints=(s.revealedHints||[]).length;
    if(hints>=3)return 0;
    const anchor=hints>0?s.lastHintAt:s.startedAt;
    // Se una vecchia sessione non contiene timestamp, sblocca invece di bloccare il timer all'infinito.
    if(!Number.isFinite(anchor)||anchor<=0)return 0;
    return Math.max(0,HINT_DELAY_MS-(Date.now()-anchor));
  }
  function updateHintTimer(s=state){
    const el=$('hintTimer');if(!el)return;
    if(!s.started||s.solutionRevealed){el.classList.add('hidden');return;}
    el.classList.remove('hidden');
    const remaining=hintTimeRemaining(s);
    const minutes=Math.floor(remaining/60000);const seconds=Math.floor((remaining%60000)/1000);
    const hints=(s.revealedHints||[]).length;
    const label=hints>=3?'TUTTI GLI INDIZI RIVELATI':remaining>0?'PROSSIMO INDIZIO TRA '+String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0'):'INDIZIO DISPONIBILE AL MASTER';
    el.querySelector('.hint-timer-label').textContent=label;
    const progress=hints>=3?100:Math.max(0,Math.min(100,100*(1-remaining/HINT_DELAY_MS)));
    el.querySelector('.hint-timer-fill').style.width=progress+'%';
    el.classList.toggle('ready',remaining===0&&hints<3);
    if(isMaster&&$('hintButton'))$('hintButton').disabled=!s.started||!!s.solutionRevealed||hints>=(currentCase()?.hints.length||0)||remaining>0;
  }
  async function answerQuestion(id,answer){
    const q=state.queue.find(item=>item.id===id);if(!q||q.answer)return;
    q.answer=answer;state.history.push({author:q.author,question:q.question,answer,source:q.source});
    await publish();
  }
  async function chooseStory(storyId){
    if(state.started)return;
    const selected=cases.find(item=>item.id===storyId && item.difficulty===state.difficulty);
    if(!selected)return;
    showLoading('CARICAMENTO DELLA STORIA…');
    state.selectedStoryId=selected.id;
    currentIndex=cases.indexOf(selected);
    await publish();
  }
  async function startRound(){
    const mystery=currentCase();if(!mystery){$('masterStatus').textContent='Seleziona prima una storia.';return;}
    showLoading('AVVIO DEL MISTERO…');
    state.difficulty=mystery.difficulty;state.started=true;state.solved=false;state.solutionRevealed=false;
    state.revealedHints=[];state.history=[];state.queue=[];state.solvedBy=[];state.roundPoints={};state.startedAt=Date.now();state.lastHintAt=null;
    await publish();
  }
  async function revealHint(){
    const list=currentCase()?.hints||[];
    if(state.revealedHints.length<list.length&&hintTimeRemaining(state)===0){state.revealedHints.push(list[state.revealedHints.length]);state.lastHintAt=Date.now();await publish();}
    else updateHintTimer(state);
  }
  function prepareAnswerParts(){
    const raw=$('solverAnswer').value.trim();
    if(!raw){$('masterStatus').textContent='Inserisci prima la risposta da valutare.';return;}
    const parts=raw.split(/\n+|(?<=[.!?;:,])\s+/u).map(part=>part.trim()).filter(Boolean);
    const unique=[...new Set(parts)];
    $('hypothesisParts').innerHTML=unique.map((part,index)=>'<label class="hypothesis-part"><input type="checkbox" data-part-index="'+index+'"><span><b>PARTE '+(index+1)+'</b> '+esc(part)+'</span></label>').join('');
    $('hypothesisParts').dataset.parts=JSON.stringify(unique);
    $('masterStatus').textContent='Seleziona ogni affermazione corretta. Puoi modificare il testo sopra e analizzarlo di nuovo.';
  }
  async function approveSolution(name,answer){
    const clean=String(name||'').trim().slice(0,24);if(!clean)return;
    const parts=JSON.parse($('hypothesisParts').dataset.parts||'[]');
    if(!parts.length){$('masterStatus').textContent='Clicca prima su PREPARA PARTI DA VALUTARE.';return;}
    const accepted=[...$('hypothesisParts').querySelectorAll('[data-part-index]:checked')].map(input=>parts[Number(input.dataset.partIndex)]).filter(Boolean);
    if(!accepted.length){$('masterStatus').textContent='Seleziona almeno una parte corretta prima di confermare.';return;}
    const key=clean.toLowerCase();
    if(state.solvedBy.some(n=>n.toLowerCase()===key)){$('masterStatus').textContent='Questo giocatore ha già completato il mistero.';return;}
    const allCorrect=accepted.length===parts.length;
    const current=Number(state.roundPoints[key]||0);
    const target=allCorrect?3:Math.min(2,Math.ceil(3*accepted.length/parts.length));
    const earned=Math.max(0,Math.min(3-current,target-current));
    state.roundPoints[key]=current+earned;
    if(earned>0)state.scores[clean]=(state.scores[clean]||0)+earned;
    if(allCorrect)state.solvedBy.push(clean);
    state.history.push({author:clean,question:'RISPOSTA: '+answer,answer:(allCorrect?'SOLUZIONE COMPLETA':'PARTI CORRETTE: '+accepted.join(' / '))+' · +'+earned+' PUNTI',source:'MASTER'});
    $('solverName').value='';$('solverAnswer').value='';$('hypothesisParts').innerHTML='';$('hypothesisParts').dataset.parts='[]';
    await publish();
    $('masterStatus').textContent=allCorrect?clean+' ha completato il mistero: +'+earned+' punti.':clean+': accettate '+accepted.length+'/'+parts.length+' parti, +'+earned+' punti. Può ancora proporre altre parti.';
  }
  async function revealSolution(){
    state.solutionRevealed=true;
    const snapshot=gameState();
    await client.broadcast('game_state',snapshot);
    renderMaster(snapshot);
  }
  async function nextRound(){
    if(roundNumber>=cases.length){$('masterStatus').textContent='Hai raggiunto il limite di storie nel catalogo.';return;}
    roundNumber++;state.started=false;state.solved=false;state.solutionRevealed=false;state.startedAt=null;state.lastHintAt=null;
    state.selectedStoryId=null;state.revealedHints=[];state.history=[];state.queue=[];state.solvedBy=[];state.roundPoints={};
    state.difficulty=winningDifficulty();
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
  function setupRules(){
    const overlay=$('rulesOverlay');
    if(!overlay)return;
    const open=()=>{overlay.classList.remove('hidden');$('closeRules')?.focus();};
    const close=()=>{overlay.classList.add('hidden');$('openRules')?.focus();};
    $('openRules')?.addEventListener('click',open);
    $('closeRules')?.addEventListener('click',close);
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.classList.contains('hidden'))close();});
  }
  async function init(){
    if(!/^[A-Z0-9]{6}$/.test(room)){status('Codice stanza mancante o non valido. Torna alla lobby e riapri il gioco.',true);return;}
    try{
      cases=await fetch('cases.json').then(r=>{if(!r.ok)throw new Error('Impossibile caricare i misteri.');return r.json();});
      client=new TortelloSupabaseRoom({room,role:isMaster?'master':role,nickname:isMaster?'Master':playerNickname,game:'dark-stories'});
      client.on('connected',()=>status('Connesso alla stanza '+room+'.'));
      client.on('game-state',payload=>{if(payload)render(payload);});
      client.on('game-event',payload=>{
        if(!isMaster)return;
        if(payload?.type==='difficulty_select'&&!state.started&&['facile','medio','difficile'].includes(payload.difficulty)){state.difficulty=payload.difficulty;state.selectedStoryId=null;currentIndex=0;publish();}
        if(payload?.type==='difficulty_vote')recordDifficultyVote(payload.author,payload.difficulty,payload.source||'OSPITE');
        if(payload?.type==='question')addQuestion(payload.author,payload.question,payload.source||'OSPITE');
        if(payload?.type==='solution'&&!state.solutionRevealed){state.pendingSolutions=state.pendingSolutions||[];state.pendingSolutions.push({author:payload.author||'Anonimo',answer:payload.answer||''});}
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
      if(hintTimerInterval)clearInterval(hintTimerInterval);
      hintTimerInterval=setInterval(()=>updateHintTimer(state),1000);
      if(isMaster){
        state.difficulty='facile';
        renderPlayer(gameState());
        lockHostInteractions();
        hideLoading();
      }else{
        const saved=playerNickname;
        $('nickname').value=saved;
        $('nickname').readOnly=true;
        $('nickname').title='Nickname preso dalla lobby';
        document.querySelectorAll('[data-difficulty]').forEach(button=>button.addEventListener('click',()=>selectDifficulty(button.dataset.difficulty).catch(()=>status('Impossibile selezionare la difficoltà.',true))));
        $('questionForm').addEventListener('submit',e=>{e.preventDefault();const name=playerNickname;sendQuestion(name,$('questionInput').value,'OSPITE').then(()=>$('questionInput').value='').catch(()=>status('Impossibile inviare la domanda.',true));});
        $('solutionGuessForm').addEventListener('submit',e=>{e.preventDefault();const name=playerNickname;sendSolution(name,$('solutionGuess').value,'OSPITE').then(()=>$('solutionGuess').value='').catch(()=>status('Impossibile inviare il tentativo.',true));});
      }
    }catch(error){console.error(error);hideLoading();status(error.message||'Errore di connessione.',true);}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&client&&isMaster)client.broadcast('game_state',gameState()).catch(()=>{});});
  window.addEventListener('beforeunload',()=>{try{twitchSocket?.close();client?.close();}catch(_){}});
  setupRules();
  init();
})();