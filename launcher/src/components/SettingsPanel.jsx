function Field({ field, value, onChange, gameId, dynamicOptions }) {
	const commonProps = {
		id: `field-${field.key}`,
		name: field.key
	};
	
	return (
		<div className="setting-field">
			<label htmlFor={`field-${field.key}`} className="setting-label">
				{field.label}
			</label>
			
			{field.type === "text" && (
				<input
					{...commonProps}
					type="text"
					className="input-control"
					value={value ?? ""}
					onChange={(e) => onChange(field.key, e.target.value)}
					placeholder={field.placeholder || ""}
				/>
			)}
			
			{field.type === "select" && (() => {
				const dynKey = `${gameId}:${field.key}`;
				const options = dynamicOptions[dynKey]?.length
					? dynamicOptions[dynKey]
					: (field.options || []);
				
				return (
					<select
						{...commonProps}
						className="input-control"
						value={value ?? ""}
						onChange={(e) => onChange(field.key, e.target.value)}
					>
						{options.map((opt) => {
							const isObj = typeof opt === "object" && opt !== null;
							const value = isObj ? String(opt.value ?? "") : String(opt);
							const label = isObj ? String(opt.label ?? opt.value ?? "") : String(opt);
							
							return (
								<option key={value} value={value}>
									{label}
								</option>
							);
						})}
					</select>
				);
			})()}
			
			{field.type === "number" && (
				<input
					{...commonProps}
					type="number"
					className="input-control"
					value={value ?? ""}
					onChange={(e) => onChange(field.key, e.target.value)}
					min={field.min}
					max={field.max}
					step={field.step || 1}
				/>
			)}
			
			{field.type === "checkbox" && (
				<label className="checkbox-row">
					<input
						{...commonProps}
						type="checkbox"
						checked={Boolean(value)}
						onChange={(e) => onChange(field.key, e.target.checked)}
					/>
					<span>Attivo</span>
				</label>
			)}
		</div>
	);
}

export default function SettingsPanel({ game, values, onChange, onReset, dynamicOptions = {} }) {
	const fields = game?.settings || [];
	
	return (
		<div className="settings-panel">
			<div className="settings-head">
				<div>
					<h2>{game.name}</h2>
					<p>{game.description || "Configura questo gioco prima dell'avvio."}</p>
				</div>
				<button type="button" className="action-btn secondary" onClick={onReset}>
					Reset
				</button>
			</div>
			
			<div className="settings-fields">
				{fields.length === 0 ? (
					<div className="empty-state">Questo gioco non ha impostazioni configurabili.</div>
				) : (
					fields.map((field) => (
						<Field
							key={field.key}
							field={field}
							value={values[field.key]}
							onChange={onChange}
							gameId={game.id}
							dynamicOptions={dynamicOptions}
						/>
					))
				)}
			</div>
		</div>
	);
}