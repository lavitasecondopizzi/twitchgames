import { useEffect, useMemo, useState } from "react";
import { useGameSocket } from "./hooks/useGameSocket";
import "./styles.css";

function autoLabelFromFilename(file) {
    return file
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function aggregateVotes(entries = []) {
    const byName = {};
    for (const e of entries) {
        const name = String(e?.name || "").trim();
        if (!name) continue;
        const k = name.toLowerCase();
        if (!byName[k]) byName[k] = { name, rosso: 0, verde: 0 };
        if (e.cmd === "rosso") byName[k].rosso += 1;
        if (e.cmd === "verde") byName[k].verde += 1;
    }
    return Object.values(byName).sort((a, b) => a.name.localeCompare(b.name, "it"));
}

function nextMode(current, kind) {
    if (kind === "left") return current === "red" ? "" : "red";
    if (kind === "right") return current === "green" ? "" : "green";
    return "";
}

function Board({ board, title, images, cells, editable, showReset = false, onCellSet, onReset }) {
    const handleCell = (e, idx) => {
        if (!editable) return;
        const current = cells[idx] || "";
        
        if (e.type === "click") {
            if (e.altKey) onCellSet(idx, "");
            else onCellSet(idx, nextMode(current, "left"));
        } else if (e.type === "contextmenu") {
            e.preventDefault();
            onCellSet(idx, nextMode(current, "right"));
        } else if (e.type === "dblclick") {
            onCellSet(idx, "");
        }
    };
    
    return (
        <section className={`board ${editable ? "" : "disabled"}`} data-board={board}>
            <div className="board-head">
                <div className="board-title">{title}</div>
                <div className="board-actions">
                    {showReset ? (
                        <button className="btn" onClick={onReset} disabled={!editable}>Reset</button>
                    ) : null}
                </div>
            </div>
            
            <div className="grid">
                {images.map((img, idx) => (
                    <div
                        key={`${board}-${idx}-${img.file}`}
                        className={`cell ${(cells[idx] || "")}`}
                        onClick={(e) => handleCell(e, idx)}
                        onContextMenu={(e) => handleCell(e, idx)}
                        onDoubleClick={(e) => handleCell(e, idx)}
                        title={img.name}
                    >
                        <img src={img.src} alt={img.name} />
                        <div className="overlay" />
                        <div className="banner">{img.name}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function App() {
    const { clientId, connected, state, labels, lastSfx, scoreFx, error, send } = useGameSocket();
    
    const [images, setImages] = useState([]);
    const [tab, setTab] = useState(0);
    const [roundSelect, setRoundSelect] = useState("");
    const [scoreFxView, setScoreFxView] = useState(null);
    
    const qs = useMemo(() => new URLSearchParams(window.location.search), []);
    const forcedRole = qs.get("role"); // A/B
    const forcedName = qs.get("player") || qs.get("name") || "";
    const forcedFolder = qs.get("folder") || "";
    const forcedPlayerA = qs.get("playerA") || "";
    const forcedPlayerB = qs.get("playerB") || "";
    
    const myRole = useMemo(() => {
        if (!state) return null;
        if (forcedRole === "A" || forcedRole === "B") return forcedRole;
        if (state.playerA === clientId) return "A";
        if (state.playerB === clientId) return "B";
        return null;
    }, [state, clientId, forcedRole]);
    
    useEffect(() => {
        if (!labels) return;
        const folder = forcedFolder || labels?.imageFolder;
        
        fetch(`/api/images?folder=${encodeURIComponent(folder)}`)
            .then((r) => r.json())
            .then((files) => {
                const list = (Array.isArray(files) ? files : []).map((file) => ({
                    file,
                    src: `/assets/img/${folder}/${file}`,
                    name: labels.imageLabels?.[file] || autoLabelFromFilename(file)
                }));
                setImages(list);
                setRoundSelect((prev) => prev || list[0]?.src || "");
            })
            .catch(() => setImages([]));
    }, [labels]);
    
    useEffect(() => {
        if (!state) return;
        if (forcedRole === "A" || forcedRole === "B") {
            const current = forcedRole === "A" ? state.playerA : state.playerB;
            if (current !== clientId) send({ type: "CLAIM_ROLE", player: forcedRole, clientId });
        }
        if (forcedName && (myRole === "A" || myRole === "B")) {
            const currentName = myRole === "A" ? state.playerNameA : state.playerNameB;
            if (currentName !== forcedName) send({ type: "SET_PLAYER_NAME", player: myRole, name: forcedName });
        }
    }, [state, forcedRole, forcedName, myRole, clientId, send]);
    
    useEffect(() => {
        if (!lastSfx?.sound) return;
        const audio = new Audio(`/assets/sounds/${lastSfx.sound}.ogg`);
        audio.play().catch(() => {});
    }, [lastSfx]);
    
    useEffect(() => {
        if (!scoreFx) return;
        setScoreFxView(scoreFx);
        
        const t = setTimeout(() => {
            setScoreFxView(null);
        }, 900);
        
        return () => clearTimeout(t);
    }, [scoreFx]);
    
    if (!state || !labels) return <div className="loading">Caricamento...</div>;
    
    const playerAName = state.playerNameA || labels?.playerA?.boardLabel || "Giocatore A";
    const playerBName = state.playerNameB || labels?.playerB?.boardLabel || "Giocatore B";
    const webcamLabelA = state.playerNameA || labels?.playerA?.webcamLabel || "Webcam A";
    const webcamLabelB = state.playerNameB || labels?.playerB?.webcamLabel || "Webcam B";
    
    const canEditA = myRole === "A";
    const canEditB = myRole === "B";
    
    const roundImage = state.roundImage || roundSelect || images[0]?.src || "";
    
    const scoreTarget = myRole;
    const canScore = scoreTarget === "A" || scoreTarget === "B";
    
    const votes = aggregateVotes(state.chatVotes?.entries || []);
    
    const onNewRound = () => {
        if (!images.length) {
            send({ type: "NEW_ROUND", roundImage: null });
            return;
        }
        
        const pick = images[Math.floor(Math.random() * images.length)];
        setRoundSelect(pick.src); // aggiorna anche la select visivamente
        send({ type: "NEW_ROUND", roundImage: pick.src });
    };
    
    return (
        <div id="app">
            <div className="top">
                <div className="cam">
                    <div className="label">{webcamLabelA}</div>
                    <div className="placeholder" />
                </div>
                
                <div className="center">
                    <div className="label">Round attuale</div>
                    <select value={roundSelect} onChange={(e) => setRoundSelect(e.target.value)}>
                        {images.map((img) => (
                            <option key={img.file} value={img.src}>{img.name}</option>
                        ))}
                    </select>
                    {roundImage ? <img src={roundImage} alt="Round attuale" /> : <div className="round-ph" />}
                    <div className="center-controls-row">
                        <div className="scoreboard" id="scoreboard">
                            <button
                                className="score-btn"
                                disabled={!canScore}
                                onClick={() => send({ type: "SET_SCORE_DELTA", player: scoreTarget, delta: -1 })}
                            >
                                -1
                            </button>
                            <span className="value">{state.punteggioA}</span>
                            <span className="dash">-</span>
                            <span className="value">{state.punteggioB}</span>
                            <button
                                className="score-btn"
                                disabled={!canScore}
                                onClick={() => send({ type: "SET_SCORE_DELTA", player: scoreTarget, delta: 1 })}
                            >
                                +1
                            </button>
                        </div>
                        
                        <button className="btn btn-round-inline" id="newRound" onClick={onNewRound}>
                            Nuovo Round
                        </button>
                    </div>
                </div>
                
                <div className="cam">
                    <div className="label">{webcamLabelB}</div>
                    <div className="placeholder" />
                </div>
            </div>
            
            <div className="tabs">
                <div className="tab-header">
                    <button className={`tab-btn ${tab === 0 ? "active" : ""}`} onClick={() => setTab(0)}>Gioco</button>
                    <button className={`tab-btn ${tab === 1 ? "active" : ""}`} onClick={() => setTab(1)}>Regole</button>
                    <button className={`tab-btn ${tab === 2 ? "active" : ""}`} onClick={() => setTab(2)}>Voti chat</button>
                </div>
                
                <div className="tabs-viewport">
                    <div className="tabs-inner" style={{ transform: `translateX(-${tab * 100}%)` }}>
                        <section className="tab-panel" data-tab="0">
                            <div className="boards">
                                <Board
                                    board="A"
                                    title=""
                                    images={images}
                                    cells={state.celleA || []}
                                    editable={canEditA}
                                    showReset={canEditA}
                                    onCellSet={(index, mode) => send({ type: "CELL_SET", board: "A", index, mode })}
                                    onReset={() => send({ type: "BOARD_RESET", board: "A" })}
                                />
                                <Board
                                    board="B"
                                    title=""
                                    images={images}
                                    cells={state.celleB || []}
                                    editable={canEditB}
                                    showReset={canEditB}
                                    onCellSet={(index, mode) => send({ type: "CELL_SET", board: "B", index, mode })}
                                    onReset={() => send({ type: "BOARD_RESET", board: "B" })}
                                />
                            </div>
                        </section>
                        
                        <section className="tab-panel" data-tab="1">
                            <div className="rules-panel">
                                <h2>Regole del gioco</h2>
                                <ul>
                                    <li>Ogni giocatore sceglie in segreto un personaggio dalla propria scheda.</li>
                                    <li>Ogni giocatore ha a disposizione una sola azione per turno, o <b>domanda</b> o <b>dichiarazione</b>.</li>
                                    <li>A turno si fanno domande a cui si può rispondere solo con <b>Sì</b> o <b>No</b>.</li>
                                    <li>Dopo ogni risposta, ogni giocatore aggiorna la propria scheda eliminando (in rosso) o tenendo in considerazione (in verde) i personaggi.</li>
                                    <li>Quando un giocatore pensa di aver capito chi è il personaggio avversario, può fare una <b>dichiarazione</b>.</li>
                                    <li>Se la dichiarazione è corretta, quel giocatore vince il round segnando <b>+1 punto</b> sul proprio punteggio.</li>
                                    <li>Se sbaglia, il round finisce immediatamente e quel giocatore perde il round segnando <b>-1 punto</b> sul proprio punteggio.</li>
                                    <li>Dopo la fine del round si può iniziare un nuovo round scegliendo un altro personaggio segreto.</li>
                                    <li>Una sola volta per round ogni giocatore può chiedere un suggerimento all'altro giocatore che deve rispondere anche depistando l'avversario, ciò consuma l'azione del turno di chi pone la domanda.</li>
                                    <li>Una sola volta per round ogni giocatore può rifiutarsi di rispondere ad una domanda, ciò consuma l'azione del turno di chi pone la domanda.</li>
                                    <li>Non è concesso barare guardando la live dell'avversario.</li>
                                </ul>
                                
                                <h2 style={{ marginTop: 10 }}>Come può interagire la chat</h2>
                                <ul>
                                    <li>La chat può usare i comandi dedicati per proporre quali caselle <b>eliminare</b> (<b>!rosso NOME CASELLA</b>) o <b>tenere</b> (<b>!verde NOME CASELLA</b>).</li>
                                    <li>Le proposte della chat vengono raccolte e mostrate nella tab <b>“Voti chat”</b>. Solo lo streamer decide se e quando applicare davvero una mossa sulla scheda.</li>
                                    <li>Il voto viene considerato una sola volta, è però possibile cambiare la propria scelta con un nuovo comando.</li>
                                    <li>La chat può decidere anche di depistare il giocatore, ciò porterà a dubitare del voto abilitando la chat potenzialmente a barare senza però rovinare il gioco a nessuno.</li>
                                </ul>
                            </div>
                        </section>
                        
                        <section className="tab-panel" data-tab="2">
                            <div className="votes-panel">
                                <h2>Voti della chat</h2>
                                <p className="votes-subtitle">Qui vengono mostrati i voti del round corrente.</p>
                                
                                <div className="votes-list" id="chatVotesList">
                                    {!votes.length ? (
                                        <div>Nessun voto per questo round.</div>
                                    ) : (
                                        votes.map((v) => {
                                            const total = v.rosso + v.verde;
                                            const tone = v.rosso > v.verde ? "red" : v.verde > v.rosso ? "green" : "neutral";
                                            const width = Math.min(100, 20 + total * 12);
                                            return (
                                                <div className="vote-row" key={v.name}>
                                                    <div className="vote-label">{v.name}</div>
                                                    <div className="vote-bar-bg">
                                                        <div className={`vote-bar-fill ${tone}`} style={{ width: `${width}%` }} />
                                                    </div>
                                                    <div className="vote-count">{total} (R {v.rosso} / V {v.verde})</div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
            
            {error ? <div className="error-floating">{error}</div> : null}
            
            {scoreFxView ? (
                <div className={`score-fx-overlay ${scoreFxView.tone || "green"}`}>
                    <div className="score-fx-text">{scoreFxView.text}</div>
                </div>
            ) : null}
        </div>
    );
}