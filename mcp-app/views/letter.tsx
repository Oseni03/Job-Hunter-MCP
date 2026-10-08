import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface LetterViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function LetterView(props: LetterViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const warnings = rec(details["warnings"]);
	const logistics = rec(details["logistics"]);
	const coverage = list(details["coverage"]);
	const wordCount = num(details["wordCount"]);
	const drift = strings(warnings["draftDrift"]);
	const stretch = list(warnings["stretchChoices"]);
	const consistency = strings(warnings["profileConsistency"]);
	const bans = strings(details["banViolations"]);
	const notes = [
		text(warnings["wordCountNote"]),
		text(warnings["provenanceNote"]),
		text(warnings["contactNote"]),
		text(warnings["evaluationNote"]),
		text(warnings["languageNote"]),
		text(warnings["pageCountNote"]),
	].filter((note) => note !== "");
	const logisticsParts = [
		text(logistics["workMode"]) !== "" ? text(logistics["workMode"]) : "",
		text(logistics["referenceId"]) !== "" ? `ref ${text(logistics["referenceId"])}` : "",
		text(logistics["deadline"]) !== "" ? `by ${text(logistics["deadline"])}` : "",
	].filter((part) => part !== "");
	return (
		<AppShell title={data.title ?? "Cover Letter"} badge="Cover Letter" status={props.status}>
		<Hero
			title={text(details["slug"], "draft")}
			badge={
				<Badge variant={wordCount !== undefined && wordCount >= 250 && wordCount <= 300 ? "secondary" : "destructive"}>
					{wordCount ?? "?"} words (band 250-300)
				</Badge>
			}
			meta={
				<>
					{text(details["template"], "fixed template")} to exactly 1 page
					{logisticsParts.length > 0 ? ` · ${logisticsParts.join(" · ")}` : ""}
					{text(details["filePath"]) !== "" ? ` · ${text(details["filePath"])}` : ""}
				</>
			}
		/>

			{coverage.length > 0 ? (
				<Section title={`Engaged requirements (${coverage.length})`}>
					{coverage.map((entry, index) => {
						const item = rec(entry);
						const evidence = text(item["evidence"]);
						return (
							<div
								key={`${text(item["requirement"], "requirement")}-${index}`}
								className="rounded-[10px] border border-border bg-background p-3"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<span className="text-sm font-medium">{text(item["requirement"], "Requirement")}</span>
									<span className="text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
										{text(item["status"])}
										{text(item["kind"]) !== "" ? ` · ${text(item["kind"])}` : ""}
									</span>
								</div>
								{evidence !== "" ? (
									<p className="mt-1 text-[13px] text-muted-foreground">Evidence: {evidence}</p>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

			{drift.length > 0 || stretch.length > 0 || consistency.length > 0 || bans.length > 0 || notes.length > 0 ? (
				<Section title="Review before submitting">
					<BulletList items={drift} />
					{stretch.map((entry, index) => {
						const choice = rec(entry);
						return (
							<p key={`stretch-${index}`} className="text-sm leading-relaxed">
								<span className="font-medium">{text(choice["bullet"], "Stretch")}</span>
								{text(choice["reason"]) !== "" ? ` — ${text(choice["reason"])}` : ""}
							</p>
						);
					})}
				<BulletList items={[...consistency, ...notes]} />
			</Section>
		) : null}

		{bans.length > 0 ? (
			<Notice variant="destructive" title="Template violations — fix before submitting">
				<BulletList items={bans} />
			</Notice>
		) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
