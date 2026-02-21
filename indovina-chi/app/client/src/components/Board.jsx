function nextMode(current, kind) {
	if (kind === "left") return current === "red" ? "" : "red";
	if (kind === "right") return current === "green" ? "" : "green";
	return "";
}

export default function Board({
	                              title,
	                              boardKey,
	                              cells,
	                              images,
	                              editable,
	                              onCellSet,
	                              onReset
                              }) {
	const handleClick = (e, index) => {
		if (!editable) return;
		const current = cells[index] || "";
		
		if (e.type === "click") {
			if (e.altKey) onCellSet(index, "");
			else onCellSet(index, nextMode(current, "left"));
			return;
		}
		
		if (e.type === "contextmenu") {
			e.preventDefault();
			onCellSet(index, nextMode(current, "right"));
			return;
		}
		
		if (e.type === "dblclick") {
			onCellSet(index, "");
		}
	};
	
	return (
		<div className="board">
			<div className="boardHeader">
				<h3>{title}</h3>
				<button onClick={onReset} disabled={!editable}>Reset</button>
			</div>
			
			<div className={`grid ${editable ? "" : "gridLocked"}`}>
				{images.map((img, idx) => {
					const mode = cells[idx] || "";
					return (
						<div
							key={`${boardKey}-${idx}-${img.file}`}
							className={`cell ${mode}`}
							onClick={(e) => handleClick(e, idx)}
							onDoubleClick={(e) => handleClick(e, idx)}
							onContextMenu={(e) => handleClick(e, idx)}
							title={img.label}
						>
							<img src={img.src} alt={img.label} />
							<div className="overlay" />
							<div className="caption">{img.label}</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}