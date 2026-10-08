import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface CvViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

function statusGroup(coverage: unknown[], status: string): string {
	return coverage.filter((entry) => rec(entry)["status"] === status).length.toString();
}

export function CvView(props: CvViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const coverage = list(details["coverage"]);
	const warnings = rec(details["warnings"]);
	const verification = rec(details["verification"]);
	const signals = rec(details["signals"]);
	const drift = strings(warnings["draftDrift"]);
	const stretch = list(warnings["stretchChoices"]);
	const consistency = strings(warnings["profileConsistency"]);
	const bans = strings(details["banViolations"]);
	const notes = [
		text(warnings["reframingWarning"]),
		text(warnings["contactNote"]),
		text(warnings["evaluationNote"]),
		text(warnings["languageNote"]),
		text(warnings["pageCountNote"]),
	].filter((note) => note !== "");
	const renderPassed = (signals["renderSafety"] as { passed?: unknown } | undefined)?.passed;
	return (
		<AppShell title={data.title ?? "Tailored CV"} badge="Tailored CV" status={props.status}>
			<Hero
				title={text(details["slug"], "draft")}
				badge={
					<Badge variant={statusGroup(coverage, "gap") === "0" ? "secondary" : "destructive"}>
						{statusGroup(coverage, "matched")} matched · {statusGroup(coverage, "bridged")} bridged ·{" "}
						{statusGroup(coverage, "gap")} gaps
					</Badge>
				}
				meta={
					<>
						{text(details["template"], "fixed template")} · Puppeteer A4, target {num(details["pageLimit"]) ?? 2}{" "}
						pages
						{text(details["filePath"]) !== "" ? ` · ${text(details["filePath"])}` : ""}
						{typeof verification["compiles"] === "boolean" ? (
							<>
								{" "}· Verification: render {verification["compiles"] === true ? "safe" : "UNSAFE"} ·
								overlap{" "}
								{typeof verification["keywordOverlap"] === "number" ? verification["keywordOverlap"] : "?"} ·{" "}
								{verification["noNewEmployers"] === true
									? "no invented employers"
									: "POSSIBLE invented employers"}
							</>
						) : null}
					</>
				}
			/>

			{coverage.length > 0 ? (
				<Section title={`Requirement coverage (${coverage.length})`}>
					{coverage.map((entry, index) => {
						const item = rec(entry);
						const status = text(item["status"]);
						const evidence = text(item["evidence"]);
						return (
							<div
								key={`${text(item["requirement"], "requirement")}-${index}`}
								className="rounded-[10px] border border-border bg-background p-3"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<span className="text-sm font-medium">{text(item["requirement"], "Requirement")}</span>
									<span className="text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
										{status}
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

			{renderPassed !== undefined ? (
				<p className="px-0.5 text-xs text-muted-foreground">
					Render safety: {renderPassed === true ? "passed" : "check the details"}
				</p>
			) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
