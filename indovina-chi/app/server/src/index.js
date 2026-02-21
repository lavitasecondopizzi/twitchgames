import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const ASSETS_DIR = process.env.ASSETS_DIR || "/app/assets";
const PORT = Number(process.env.PORT || 8080);
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(__dirname, "../../client/dist");

const STATE_FILE = path.join(DATA_DIR, "stato.json");
const LABELS_FILE = path.join(DATA_DIR, "labels.json");

function readJsonSafe(filePath, fallback) {
	try {
		if (!fs.existsSync(filePath)) return fallback;
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return fallback;
	}
}

function writeJsonSafe(filePath, data) {
	try {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		const tmp = `${filePath}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
		fs.renameSync(tmp, filePath);
	} catch (e) {
		console.error("Errore scrittura:", e.message);
	}
}

function normalizeState(s) {
	const base = {
		status: "lobby",
		version: 0,
		updatedAt: Date.now(),
		celleA: Array(25).fill(""),
		celleB: Array(25).fill(""),
		punteggioA: 0,
		punteggioB: 0,
		playerA: null,
		playerB: null,
		playerNameA: null,
		playerNameB: null,
		roundImage: null,
		chatVotes: { round: 0, entries: [] }
	};
	const out = { ...base, ...(s || {}) };
	out.celleA = Array.isArray(out.celleA) ? out.celleA.slice(0, 25) : [];
	out.celleB = Array.isArray(out.celleB) ? out.celleB.slice(0, 25) : [];
	while (out.celleA.length < 25) out.celleA.push("");
	while (out.celleB.length < 25) out.celleB.push("");
	if (!out.chatVotes || typeof out.chatVotes !== "object") out.chatVotes = { round: 0, entries: [] };
	if (!Array.isArray(out.chatVotes.entries)) out.chatVotes.entries = [];
	out.punteggioA = Math.max(0, Number(out.punteggioA || 0));
	out.punteggioB = Math.max(0, Number(out.punteggioB || 0));
	return out;
}

let stato = normalizeState(readJsonSafe(STATE_FILE, {}));

const app = express();
app.use(cors());
app.use(express.json());

app.use("/assets", express.static(ASSETS_DIR));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/state", (_req, res) => res.json(stato));
app.get("/api/labels", (_req, res) => {
	res.json(readJsonSafe(LABELS_FILE, { imageFolder: "nintendo", imageLabels: {} }));
});

app.get("/api/images", (req, res) => {
	const folder = String(req.query.folder || "nintendo").replace(/^\/+|\/+$/g, "");
	if (!/^[a-zA-Z0-9_-]+$/.test(folder)) return res.status(400).json({ error: "folder non valida" });
	
	const dir = path.join(ASSETS_DIR, "img", folder);
	try {
		const files = fs.readdirSync(dir)
			.filter((f) => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
			.sort((a, b) => a.localeCompare(b, "it"));
		res.json(files);
	} catch {
		res.status(404).json({ error: "cartella non trovata" });
	}
});

// Compatibilità bot/chat esterno (ex vote.php)
app.post("/api/chat-vote", (req, res) => {
	const { cmd, name, user = "anon" } = req.body || {};
	const command = String(cmd || "").trim().toLowerCase();
	const targetName = String(name || "").trim();
	const username = String(user || "anon").trim() || "anon";
	
	if (!["rosso", "verde"].includes(command)) return res.status(400).json({ error: "cmd non valido" });
	if (!targetName) return res.status(400).json({ error: "name mancante" });
	
	stato.chatVotes.entries.push({
		user: username,
		cmd: command,
		name: targetName,
		ts: new Date().toISOString()
	});
	
	persist();
	broadcast({ type: "STATE_SYNC", payload: stato });
	res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws, msg) {
	if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg) {
	const raw = JSON.stringify(msg);
	for (const c of wss.clients) if (c.readyState === 1) c.send(raw);
}
function persist() {
	stato.version = Number(stato.version || 0) + 1;
	stato.updatedAt = Date.now();
	writeJsonSafe(STATE_FILE, stato);
}
function stateSync() {
	broadcast({ type: "STATE_SYNC", payload: stato });
}
function labelsSync(ws) {
	send(ws, { type: "LABELS_SYNC", payload: readJsonSafe(LABELS_FILE, { imageFolder: "nintendo", imageLabels: {} }) });
}

function applyCell(board, index, mode) {
	if (!["A", "B"].includes(board)) throw new Error("board non valida");
	const i = Number(index);
	if (!Number.isInteger(i) || i < 0 || i >= 25) throw new Error("index non valido");
	if (!["", "red", "green"].includes(mode)) throw new Error("mode non valido");
	
	const key = board === "A" ? "celleA" : "celleB";
	stato[key][i] = mode;
}

wss.on("connection", (ws) => {
	send(ws, { type: "STATE_SYNC", payload: stato });
	labelsSync(ws);
	
	ws.on("message", (raw) => {
		try {
			const msg = JSON.parse(raw.toString());
			
			switch (msg.type) {
				case "HELLO":
					send(ws, { type: "STATE_SYNC", payload: stato });
					labelsSync(ws);
					return;
				
				case "CLAIM_ROLE": {
					const { player, clientId } = msg;
					if (!["A", "B"].includes(player)) throw new Error("player non valido");
					if (!clientId) throw new Error("clientId mancante");
					
					if (player === "A") {
						stato.playerA = clientId;
						if (stato.playerB === clientId) stato.playerB = null;
					} else {
						stato.playerB = clientId;
						if (stato.playerA === clientId) stato.playerA = null;
					}
					persist(); stateSync();
					return;
				}
				
				case "SET_PLAYER_NAME": {
					const { player, name } = msg;
					if (!["A", "B"].includes(player)) throw new Error("player non valido");
					const v = String(name || "").trim() || null;
					if (player === "A") stato.playerNameA = v;
					else stato.playerNameB = v;
					persist(); stateSync();
					return;
				}
				
				case "CELL_SET": {
					applyCell(msg.board, msg.index, msg.mode);
					persist(); stateSync();
					return;
				}
				
				case "BOARD_RESET": {
					if (!["A", "B"].includes(msg.board)) throw new Error("board non valida");
					if (msg.board === "A") stato.celleA = Array(25).fill("");
					else stato.celleB = Array(25).fill("");
					persist(); stateSync();
					return;
				}
				
				case "SET_SCORE_DELTA": {
					const { player, delta } = msg;
					const n = Number(delta);
					if (!["A", "B"].includes(player)) throw new Error("player non valido");
					if (!Number.isFinite(n)) throw new Error("delta non valido");
					
					if (player === "A") stato.punteggioA = Math.max(0, stato.punteggioA + n);
					else stato.punteggioB = Math.max(0, stato.punteggioB + n);
					
					persist();
					stateSync();
					broadcast({ type: "SFX", payload: { sound: n >= 0 ? "score_up" : "score_down" } });
					return;
				}
				
				case "NEW_ROUND": {
					stato.roundImage = msg.roundImage || null;
					stato.celleA = Array(25).fill("");
					stato.celleB = Array(25).fill("");
					stato.chatVotes = {
						round: Number(stato.chatVotes?.round || 0) + 1,
						entries: []
					};
					persist(); stateSync();
					return;
				}
				
				case "CHAT_VOTE": {
					const { cmd, name, user = "anon" } = msg;
					const command = String(cmd || "").trim().toLowerCase();
					const targetName = String(name || "").trim();
					if (!["rosso", "verde"].includes(command)) throw new Error("cmd non valido");
					if (!targetName) throw new Error("name mancante");
					
					stato.chatVotes.entries.push({
						user: String(user || "anon"),
						cmd: command,
						name: targetName,
						ts: new Date().toISOString()
					});
					persist(); stateSync();
					return;
				}
				
				default:
					send(ws, { type: "ERROR", message: "Messaggio non supportato" });
			}
		} catch (e) {
			send(ws, { type: "ERROR", message: e.message || "Errore server" });
		}
	});
});

// Serve React build
if (fs.existsSync(CLIENT_DIST)) {
	app.use(express.static(CLIENT_DIST));
	app.get(/^(?!\/(api|assets|ws)(\/|$)).*/, (_req, res) => {
		res.sendFile(path.join(CLIENT_DIST, "index.html"));
	});
} else {
	app.get("/", (_req, res) => res.status(503).send("Frontend non buildato"));
}

server.listen(PORT, "0.0.0.0", () => {
	console.log(`Server attivo su 0.0.0.0:${PORT}`);
	console.log(`DATA_DIR=${DATA_DIR}`);
	console.log(`ASSETS_DIR=${ASSETS_DIR}`);
	console.log(`CLIENT_DIST=${CLIENT_DIST}`);
});