import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";

const app = express();

const PORT = Number(process.env.PORT || 8090);
const TWITCHGAMES_ROOT =
	process.env.TWITCHGAMES_ROOT || "/opt/twitchgames";

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
	res.json({ ok: true, service: "twitchgames-launcher-server" });
});

app.get("/api/games/indovina-chi/folders", (_req, res) => {
	const base = path.join(TWITCHGAMES_ROOT, "indovina-chi", "assets", "img");
	
	try {
		if (!fs.existsSync(base)) {
			return res.status(404).json({
				error: "Cartella assets/img non trovata",
				path: base
			});
		}
		
		const dirs = fs.readdirSync(base)
			.filter((name) => {
				try {
					return fs.statSync(path.join(base, name)).isDirectory();
				} catch {
					return false;
				}
			})
			.sort((a, b) => a.localeCompare(b, "it"));
		
		res.json(dirs);
	} catch (e) {
		res.status(500).json({
			error: "Impossibile leggere le cartelle immagini",
			code: e.code,
			message: e.message
		});
	}
});

app.listen(PORT, "0.0.0.0", () => {
	console.log(`Launcher API in ascolto su http://0.0.0.0:${PORT}`);
	console.log("TWITCHGAMES_ROOT =", TWITCHGAMES_ROOT);
});