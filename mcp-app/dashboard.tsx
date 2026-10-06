import { VIEW_LABELS, type DashboardData, type DashboardView } from "./types.ts";

function clampScore(score: number): number {
	if (Number.isNaN(score)) return 0;
	return Math.min(100, Math.max(0, Math.round(score)));
}

export function Dashboard(props: { data: DashboardData; status?: string }): React.JSX.Element {
	const { data, status } = props;
	const view: DashboardView = data.view ?? "overview";
	const items = data.items ?? [];
	const actions = data.actions ?? [];

	return (
		<div className="jh-root">
			<div className="jh-container">
				<header className="jh-header">
					<h1 className="jh-title">{data.title || "Job Hunter Dashboard"}</h1>
					<span className="jh-badge">{VIEW_LABELS[view]}</span>
					{status ? <span className="jh-status">{status}</span> : null}
				</header>

				{data.summary ? (
					<section className="jh-card">
						<h2>Summary</h2>
						<p className="jh-summary">{data.summary}</p>
					</section>
				) : null}

				{items.length > 0 ? (
					<section className="jh-card">
						<h2>{items.length === 1 ? "Result" : `Results (${items.length})`}</h2>
						<ul className="jh-items">
							{items.map((item, index) => (
								<li key={`${item.title}-${index}`} className="jh-item">
									<div className="jh-item-top">
										<span className="jh-item-title">
											{item.title}
											{item.company ? ` at ${item.company}` : ""}
										</span>
										{item.score !== undefined || item.verdict ? (
											<span className="jh-score">
												{item.score !== undefined ? `${clampScore(item.score)}/100` : ""}
												{item.score !== undefined && item.verdict ? " · " : ""}
												{item.verdict ?? ""}
											</span>
										) : null}
									</div>
									{item.score !== undefined ? (
										<div className="jh-bar" aria-hidden="true">
											<div className="jh-bar-fill" style={{ width: `${clampScore(item.score)}%` }} />
										</div>
									) : null}
									{item.note ? <p className="jh-note">{item.note}</p> : null}
									{item.url ? (
										<a className="jh-link" href={item.url} target="_blank" rel="noreferrer">
											{item.url}
										</a>
									) : null}
								</li>
							))}
						</ul>
					</section>
				) : null}

				{data.markdown ? (
					<section className="jh-card">
						<h2>Details</h2>
						<pre className="jh-markdown">{data.markdown}</pre>
					</section>
				) : null}

				{actions.length > 0 ? (
					<section className="jh-card">
						<h2>Suggested next steps</h2>
						<ul className="jh-actions">
							{actions.map((action, index) => (
								<li key={`${index}-${action.slice(0, 24)}`}>{action}</li>
							))}
						</ul>
					</section>
				) : null}

				{!data.summary && items.length === 0 && !data.markdown ? (
					<section className="jh-card">
						<h2>Waiting for results</h2>
						<p className="jh-summary">
							The assistant has not sent dashboard data yet. Run a job-hunter tool (for example
							analyze-job, rank-jobs, or search-jobs) and its outcome renders here.
						</p>
					</section>
				) : null}
			</div>
		</div>
	);
}
