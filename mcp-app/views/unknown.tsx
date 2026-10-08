import type { DashboardData, ToolAction } from "../types.ts";
import { Card, CardContent } from "../components/ui/card.tsx";
import { ActionBar, AppShell, DetailsCard } from "./_shared.tsx";

export interface UnknownViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

/** Fallback for tools the app does not know yet: title plus raw text, no invented sections. */
export function UnknownView(props: UnknownViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	return (
		<AppShell title={data.title ?? "Result"} badge="Overview" status={props.status}>
		{data.markdown ? (
			<Card className="p-4">
				<CardContent className="max-h-96 overflow-auto">
					<pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
						{data.markdown}
					</pre>
				</CardContent>
			</Card>
		) : null}
			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
