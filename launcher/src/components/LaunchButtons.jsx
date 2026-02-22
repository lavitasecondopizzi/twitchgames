import { useMemo, useState } from "react";

async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export default function LaunchButtons({ game, settings, buildLaunchUrl }) {
	const [copiedId, setCopiedId] = useState("");
	
	const profiles = game?.launchProfiles || [];
	
	const computed = useMemo(
		() =>
			profiles.map((p) => ({
				...p,
				url: buildLaunchUrl(game, p, settings)
			})),
		[profiles, game, settings, buildLaunchUrl]
	);
	
	const handleCopy = async (profileId, url) => {
		const ok = await copyText(url);
		if (!ok) return;
		setCopiedId(profileId);
		setTimeout(() => setCopiedId(""), 1200);
	};
	
	if (!computed.length) {
		return <div className="empty-state">Nessun profilo di avvio configurato per questo gioco.</div>;
	}
	
	return (
		<div className="launch-panel">
			<div className="launch-list launch-list-compact">
				{computed.map((profile) => (
					<button
						key={profile.id}
						type="button"
						className="action-btn launch-copy-btn"
						onClick={() => handleCopy(profile.id, profile.url)}
						title={profile.label}
					>
						{copiedId === profile.id ? "Copiato!" : profile.label}
					</button>
				))}
			</div>
		</div>
	);
}