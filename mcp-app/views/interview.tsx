import type { DashboardData, ToolAction } from "../types.ts";
import { list, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, CollapsibleText, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface InterviewViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function InterviewView(props: InterviewViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const questions = list(details["questions"]);
	const starMapping = list(details["starMapping"]);
	const missing = strings(details["missingLogistics"]);
	const tough = strings(details["toughQuestions"]);
	const toAsk = strings(details["questionsToAsk"]);
	const fallbacks = strings(details["fallbackNotes"]);
	const warnings = strings(details["warnings"]);
	const packMarkdown = text(details["packMarkdown"]);
	return (
		<AppShell title={data.title ?? "Interview prep"} badge="Interview" status={props.status}>
		<Hero
			title={text(details["stage"], "interview")}
			badge={
				<Badge>
					{questions.length} questions · {starMapping.length} STAR
				</Badge>
			}
			meta={
				<>
					{questions.length} likely questions · {starMapping.length} STAR examples mapped
					{text(details["packFile"]) !== "" ? ` · ${text(details["packFile"])}` : ""}
				</>
			}
		/>

			{questions.length > 0 ? (
				<Section title={`Likely questions (${questions.length})`}>
					{questions.map((entry, index) => {
						const question = rec(entry);
						const bridge = text(question["bridge"]);
						return (
							<div key={`${text(question["question"], "question").slice(0, 40)}-${index}`}>
								<p className="text-sm font-medium leading-relaxed">
									{index + 1}. {text(question["question"], "Question")}
								</p>
								<p className="mt-0.5 text-[13px] text-muted-foreground">
									Source: {text(question["source"], "general")}
									{bridge !== "" ? ` · Bridge: ${bridge}` : ""}
								</p>
							</div>
						);
					})}
				</Section>
			) : null}

			{starMapping.length > 0 ? (
				<Section title="STAR examples">
					{starMapping.map((entry, index) => {
						const example = rec(entry);
						const covers = strings(example["covers"]);
						const useFor = strings(example["useFor"]);
						return (
							<div key={`${text(example["title"], "example")}-${index}`}>
								<p className="text-sm font-medium">{text(example["title"], "Example")}</p>
								{covers.length > 0 ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">Covers: {covers.join("; ")}</p>
								) : null}
								{useFor.length > 0 ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">Use for: {useFor.join("; ")}</p>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

			{tough.length > 0 ? (
				<Section title="Tough questions">
					<BulletList items={tough} />
				</Section>
			) : null}

			{toAsk.length > 0 ? (
				<Section title="Questions to ask them">
					<BulletList items={toAsk} />
				</Section>
			) : null}

		{missing.length > 0 || fallbacks.length > 0 || warnings.length > 0 ? (
			<Notice title="Logistics gaps">
				{missing.length > 0 ? <p>Provide missing logistics: {missing.join(", ")}.</p> : null}
				<BulletList items={[...fallbacks, ...warnings]} />
			</Notice>
		) : null}

			{packMarkdown !== "" ? <CollapsibleText title="Prep pack" body={packMarkdown} /> : null}
			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
