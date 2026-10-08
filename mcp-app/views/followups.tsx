import type { DashboardData, ToolAction } from "../types.ts";
import { rec, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, DetailsCard, Hero, ItemActionButton, Section } from "./_shared.tsx";

export interface FollowupsViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function FollowupsView(props: FollowupsViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const items = data.items ?? [];
	return (
		<AppShell title={data.title ?? "Due follow-ups"} badge="Follow-ups" status={props.status}>
		<Hero
			title={items.length > 0 ? `${items.length} due` : "Nothing due"}
			badge={
				items.length > 0 ? (
					<Badge variant="destructive">
						{items.length} due
					</Badge>
				) : (
					<Badge>Clear</Badge>
				)
			}
			meta={
				<>
					{items.length > 0
						? text(details["note"], "Open rows untouched past the threshold or with a near deadline.")
						: "No open application is stale or near deadline."}
				</>
			}
		/>

			{items.length > 0 ? (
				<Section title={`Due (${items.length})`}>
					{items.map((item, index) => (
						<div
							key={`${item.title}-${index}`}
							className="rounded-[10px] border border-border bg-background p-3"
						>
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<span className="text-sm font-medium">{item.title}</span>
							{item.verdict ? <Badge variant="outline">{item.verdict}</Badge> : null}
						</div>
							{item.note ? <p className="mt-1 text-[13px] text-muted-foreground">{item.note}</p> : null}
							{item.action ? (
								<div className="mt-2">
									<ItemActionButton action={item.action} onAction={onAction} pending={pending} />
								</div>
							) : null}
						</div>
					))}
				</Section>
			) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
