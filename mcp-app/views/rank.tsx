import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, ItemActionButton, Notice, ScoreBar, Section } from "./_shared.tsx";

export interface RankViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function RankView(props: RankViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const shortlist = list(details["shortlist"]);
	const excluded = list(details["excluded"]);
	const closingSoon = list(details["closingSoon"]);
	const errors = strings(details["errors"]);
	const notes = strings(details["notes"]);
	return (
		<AppShell title={data.title ?? "Ranked shortlist"} badge="Rank" status={props.status}>
		<Hero
			title={`${num(details["eligibleCount"]) ?? shortlist.length} eligible · ${shortlist.length} shortlisted`}
			badge={<Badge>{shortlist.length} shortlisted</Badge>}
			meta={
				<>
					excluded {excluded.length} · deferred {num(details["deferredCount"]) ?? 0}
				</>
			}
		/>

			{(data.items ?? []).length > 0 ? (
				<Section title={`Shortlist (${(data.items ?? []).length})`}>
					{(data.items ?? []).map((item, index) => (
						<div
							key={`${item.title}-${index}`}
							className="rounded-[10px] border border-border bg-background p-3"
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<span className="text-sm font-medium">
									{item.title}
									{item.company ? ` at ${item.company}` : ""}
								</span>
								{item.score !== undefined || item.verdict ? (
									<Badge variant="outline">
										{item.score !== undefined ? `${item.score}/100` : ""}
										{item.score !== undefined && item.verdict ? " · " : ""}
										{item.verdict ?? ""}
									</Badge>
								) : null}
							</div>
							{item.score !== undefined ? <ScoreBar score={item.score} /> : null}
							{item.note ? <p className="mt-1 text-[13px] text-muted-foreground">{item.note}</p> : null}
							{item.url ? (
								<a
									className="mt-1 block text-[13px] break-all text-primary underline underline-offset-2"
									href={item.url}
									target="_blank"
									rel="noreferrer"
								>
									{item.url}
								</a>
							) : null}
							{item.action ? (
								<div className="mt-2">
									<ItemActionButton action={item.action} onAction={onAction} pending={pending} />
								</div>
							) : null}
						</div>
					))}
				</Section>
			) : null}

			{closingSoon.length > 0 ? (
				<Section title="Closing soon">
					{closingSoon.map((entry, index) => {
						const item = rec(entry);
						return (
							<p key={`closing-${index}`} className="text-sm leading-relaxed">
								<span className="font-medium">
									{text(item["title"], "Posting")}
									{text(item["company"]) !== "" ? ` at ${text(item["company"])}` : ""}
								</span>
								{text(item["deadline"]) !== "" ? ` — deadline ${text(item["deadline"])}` : ""}
							</p>
						);
					})}
				</Section>
			) : null}

		{notes.length > 0 ? (
			<Section title="Run notes">
				<BulletList items={notes} />
			</Section>
		) : null}

		{errors.length > 0 ? (
			<Notice variant="destructive" title="Run errors">
				<BulletList items={errors} />
			</Notice>
		) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
