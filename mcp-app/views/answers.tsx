import { useState } from "react";
import { Check, Copy } from "lucide-react";

import type { DashboardData, ToolAction } from "../types.ts";
import { list, num, rec, strings, text } from "../toolviews.ts";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";

export interface AnswersViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function AnswersView(props: AnswersViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const intros = list(details["selfIntros"]);
	const projects = list(details["projectEntries"]);
	const pitches = list(details["pitches"]);
	const ungrounded = strings(details["ungrounded"]);
	const copyPasteText = text(details["copyPasteText"]);
	const [copied, setCopied] = useState(false);
	async function copyAnswers(): Promise<void> {
		if (copyPasteText === "" || typeof navigator === "undefined" || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(copyPasteText);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			setCopied(false);
		}
	}
	return (
		<AppShell title={data.title ?? "Application answers"} badge="Answers" status={props.status}>
			<Hero
				title={`${intros.length} self-intros · ${projects.length} project entries · ${pitches.length} pitches`}
				meta={text(details["filePath"]) !== "" ? <>{text(details["filePath"])}</> : undefined}
			/>

			{intros.length > 0 ? (
				<Section title="Self-intros">
					{intros.map((entry, index) => {
						const intro = rec(entry);
						const target = intro["targetWords"];
						return (
							<div key={`intro-${index}`}>
								<p className="text-sm font-medium">Self-intro ({text(intro["roleType"], "general")})</p>
								<p className="mt-0.5 text-[13px] text-muted-foreground">
									{num(intro["wordCount"]) ?? "?"} words
									{typeof target === "number" ? ` (target ${target})` : ""}
									{text(intro["trimNote"]) !== "" ? ` · ${text(intro["trimNote"])}` : ""}
								</p>
								{text(intro["text"]) !== "" ? (
									<p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{text(intro["text"])}</p>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

			{pitches.length > 0 ? (
				<Section title="Pitches">
					{pitches.map((entry, index) => {
						const pitch = rec(entry);
						return (
							<div key={`pitch-${index}`}>
								<p className="text-sm font-medium">
									Pitch ({text(pitch["context"], "general")})
									{pitch["recommended"] === true ? " · recommended" : ""}
								</p>
								<p className="mt-0.5 text-[13px] text-muted-foreground">
									{num(pitch["charCount"]) ?? "?"} chars
								</p>
								{text(pitch["text"]) !== "" ? (
									<p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{text(pitch["text"])}</p>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

			{ungrounded.length > 0 ? (
				<Notice variant="destructive" title="Ungrounded claims — resolve before pasting">
					<BulletList items={ungrounded} />
				</Notice>
			) : null}

			{copyPasteText !== "" ? (
				<Card className="p-4">
					<CardHeader>
						<CardTitle>Portal text</CardTitle>
						<Button variant="ghost" size="icon" onClick={() => void copyAnswers()} aria-label="Copy portal text">
							{copied ? <Check /> : <Copy />}
						</Button>
					</CardHeader>
					<CardContent className="max-h-72 overflow-auto">
						<pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">{copyPasteText}</pre>
					</CardContent>
				</Card>
			) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
