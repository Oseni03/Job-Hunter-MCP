import type { DashboardData, ToolAction } from "../types.ts";
import { list, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface StrategyViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function StrategyView(props: StrategyViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const directions = list(details["directions"]);
	const priorityGaps = strings(details["priorityGaps"]);
	const avoided = strings(details["avoidNotes"]);
	const skipped = strings(details["skipped"]);
	const frameworkNote = text(details["frameworkNote"]);
	return (
		<AppShell title={data.title ?? "Career strategy"} badge="Strategy" status={props.status}>
		<Hero
			title={`${directions.length} grounded direction${directions.length === 1 ? "" : "s"}`}
			badge={
				priorityGaps.length > 0 ? (
					<Badge variant="destructive">{priorityGaps.length} priority gaps</Badge>
				) : (
					<Badge>{directions.length} directions</Badge>
				)
			}
			meta={
				priorityGaps.length > 0 || frameworkNote !== "" ? (
					<>
						{priorityGaps.length > 0 ? <>Priority gaps: {priorityGaps.join("; ")}</> : null}
						{frameworkNote !== "" ? <>{priorityGaps.length > 0 ? " · " : ""}{frameworkNote}</> : null}
					</>
				) : undefined
			}
		/>

			{directions.length > 0 ? (
				<Section title="Directions">
					{directions.map((entry, index) => {
						const direction = rec(entry);
						const why = strings(direction["why"]);
						const evidence = strings(direction["evidence"]);
						const gapsToClose = strings(direction["gapsToClose"]);
						const dimensions = strings(direction["dimensions"]);
						return (
							<div key={`${text(direction["direction"], "direction")}-${index}`}>
								<p className="text-sm font-medium">{text(direction["direction"], "Direction")}</p>
								{why.length > 0 ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">Why: {why.join("; ")}</p>
								) : null}
								{evidence.length > 0 ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">Evidence: {evidence.join("; ")}</p>
								) : null}
								{gapsToClose.length > 0 ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">
										Gaps to close: {gapsToClose.join("; ")}
									</p>
								) : null}
								{dimensions.length > 0 ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">
										Dimensions: {dimensions.join(", ")}
									</p>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

		{avoided.length > 0 || skipped.length > 0 ? (
			<Notice title="Ruled out">
				<BulletList items={[...avoided, ...skipped.map((item) => `Skipped: ${item}`)]} />
			</Notice>
		) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
