import type { DashboardData, ToolAction } from "../types.ts";
import { num, rec, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface TrackViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function TrackView(props: TrackViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const action = text(details["action"], "record");
	const hash = text(details["trackerHash"]);
	const archiveFile = text(details["archiveFile"]);
	const archiveNote = text(details["archiveNote"]);
	const openMatches = num(details["openMatchCount"]) ?? 0;
	const rowIndex = details["rowIndex"];
	return (
		<AppShell title={data.title ?? "Record application"} badge="Application" status={props.status}>
		<Hero
			title={action === "append" ? "Appended tracker row" : "Updated tracker row"}
			badge={<Badge>{action === "append" ? "Appended" : "Updated"}</Badge>}
			meta={
				hash !== "" || typeof rowIndex === "number" ? (
					<>
						{hash !== "" ? <>Tracker hash {hash.slice(0, 8)}</> : null}
						{typeof rowIndex === "number" ? <>{hash !== "" ? " · " : ""}Row {rowIndex}</> : null}
					</>
				) : undefined
			}
		/>

			<Section title="Archive">
				{archiveFile !== "" ? (
					<p className="text-sm leading-relaxed">{archiveFile}</p>
				) : archiveNote !== "" ? (
					<p className="text-sm leading-relaxed text-muted-foreground">{archiveNote}</p>
				) : (
					<p className="text-sm text-muted-foreground">No archive location reported.</p>
				)}
		</Section>

		{openMatches > 1 ? (
			<Notice variant="destructive" title={`Deduplicate: ${openMatches} open rows match this company and role.`} />
		) : null}

			{text(details["row"]) !== "" ? (
				<Section title="Tracker row">
					<pre className="overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
						{text(details["row"])}
					</pre>
				</Section>
			) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
