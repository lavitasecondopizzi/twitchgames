export default function GameCard({ game, selected, onSelect }) {
	return (
		<button
			type="button"
			className={`game-card ${selected ? "selected" : ""}`}
			onClick={onSelect}
			title={game.name}
		>
			<div className="game-card-top">
				<div className="game-icon" aria-hidden="true">
					{game.name?.slice(0, 2)?.toUpperCase() || "GM"}
				</div>
				<div className="game-meta">
					<div className="game-name">{game.name}</div>
					<div className="game-id">{game.id}</div>
				</div>
			</div>
			
			<div className="game-description">
				{game.description || "Nessuna descrizione disponibile."}
			</div>
			
			<div className="game-card-footer">
				<span className="pill">Gioco</span>
				{(game.launchProfiles?.length || 0) > 0 ? (
					<span className="pill soft">{game.launchProfiles.length} profili</span>
				) : null}
			</div>
		</button>
	);
}