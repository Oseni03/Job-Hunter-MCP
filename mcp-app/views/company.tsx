import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface CompanyViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function CompanyView(props: CompanyViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const claims = list(details["claims"]);
	const sourcing = rec(details["sourcing"]);
	const fetchSteps = strings(details["fetchSteps"]);
	const trustNote = text(details["trustNote"]);
	return (
		<AppShell
			title={data.title ?? `Company research: ${text(details["company"], "company")}`}
			badge="Research"
			status={props.status}
		>
			<Hero
				title={text(details["company"], "Company")}
				badge={<Badge>{details["cached"] === true ? "Cache hit" : "Fresh research"}</Badge>}
				meta={
					<>
						{details["cached"] === true ? "Cache hit" : "Fresh research"} · {claims.length} sourced claims
						{text(details["cacheFile"]) !== "" ? ` · ${text(details["cacheFile"])}` : ""}
					</>
				}
			/>

			{claims.length > 0 ? (
				<Section title={`Sourced claims (${claims.length})`}>
					{claims.map((entry, index) => {
						const claim = rec(entry);
						const url = text(claim["sourceUrl"]);
						return (
							<div key={`claim-${index}`}>
								<p className="text-sm leading-relaxed">{text(claim["text"], "Claim")}</p>
								{url !== "" ? (
									<a
										className="mt-0.5 block text-[13px] break-all text-primary underline underline-offset-2"
										href={url}
										target="_blank"
										rel="noreferrer"
									>
										Sourced from {url} ({text(claim["sourcedFrom"], "fetched page")})
									</a>
								) : (
									<div className="mt-1.5">
										<Notice variant="destructive" title="No source URL — do not cite this claim." />
									</div>
								)}
							</div>
						);
					})}
				</Section>
			) : null}

			<Section title="Sourcing">
				<p className="text-sm leading-relaxed">
					{num(sourcing["sourcedCount"]) ?? 0} sourced · {num(sourcing["droppedCount"]) ?? 0} dropped
				</p>
				{trustNote !== "" ? <p className="text-[13px] text-muted-foreground">{trustNote}</p> : null}
				{fetchSteps.length > 0 ? (
					<p className="text-[13px] text-muted-foreground">Fetch: {fetchSteps.join(" > ")}</p>
				) : null}
			</Section>

			{strings(details["notes"]).length > 0 ? (
				<Section title="Notes">
					<BulletList items={strings(details["notes"])} />
				</Section>
			) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
