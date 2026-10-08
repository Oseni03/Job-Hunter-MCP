import { Children, Fragment, useState, type ReactNode } from "react";
import { ArrowRight, Briefcase, Check, ChevronDown, Copy, FileText, Info, TriangleAlert } from "lucide-react";

import type { ToolAction } from "../types.ts";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible.tsx";
import { Progress } from "../components/ui/progress.tsx";
import { Separator } from "../components/ui/separator.tsx";

/** App frame chrome (header, width, status). Tool-specific content lives in each view. */
export function AppShell(props: {
	title: string;
	badge: string;
	status?: string;
	children: React.ReactNode;
}): React.JSX.Element {
	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="mx-auto flex max-w-[880px] flex-col gap-3.5 px-4 py-5">
				<header className="flex flex-wrap items-center gap-2.5 px-0.5">
					<span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<Briefcase className="size-4" />
					</span>
					<h1 className="text-xl font-bold tracking-tight">{props.title}</h1>
					<Badge>{props.badge}</Badge>
					{props.status ? <span className="text-[13px] text-muted-foreground">{props.status}</span> : null}
				</header>
				{props.children}
			</div>
		</div>
	);
}

/** Hero header block: every view's summary card, built on the shadcn Card. */
export function Hero(props: {
	title: ReactNode;
	badge?: ReactNode;
	meta?: ReactNode;
	children?: ReactNode;
}): React.JSX.Element {
	return (
		<Card className="p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<span className="text-lg font-bold">{props.title}</span>
				{props.badge}
			</div>
			{props.meta ? <div className="mt-2 text-[13px] text-muted-foreground">{props.meta}</div> : null}
			{props.children}
		</Card>
	);
}

/** Warning/notice callout built on the shadcn Alert. */
export function Notice(props: {
	variant?: "default" | "destructive";
	title?: string;
	children?: ReactNode;
}): React.JSX.Element {
	const Icon = props.variant === "destructive" ? TriangleAlert : Info;
	return (
		<Alert variant={props.variant}>
			<Icon aria-hidden="true" />
			{props.title ? <AlertTitle>{props.title}</AlertTitle> : null}
			{props.children ? <AlertDescription>{props.children}</AlertDescription> : null}
		</Alert>
	);
}

export function Section(props: { title: string; children: React.ReactNode }): React.JSX.Element {
	const items = (Children.toArray(props.children) as ReactNode[]).filter(
		(child) => child !== null && child !== undefined && child !== false && child !== true,
	);
	return (
		<Card className="p-4">
			<CardTitle>{props.title}</CardTitle>
			<CardContent className="mt-2.5 flex flex-col gap-2.5">
				{items.map((child, index) => (
					<Fragment key={index}>
						{index > 0 ? <Separator className="opacity-70" /> : null}
						{child}
					</Fragment>
				))}
			</CardContent>
		</Card>
	);
}

export function ActionBar(props: {
	actions: ToolAction[];
	onAction: (action: ToolAction) => void;
	pending: string | null;
}): React.JSX.Element | null {
	if (props.actions.length === 0) return null;
	return (
		<Card className="p-4">
			<CardTitle>Next steps</CardTitle>
			<CardContent className="mt-2.5">
				<div className="flex flex-wrap gap-2">
					{props.actions.map((action, index) => {
						const busy = props.pending !== null;
						return (
							<Button
								key={`${index}-${action.tool}-${action.label.slice(0, 24)}`}
								className="justify-start text-left"
								disabled={busy}
								onClick={() => props.onAction(action)}
							>
								<span className="flex-1">
									{props.pending === action.label ? "Working…" : action.label}
								</span>
								<ArrowRight />
							</Button>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}

export function ItemActionButton(props: {
	action: ToolAction;
	onAction: (action: ToolAction) => void;
	pending: string | null;
}): React.JSX.Element {
	return (
		<Button
			variant="ghost"
			size="sm"
			disabled={props.pending !== null}
			onClick={() => props.onAction(props.action)}
		>
			{props.pending === props.action.label ? "Working…" : props.action.label}
			<ArrowRight />
		</Button>
	);
}

function DetailValue(props: { value: unknown; label?: string }): React.JSX.Element {
	const { value, label } = props;
	if (value === null || value === undefined || value === "") {
		return <span className="text-sm text-muted-foreground">Not provided</span>;
	}
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">{String(value)}</span>;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return <span className="text-sm text-muted-foreground">None</span>;
		return (
			<ul className="flex flex-col gap-2 border-l border-border pl-3">
				{value.map((entry, index) => (
					<li key={`${label ?? "item"}-${index}`}>
						<DetailValue value={entry} />
					</li>
				))}
			</ul>
		);
	}
	if (typeof value === "object") {
		return (
			<dl className="grid gap-2.5">
				{Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
					<div key={key} className="grid gap-1 sm:grid-cols-[minmax(120px,0.35fr)_1fr] sm:gap-3">
						<dt className="text-xs font-semibold text-muted-foreground">
							{key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}
						</dt>
						<dd><DetailValue label={key} value={entry} /></dd>
					</div>
				))}
			</dl>
		);
	}
	return <span className="text-sm">{String(value)}</span>;
}

export function DetailsCard(props: { markdown?: string; details?: unknown }): React.JSX.Element | null {
	const [copied, setCopied] = useState(false);
	const payload = props.details !== undefined ? props.details : props.markdown;
	if (payload === undefined) return null;
	async function copy(): Promise<void> {
		if (!props.markdown || typeof navigator === "undefined" || !navigator.clipboard) return;
		try {
			await navigator.clipboard.writeText(props.markdown);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			setCopied(false);
		}
	}
	return (
		<Card className="p-4">
			<CardHeader>
				<CardTitle>Details</CardTitle>
				{props.markdown ? (
					<Button variant="ghost" size="icon" onClick={() => void copy()} aria-label="Copy details">
						{copied ? <Check /> : <Copy />}
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="max-h-[32rem] overflow-auto">
				<DetailValue value={payload} />
			</CardContent>
		</Card>
	);
}

export function StatusCard(props: { title: string; message: string }): React.JSX.Element {
	return (
		<div className="min-h-screen bg-background font-sans text-foreground">
			<div className="mx-auto flex max-w-[880px] flex-col gap-3.5 px-4 py-5">
				<Card className="p-4">
					<CardTitle>{props.title}</CardTitle>
					<CardContent className="mt-2">
						<p className="text-sm leading-relaxed text-muted-foreground">{props.message}</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export function ScoreBar(props: { score: number }): React.JSX.Element {
	return <Progress value={props.score} className="mt-2" />;
}

export function BulletList(props: { items: string[] }): React.JSX.Element | null {
	if (props.items.length === 0) return null;
	return (
		<ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
			{props.items.map((item, index) => (
				<li key={`${item.slice(0, 40)}-${index}`}>{item}</li>
			))}
		</ul>
	);
}

export function CollapsibleText(props: { title: string; body: string }): React.JSX.Element {
	return (
		<Collapsible asChild>
			<Card className="overflow-hidden p-0">
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="group flex w-full cursor-pointer items-center gap-2 px-4 py-3.5 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<FileText className="size-4 text-muted-foreground" />
						<span className="flex-1">{props.title}</span>
						<ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent className="px-4 pb-4">
					<pre className="max-h-64 overflow-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
						{props.body}
					</pre>
				</CollapsibleContent>
			</Card>
		</Collapsible>
	);
}
