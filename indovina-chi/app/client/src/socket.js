export function createSocket({ url, onOpen, onClose, onError, onMessage }) {
	let ws = null;
	let reconnectTimer = null;
	let closed = false;
	
	const connect = () => {
		ws = new WebSocket(url);
		
		ws.onopen = () => onOpen?.();
		ws.onclose = () => {
			onClose?.();
			if (!closed) reconnectTimer = setTimeout(connect, 1500);
		};
		ws.onerror = (e) => onError?.(e);
		ws.onmessage = (e) => {
			try {
				onMessage?.(JSON.parse(e.data));
			} catch {}
		};
	};
	
	connect();
	
	return {
		send(payload) {
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(payload));
			}
		},
		close() {
			closed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			try { ws?.close(); } catch {}
		}
	};
}