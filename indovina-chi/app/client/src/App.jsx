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

function Board({ board, title, images, cells, editable, onCellSet, onReset }) {
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
        <section className="board" data-board={board}>
            <div className="board-head">
                <div className="board-title">{title}</div>
                <div className="board-actions">
                    <button className="btn" onClick={onReset} disabled={!editable}>Reset</button>
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
    const { clientId, connected, state, labels, lastSfx, error, send } = useGameSocket();
    
    const [images, setImages] = useState([]);
    const [tab, setTab] = useState(0);
    const [roundSelect, setRoundSelect] = useState("");
    
    const qs = useMemo(() => new URLSearchParams(window.location.search), []);
    const forcedRole = qs.get("role"); // A/B
    const forcedName = qs.get("player") || qs.get("name") || "";
    
    const myRole = useMemo(() => {
        if (!state) return null;
        if (forcedRole === "A" || forcedRole === "B") return forcedRole;
        if (state.playerA === clientId) return "A";
        if (state.playerB === clientId) return "B";
        return null;
    }, [state, clientId, forcedRole]);
    
    useEffect(() => {
        if (!labels) return;
        const folder = labels.imageFolder || "nintendo";
        
        fetch(`/api/images?folder=${encodeURIComponent(folder)}`)
            .then((r) => r.json())
            .then((files) => {
                const list = (Array.isArray(files) ? files : []).map((file) => ({
                    file,
                    src: `/assets/img/${folder}/${file}`,
                    name: labels.imageLabels?.[file] || autoLabelFromFilename(file)
                }));
                setImages(list);
                if (list.length && !roundSelect) setRoundSelect(list[0].src);
            })
            .catch(() => setImages([]));
    }, [labels, roundSelect]);
    
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
        send({ type: "NEW_ROUND", roundImage: roundSelect || null });
    };
    
    return (
        <div id="app">
            <div className={`conn-pill ${connected ? "ok" : "ko"}`}>
                {connected ? "Realtime ON" : "Offline"}
            </div>
            
            <div className="top">
                <div className="cam">
                    <div className="label">{webcamLabelA}</div>
                </div>
                
                <div className="center">
                    <div className="label">Round attuale</div>
                    {roundImage ? <img src={roundImage} alt="Round attuale" /> : <div className="round-ph" />}
                    
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
                    
                    <select value={roundSelect} onChange={(e) => setRoundSelect(e.target.value)}>
                        {images.map((img) => (
                            <option key={img.file} value={img.src}>{img.name}</option>
                        ))}
                    </select>
                    
                    <button className="btn" id="newRound" onClick={onNewRound}>Nuovo Round</button>
                </div>
                
                <div className="cam">
                    <div className="label">{webcamLabelB}</div>
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
                                    title={playerAName}
                                    images={images}
                                    cells={state.celleA || []}
                                    editable={canEditA}
                                    onCellSet={(index, mode) => send({ type: "CELL_SET", board: "A", index, mode })}
                                    onReset={() => send({ type: "BOARD_RESET", board: "A" })}
                                />
                                <Board
                                    board="B"
                                    title={playerBName}
                                    images={images}
                                    cells={state.celleB || []}
                                    editable={canEditB}
                                    onCellSet={(index, mode) => send({ type: "CELL_SET", board: "B", index, mode })}
                                    onReset={() => send({ type: "BOARD_RESET", board: "B" })}
                                />
                            </div>
                            <div className="legend">
                                <span><b>Click sinistro</b> = rosso</span>
                                <span><b>Click destro</b> = verde</span>
                                <span><b>Doppio click</b> = reset</span>
                            </div>
                        </section>
                        
                        <section className="tab-panel" data-tab="1">
                            <div className="rules-panel">
                                <h2>Regole del gioco</h2>
                                <ul>
                                    <li>Ogni giocatore sceglie in segreto un personaggio dalla propria scheda.</li>
                                    <li>Ogni giocatore ha una sola azione per turno: domanda o dichiarazione.</li>
                                    <li>Le domande ammettono solo risposta Sì/No.</li>
                                    <li>Click sinistro = rosso, destro = verde, doppio click = reset cella.</li>
                                    <li>Reset pulisce la scheda del giocatore.</li>
                                    <li>Nuovo Round resetta schede e voti chat.</li>
                                </ul>
                                
                                <h2 style={{ marginTop: 10 }}>Come può interagire la chat</h2>
                                <ul>
                                    <li>Comandi tipo <b>!rosso NOME</b> e <b>!verde NOME</b>.</li>
                                    <li>I voti vengono mostrati nella tab “Voti chat”.</li>
                                    <li>Lo streamer decide se applicarli davvero.</li>
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
        </div>
    );
}