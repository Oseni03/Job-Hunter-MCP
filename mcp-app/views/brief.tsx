import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface BriefViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

const TOPIC_LABELS: Record<string, string> = {
	company: "Company",
	role: "Role",
	salary: "Salary",
	culture: "Culture",
	interview: "Interview",
	news: "News",
};

export function BriefView(props: BriefViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const company = text(details["company"]);
	const role = text(details["role"]);
	const briefMode = details["briefMode"] === true;
	const snapshot = list(details["snapshot"]);
	const sourcing = rec(details["sourcing"]);
	const fitNotes = strings(details["fitNotes"]);
	const redFlags = strings(details["redFlags"]);
	const questions = strings(details["questionsToAsk"]);
	const queries = strings(details["suggestedQueries"]);
	const warnings = strings(details["warnings"]);
	return (
		<AppShell
			title={data.title ?? `Job brief: ${role || company || "role"}`}
			badge="Job Brief"
			status={props.status}
		>
			<Hero
				title={role !== "" && company !== "" ? `${role} at ${company}` : (role || company || "Job brief")}
				badge={
					redFlags.length > 0 ? (
						<Badge variant="destructive">
							{redFlags.length} red flag{redFlags.length === 1 ? "" : "s"}
						</Badge>
					) : (
						<Badge>
							{num(sourcing["sourcedCount"]) ?? 0} sourced
						</Badge>
					)
				}
				meta={
					<>
						{briefMode ? "Research brief — no findings yet" : `${snapshot.length} findings`} ·{" "}
						{num(sourcing["sourcedCount"]) ?? 0} sourced · {redFlags.length} red flags
					</>
				}
			/>

			{snapshot.length > 0 ? (
				<Section title={`Findings (${snapshot.length})`}>
					{snapshot.map((entry, index) => {
						const finding = rec(entry);
						const url = text(finding["sourceUrl"]);
						const topic = text(finding["topic"]);
						return (
							<div key={`finding-${index}`}>
								<p className="text-sm leading-relaxed">{text(finding["claim"], "Finding")}</p>
								<p className="mt-0.5 text-[13px] text-muted-foreground">
									{[TOPIC_LABELS[topic] ?? topic, text(finding["sourceLabel"])]
										.filter((part) => part !== "")
										.join(" · ")}
								</p>
								{url !== "" ? (
									<a
										className="mt-0.5 block text-[13px] break-all text-primary underline underline-offset-2"
										href={url}
										target="_blank"
										rel="noreferrer"
									>
										{url}
									</a>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

			{fitNotes.length > 0 ? (
				<Section title="Fit notes">
					<BulletList items={fitNotes} />
				</Section>
			) : null}

			{redFlags.length > 0 ? (
				<Notice variant="destructive" title="Red flags — verify before relying on this brief">
					<BulletList items={redFlags} />
				</Notice>
			) : null}

			{questions.length > 0 ? (
				<Section title="Questions to ask">
					<BulletList items={questions} />
				</Section>
			) : null}

			{briefMode && queries.length > 0 ? (
				<Section title="Suggested research">
					<BulletList items={queries} />
				</Section>
			) : null}

			{warnings.length > 0 ? (
				<Notice title="Warnings">
					<BulletList items={warnings} />
				</Notice>
			) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
