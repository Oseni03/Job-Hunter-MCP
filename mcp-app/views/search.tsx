import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, ItemActionButton, Notice, ScoreBar, Section } from "./_shared.tsx";

export interface SearchViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function SearchView(props: SearchViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const filters = rec(details["filters"]);
	const keywords = text(filters["keywords"]);
	const candidates = data.items ?? [];
	const notes = strings(details["notes"]);
	const errors = strings(details["errors"]);
	const queriesRun = strings(details["queriesRun"]);
	return (
		<AppShell title={data.title ?? "Job search results"} badge="Search" status={props.status}>
		<Hero
			title={`${keywords !== "" ? `"${keywords}"` : "Auto queries"} · ${candidates.length} candidates`}
			badge={<Badge>{candidates.length} candidates</Badge>}
			meta={
				<>
					{text(filters["location"]) !== "" ? `${text(filters["location"])} · ` : ""}seen skipped{" "}
					{num(details["seenSkipped"]) ?? 0} · applied skipped {num(details["appliedSkipped"]) ?? 0}
					{queriesRun.length > 0 ? ` · Ran: ${queriesRun.join("; ")}` : ""}
				</>
			}
		/>

			{candidates.length > 0 ? (
				<Section title={`Candidates (${candidates.length})`}>
					{candidates.map((candidate, index) => (
						<div
							key={`${candidate.title}-${index}`}
							className="rounded-[10px] border border-border bg-background p-3"
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<span className="text-sm font-medium">
									{candidate.title}
									{candidate.company ? ` at ${candidate.company}` : ""}
								</span>
								{candidate.score !== undefined || candidate.verdict ? (
									<Badge variant="outline">
										{candidate.score !== undefined ? `${candidate.score}/100` : ""}
										{candidate.score !== undefined && candidate.verdict ? " · " : ""}
										{candidate.verdict ?? ""}
									</Badge>
								) : null}
							</div>
							{candidate.score !== undefined ? <ScoreBar score={candidate.score} /> : null}
							{candidate.note ? (
								<p className="mt-1 text-[13px] text-muted-foreground">{candidate.note}</p>
							) : null}
							{candidate.url ? (
								<a
									className="mt-1 block text-[13px] break-all text-primary underline underline-offset-2"
									href={candidate.url}
									target="_blank"
									rel="noreferrer"
								>
									{candidate.url}
								</a>
							) : null}
							{candidate.action ? (
								<div className="mt-2">
									<ItemActionButton action={candidate.action} onAction={onAction} pending={pending} />
								</div>
							) : null}
						</div>
					))}
				</Section>
			) : null}

		{list(details["stale"]).length > 0 || notes.length > 0 ? (
			<Section title="Run notes">
				<BulletList items={notes} />
			</Section>
		) : null}

		{errors.length > 0 ? (
			<Notice variant="destructive" title="Search errors">
				<BulletList items={errors} />
			</Notice>
		) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
