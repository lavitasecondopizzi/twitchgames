import { useEffect, useMemo, useRef, useState } from "react";
import gamesData from "./data/games.json";
import GameCard from "./components/GameCard";
import SettingsPanel from "./components/SettingsPanel";
import LaunchButtons from "./components/LaunchButtons";
import "./styles.css";

async function fetchIndovinaChiFolders() {
    try {
        const res = await fetch("/api/games/indovina-chi/folders");
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function buildInitialSettings(game) {
    const obj = {};
    for (const s of game?.settings || []) {
        obj[s.key] = s.default ?? "";
    }
    return obj;
}

function applyTemplate(value, settings) {
    if (typeof value !== "string") return value;
    return value.replace(/\{([^}]+)\}/g, (_, key) => String(settings[key] ?? ""));
}

function buildLaunchUrl(game, profile, settings) {
    const rawBaseUrl = game?.launch?.baseUrl || "/";
    const originBase = `${window.location.protocol}//${window.location.hostname}`;
    const baseUrl = applyTemplate(rawBaseUrl, { ...settings, origin: originBase });
    const queryObj = profile?.query || {};
    const params = new URLSearchParams();

    Object.entries(queryObj).forEach(([k, v]) => {
        const resolved = applyTemplate(v, settings);
        if (resolved !== undefined && resolved !== null && String(resolved).trim() !== "") {
            params.set(k, String(resolved));
        }
    });

    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
}

function mergeThemeOptionsFromGame(game, availableFolders) {
    const folderField = (game?.settings || []).find((s) => s.key === "folder");
    const staticOptions = Array.isArray(folderField?.options) ? folderField.options : [];
    
    const normalizedStatic = staticOptions.map((opt) => {
        if (typeof opt === "object" && opt !== null) {
            return {
                label: String(opt.label ?? opt.value ?? ""),
                value: String(opt.value ?? "")
            };
        }
        return { label: String(opt), value: String(opt) };
    });
    
    const availableSet = new Set((availableFolders || []).map(String));
    
    // Mostra solo i temi definiti in games.json che esistono davvero sul filesystem
    const merged = normalizedStatic.filter((opt) => availableSet.has(opt.value));
    
    return merged;
}

export default function App() {
    const games = gamesData.games || [];
    const [selectedGameId, setSelectedGameId] = useState("");
    const selectedGame = useMemo(
        () => games.find((g) => g.id === selectedGameId) || null,
        [games, selectedGameId]
    );

    const [settingsByGame, setSettingsByGame] = useState(() => {
        const map = {};
        for (const g of games) map[g.id] = buildInitialSettings(g);
        return map;
    });
    
    const currentSettings = selectedGame ? (settingsByGame[selectedGame.id] || {}) : {};

    const updateSetting = (key, value) => {
        if (!selectedGame) return;
        setSettingsByGame((prev) => ({
            ...prev,
            [selectedGame.id]: {
                ...(prev[selectedGame.id] || {}),
                [key]: value
            }
        }));
    };

    const resetSettings = () => {
        if (!selectedGame) return;
        setSettingsByGame((prev) => ({
            ...prev,
            [selectedGame.id]: buildInitialSettings(selectedGame)
        }));
    };
    
    const [dynamicOptions, setDynamicOptions] = useState({
        "indovina-chi:folder": []
    });
    
    useEffect(() => {
        fetchIndovinaChiFolders().then((folders) => {
            if (!folders.length) return;
            
            const indovinaChiGame = (gamesData.games || []).find((g) => g.id === "indovina-chi");
            const mergedThemeOptions = mergeThemeOptionsFromGame(indovinaChiGame, folders);
            
            if (!mergedThemeOptions.length) return;
            
            setDynamicOptions((prev) => ({
                ...prev,
                "indovina-chi:folder": mergedThemeOptions
            }));
        });
    }, []);
    
    const menuAudioRef = useRef(null);
    const [musicMuted, setMusicMuted] = useState(false);
    const [musicStarted, setMusicStarted] = useState(false);
    
    useEffect(() => {
        const audio = new Audio("/audio/mainmenu.mp3");
        audio.loop = true;
        audio.volume = 0.18;
        audio.preload = "auto";
        
        menuAudioRef.current = audio;
        
        const tryPlay = async () => {
            try {
                audio.muted = musicMuted;
                await audio.play();
                setMusicStarted(true);
            } catch {
                // autoplay bloccato: partirà al primo click utente
            }
        };
        
        tryPlay();
        
        const unlockOnFirstInteraction = async () => {
            if (!menuAudioRef.current) return;
            try {
                menuAudioRef.current.muted = musicMuted;
                await menuAudioRef.current.play();
                setMusicStarted(true);
            } catch {}
            window.removeEventListener("click", unlockOnFirstInteraction);
            window.removeEventListener("keydown", unlockOnFirstInteraction);
            window.removeEventListener("touchstart", unlockOnFirstInteraction);
        };
        
        window.addEventListener("click", unlockOnFirstInteraction, { once: true });
        window.addEventListener("keydown", unlockOnFirstInteraction, { once: true });
        window.addEventListener("touchstart", unlockOnFirstInteraction, { once: true });
        
        return () => {
            window.removeEventListener("click", unlockOnFirstInteraction);
            window.removeEventListener("keydown", unlockOnFirstInteraction);
            window.removeEventListener("touchstart", unlockOnFirstInteraction);
            audio.pause();
            audio.src = "";
            menuAudioRef.current = null;
        };
    }, []);
    
    useEffect(() => {
        if (!menuAudioRef.current) return;
        menuAudioRef.current.muted = musicMuted;
    }, [musicMuted]);
    
    const toggleMusic = async () => {
        const nextMuted = !musicMuted;
        setMusicMuted(nextMuted);
        
        if (!nextMuted && menuAudioRef.current && !musicStarted) {
            try {
                await menuAudioRef.current.play();
                setMusicStarted(true);
            } catch {}
        }
    };

    return (
        <div className="launcher-root">
            <div className="bg-decor bg-decor-a" />
            <div className="bg-decor bg-decor-b" />

            <header className="launcher-header window-panel">
                <div className="window-bar">
                    <span className="dot red" />
                    <span className="dot yellow" />
                    <span className="dot green" />
                    <div className="window-title">{gamesData.title || "Tacchino Games"} Launcher</div>
                </div>

                <div className="header-content">
                    <div>
                        <h1>{gamesData.title || "Tacchino Games"}</h1>
                        <p>Seleziona un gioco, imposta le opzioni e avvialo come in un menu principale.</p>
                    </div>
                    <button
                        type="button"
                        className="audio-btn"
                        onClick={toggleMusic}
                        title={musicMuted ? "Attiva musica" : "Disattiva musica"}
                        aria-label={musicMuted ? "Attiva musica" : "Disattiva musica"}
                    >
                        {musicMuted ? "🔇" : "🔊"}
                    </button>
                </div>
            </header>

            <main className="launcher-layout">
                <section className="games-column window-panel">
                    <div className="window-bar compact">
                        <span className="dot red" />
                        <span className="dot yellow" />
                        <span className="dot green" />
                        <div className="window-title">Selezione gioco</div>
                    </div>

                    <div className="panel-content scroll">
                        <div className="games-grid">
                            {games.map((game) => (
                                <GameCard
                                    key={game.id}
                                    game={game}
                                    selected={game.id === selectedGameId}
                                    onSelect={() => setSelectedGameId(game.id)}
                                />
                            ))}
                        </div>
                    </div>
                </section>

                <section className="settings-column">
                    
                    {selectedGame ? (
                        <div className="window-panel settings-panel-wrap">
                            <div className="window-bar compact">
                                <span className="dot red" />
                                <span className="dot yellow" />
                                <span className="dot green" />
                                <div className="window-title">Impostazioni</div>
                            </div>
                            
                            <div className="panel-content">
                                <SettingsPanel
                                    game={selectedGame}
                                    values={currentSettings}
                                    onChange={updateSetting}
                                    onReset={resetSettings}
                                    dynamicOptions={dynamicOptions}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            Seleziona un gioco dalla colonna a sinistra per vedere e modificare le impostazioni.
                        </div>
                    )}

                    <div className="window-panel launch-panel-wrap">
                        <div className="window-bar compact">
                            <span className="dot red" />
                            <span className="dot yellow" />
                            <span className="dot green" />
                            <div className="window-title">Avvio</div>
                        </div>

                        <div className="panel-content">
                            {selectedGame ? (
                                <LaunchButtons
                                    game={selectedGame}
                                    settings={currentSettings}
                                    buildLaunchUrl={buildLaunchUrl}
                                />
                            ) : (
                                <div className="empty-state">Seleziona un gioco per generare i link di avvio.</div>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}