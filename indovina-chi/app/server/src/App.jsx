import { useEffect, useRef, useState } from "react";

export default function App() {
	const [connected, setConnected] = useState(false);
	const [state, setState] = useState(null);
	const [error, setError] = useState("");
	const wsRef = useRef(null);
	
	useEffect(() => {
		const proto = window.location.protocol === "https:" ? "wss" : "ws";
		const url = `${proto}://${window.location.host}/ws`;
		
		const ws = new WebSocket(url);
		wsRef.current = ws;
		
		ws.onopen = () => {
			setConnected(true);
			ws.send(JSON.stringify({ type: "HELLO" }));
		};
		
		ws.onclose = () => setConnected(false);
		ws.onerror = () => setError("Errore WebSocket");
		
		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data);
				if (msg.type === "STATE_SYNC") setState(msg.payload);
				if (msg.type === "ERROR") setError(msg.message || "Errore");
			} catch {
				setError("Messaggio non valido");
			}
		};
		
		return () => ws.close();
	}, []);
	
	return (
		<div style={{ fontFamily: "sans-serif", padding: 20 }}>
			<h1>Indovina Chi Realtime (MVP)</h1>
			<p>
				Stato connessione:{" "}
				<strong style={{ color: connected ? "green" : "red" }}>
					{connected ? "Connesso" : "Disconnesso"}
				</strong>
			</p>
			
			<button
				onClick={() => wsRef.current?.send(JSON.stringify({ type: "PING_STATE" }))}
				disabled={!connected}
			>
				Test realtime (incrementa version)
			</button>
			
			{error && <p style={{ color: "crimson" }}>{error}</p>}
			
			<pre style={{ marginTop: 16, background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(state, null, 2)}
      </pre>
		</div>
	);
}