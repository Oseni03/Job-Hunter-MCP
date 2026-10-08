import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, CollapsibleText, DetailsCard, Hero, ScoreBar, Section } from "./_shared.tsx";

export interface AnalysisViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function AnalysisView(props: AnalysisViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const verdict = text(details["verdict"]) || text(data.summary?.split("·")[0]) || "Not scored";
	const score = num(details["overallScore"]);
	const eligibility = rec(details["eligibility"]);
	const languageGate = rec(details["languageGate"]);
	const dimensions = list(details["dimensions"]);
	const strengths = strings(details["strengths"]);
	const gaps = strings(details["gaps"]);
	const recommendation = text(details["recommendation"]);
	const call = rec(details["shouldCallEmployer"]);
	const deadline = text(details["deadline"]);
	const refinement = rec(details["refinement"]);
	return (
		<AppShell title={data.title ?? "Job Fit Evaluation"} badge="Analysis" status={props.status}>
			<Hero
				title={verdict}
				badge={score !== undefined ? <Badge>{score}/100</Badge> : undefined}
				meta={
					<>
						Eligibility {text(eligibility["verdict"], "?")} · Language {text(languageGate["verdict"], "?")}
						{deadline !== "" ? ` · Deadline ${deadline}` : ""}
					</>
				}
			>
				{score !== undefined ? <ScoreBar score={score} /> : null}
			</Hero>

			{dimensions.length > 0 ? (
				<Section title="Dimensions">
					{dimensions.map((entry, index) => {
						const dimension = rec(entry);
						const dimScore = num(dimension["score"]);
						return (
							<div key={`${text(dimension["dimension"], "dimension")}-${index}`}>
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<span className="text-sm font-medium">{text(dimension["dimension"], "Dimension")}</span>
									{dimScore !== undefined ? (
										<span className="text-[13px] font-semibold text-muted-foreground">{dimScore}/100</span>
									) : null}
								</div>
								{dimScore !== undefined ? <ScoreBar score={dimScore} /> : null}
								{text(dimension["notes"]) !== "" ? (
									<p className="mt-1 text-[13px] text-muted-foreground">{text(dimension["notes"])}</p>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

			{strengths.length > 0 || gaps.length > 0 ? (
				<Section title="Strengths and gaps">
					{strengths.length > 0 ? (
						<div>
							<p className="text-xs font-semibold text-muted-foreground">Strengths</p>
							<BulletList items={strengths} />
						</div>
					) : null}
					{gaps.length > 0 ? (
						<div>
							<p className="text-xs font-semibold text-muted-foreground">Gaps</p>
							<BulletList items={gaps} />
						</div>
					) : null}
				</Section>
			) : null}

			{recommendation !== "" ? (
				<Section title="Recommendation">
					<p className="text-sm leading-relaxed">{recommendation}</p>
				</Section>
			) : null}

			{call["suggest"] === true && text(call["reason"]) !== "" ? (
				<Section title="Employer contact">
					<p className="text-sm leading-relaxed">Call the employer: {text(call["reason"])}</p>
				</Section>
			) : null}

			{text(refinement["note"]) !== "" ? (
				<p className="px-0.5 text-xs text-muted-foreground">
					Refinement: {text(refinement["note"])}
					{text(refinement["model"]) !== "" ? ` (model ${text(refinement["model"])})` : ""}
				</p>
			) : null}

			{data.description ? <CollapsibleText title="Job description" body={data.description} /> : null}
			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
