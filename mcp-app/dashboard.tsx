import { useState } from "react";
import { ArrowRight, Briefcase, Check, ChevronDown, Copy, FileText } from "lucide-react";

import { VIEW_LABELS, type DashboardData, type DashboardView } from "./types.ts";
import { Badge } from "./components/ui/badge.tsx";
import { Button } from "./components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./components/ui/collapsible.tsx";

function clampScore(score: number): number {
	if (Number.isNaN(score)) return 0;
	return Math.min(100, Math.max(0, Math.round(score)));
}

export function Dashboard(props: {
	data: DashboardData;
	status?: string;
	onAction?: (action: string) => void;
}): React.JSX.Element {
	const { data, status, onAction } = props;
	const view: DashboardView = data.view ?? "overview";
	const items = data.items ?? [];
	const actions = data.actions ?? [];
	const [copied, setCopied] = useState(false);

	async function copyDetails(): Promise<void> {
		if (!data.markdown || typeof navigator === "undefined" || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(data.markdown);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			setCopied(false);
		}
	}

	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="mx-auto flex max-w-[880px] flex-col gap-3.5 px-4 py-5">
				<header className="flex flex-wrap items-center gap-2.5 px-0.5">
					<span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<Briefcase className="size-4" />
					</span>
					<h1 className="text-xl font-bold tracking-tight">{data.title || "Job Hunter Dashboard"}</h1>
					<Badge>{VIEW_LABELS[view]}</Badge>
					{status ? <span className="text-[13px] text-muted-foreground">{status}</span> : null}
				</header>

				{data.summary ? (
					<Card className="p-4">
						<CardTitle>Summary</CardTitle>
						<CardContent className="mt-2">
							<p className="text-sm leading-relaxed whitespace-pre-wrap">{data.summary}</p>
						</CardContent>
					</Card>
				) : null}

				{data.description ? (
					<Collapsible asChild>
						<Card className="overflow-hidden p-0">
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="group flex w-full cursor-pointer items-center gap-2 px-4 py-3.5 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<FileText className="size-4 text-muted-foreground" />
									<span className="flex-1">Job description</span>
									<ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="px-4 pb-4">
								<pre className="max-h-64 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
									{data.description}
								</pre>
							</CollapsibleContent>
						</Card>
					</Collapsible>
				) : null}

				{items.length > 0 ? (
					<Card className="p-4">
						<CardTitle>{items.length === 1 ? "Result" : `Results (${items.length})`}</CardTitle>
						<CardContent className="mt-2.5">
							<ul className="flex flex-col gap-2.5">
								{items.map((item, index) => (
									<li
										key={`${item.title}-${index}`}
										className="rounded-[10px] border border-border bg-background p-3"
									>
										<div className="flex flex-wrap items-baseline justify-between gap-2">
											<span className="text-sm font-medium">
												{item.title}
												{item.company ? ` at ${item.company}` : ""}
											</span>
											{item.score !== undefined || item.verdict ? (
												<span className="text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
													{item.score !== undefined ? `${clampScore(item.score)}/100` : ""}
													{item.score !== undefined && item.verdict ? " · " : ""}
													{item.verdict ?? ""}
												</span>
											) : null}
										</div>
										{item.score !== undefined ? (
											<div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
												<div className="h-full rounded-full bg-primary" style={{ width: `${clampScore(item.score)}%` }} />
											</div>
										) : null}
										{item.note ? <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{item.note}</p> : null}
										{item.url ? (
											<a
												className="mt-1 block text-[13px] break-all text-primary underline underline-offset-2"
												href={item.url}
												target="_blank"
												rel="noreferrer"
											>
												{item.url}
											</a>
										) : null}
									</li>
								))}
							</ul>
						</CardContent>
					</Card>
				) : null}

				{data.markdown ? (
					<Card className="p-4">
						<CardHeader>
							<CardTitle>Details</CardTitle>
							<Button variant="ghost" size="icon" onClick={() => void copyDetails()} aria-label="Copy details">
								{copied ? <Check /> : <Copy />}
							</Button>
						</CardHeader>
						<CardContent>
							<pre className="max-h-80 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
								{data.markdown}
							</pre>
						</CardContent>
					</Card>
				) : null}

				{actions.length > 0 ? (
					<Card className="p-4">
						<CardTitle>Suggested next steps</CardTitle>
						<CardContent className="mt-2.5">
							<div className="flex flex-wrap gap-2">
								{actions.map((action, index) => (
									<Button
										key={`${index}-${action.slice(0, 24)}`}
										className="justify-start text-left"
										onClick={() => onAction?.(action)}
									>
										<span className="flex-1">{action}</span>
										<ArrowRight />
									</Button>
								))}
							</div>
						</CardContent>
					</Card>
				) : null}

				{!data.summary && !data.description && items.length === 0 && !data.markdown ? (
					<Card className="p-4">
						<CardTitle>Waiting for results</CardTitle>
						<CardContent className="mt-2">
							<p className="text-sm leading-relaxed text-muted-foreground">
								The assistant has not sent dashboard data yet. Run a job-hunter tool (for example
								analyze-job, rank-jobs, or search-jobs) and its outcome renders here.
							</p>
						</CardContent>
					</Card>
				) : null}
			</div>
		</div>
	);
}
