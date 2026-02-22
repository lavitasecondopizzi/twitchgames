import { useEffect, useMemo, useRef, useState } from "react";
import { createSocket } from "../socket";

function getClientId() {
	let id = localStorage.getItem("indovinachi_client_id");
	if (!id) {
		id = "c_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
		localStorage.setItem("indovinachi_client_id", id);
	}
	return id;
}

export function useGameSocket() {
	const clientId = useMemo(() => getClientId(), []);
	const wsRef = useRef(null);
	
	const [connected, setConnected] = useState(false);
	const [state, setState] = useState(null);
	const [labels, setLabels] = useState(null);
	const [lastSfx, setLastSfx] = useState(null);
	const [error, setError] = useState("");
	const [scoreFx, setScoreFx] = useState(null);
	
	useEffect(() => {
		const proto = window.location.protocol === "https:" ? "wss" : "ws";
		const url = `${proto}://${window.location.host}/ws`;
		
		wsRef.current = createSocket({
			url,
			onOpen: () => {
				setConnected(true);
				wsRef.current?.send({ type: "HELLO" });
			},
			onClose: () => setConnected(false),
			onError: () => setError("Errore WebSocket"),
			onMessage: (msg) => {
				if (msg.type === "STATE_SYNC") setState(msg.payload);
				else if (msg.type === "LABELS_SYNC") setLabels(msg.payload);
				else if (msg.type === "SFX") setLastSfx({ ...msg.payload, at: Date.now() });
				else if (msg.type === "ERROR") setError(msg.message || "Errore");
				else if (msg.type === "SCORE_FX") setScoreFx({ ...msg.payload, at: Date.now() });
			}
		});
		
		return () => wsRef.current?.close();
	}, []);
	
	const send = (payload) => wsRef.current?.send(payload);
	
	return { clientId, connected, state, labels, lastSfx, scoreFx, error, send, setError };
}