import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles, type App } from "@modelcontextprotocol/ext-apps/react";

import { SAMPLE_CALLS, SAMPLE_TOOLS } from "./samples.ts";
import { TOOL_LABELS, TOOL_VIEWS, mapToolToDashboard } from "./toolviews.ts";
import type { DashboardData, DashboardView, ToolAction } from "./types.ts";
import { AnalysisView } from "./views/analysis.tsx";
import { AnswersView } from "./views/answers.tsx";
import { BriefView } from "./views/brief.tsx";
import { CompanyView } from "./views/company.tsx";
import { CvView } from "./views/cv.tsx";
import { FollowupsView } from "./views/followups.tsx";
import { InterviewView } from "./views/interview.tsx";
import { LetterView } from "./views/letter.tsx";
import { ProfileView } from "./views/profile.tsx";
import { RankView } from "./views/rank.tsx";
import { SearchView } from "./views/search.tsx";
import { StrategyView } from "./views/strategy.tsx";
import { TrackView } from "./views/track.tsx";
import { UnknownView } from "./views/unknown.tsx";
import { StatusCard } from "./views/_shared.tsx";
import { Card } from "./components/ui/card.tsx";
import { Label } from "./components/ui/label.tsx";
import "./styles.css";

const APP_INFO = { name: "job-hunter-dashboard", version: "1.0.0" } as const;

type ViewProps = {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
};

/**
 * One view per tool, unique to its output. Unknown tools land on the
 * fallback view with their markdown text; there is no universal tool UI.
 */
const VIEW_COMPONENTS: Record<DashboardView, (props: ViewProps) => React.JSX.Element> = {
	analysis: AnalysisView,
	cv: CvView,
	letter: LetterView,
	track: TrackView,
	interview: InterviewView,
	strategy: StrategyView,
	answers: AnswersView,
	rank: RankView,
	research: CompanyView,
	brief: BriefView,
	search: SearchView,
	profile: ProfileView,
	followups: FollowupsView,
	overview: UnknownView,
};

function viewForTool(toolName: string | null): DashboardView {
	if (!toolName) return "overview";
	return TOOL_VIEWS[toolName] ?? "overview";
}

function isMcpHost(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.location.origin === "null" || window.parent !== window;
	} catch {
		return true;
	}
}

function toolNameFromContext(context: unknown): string | null {
	if (typeof context !== "object" || context === null) return null;
	const toolInfo = (context as { toolInfo?: { tool?: { name?: unknown } } }).toolInfo;
	const name = toolInfo?.tool?.name;
	return typeof name === "string" && name !== "" ? name : null;
}

function resultText(result: { content?: unknown } | null): string | null {
	if (!result || !Array.isArray(result.content)) return null;
	for (const block of result.content) {
		if (typeof block !== "object" || block === null) continue;
		const entry = block as { type?: unknown; text?: unknown };
		if (entry.type === "text" && typeof entry.text === "string") return entry.text;
	}
	return null;
}

function initialStandaloneTool(): (typeof SAMPLE_TOOLS)[number] {
	try {
		const tool = new URLSearchParams(window.location.search).get("tool");
		if (tool && (SAMPLE_TOOLS as readonly string[]).includes(tool)) {
			return tool as (typeof SAMPLE_TOOLS)[number];
		}
	} catch {
		// Ignore malformed URLs and fall through to the default tool.
	}
	return "analyze-job";
}

function StandaloneApp(): React.JSX.Element {
	const [tool, setTool] = useState<(typeof SAMPLE_TOOLS)[number]>(initialStandaloneTool);
	const [note, setNote] = useState<string | null>(null);
	const sample = SAMPLE_CALLS[tool];
	const data = mapToolToDashboard(tool, sample.args, sample.structured, sample.text);
	const View = VIEW_COMPONENTS[viewForTool(tool)];
	return (
		<>
			<div className="min-h-screen bg-background font-sans text-foreground">
				<div className="mx-auto flex max-w-[880px] flex-col gap-3.5 px-4 py-5">
				<Card className="flex flex-wrap items-center gap-2.5 p-4">
					<Label htmlFor="jh-tool">Previewing tool output</Label>
					<select
						id="jh-tool"
						className="h-8 max-w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
						value={tool}
						onChange={(event) => setTool(event.target.value as (typeof SAMPLE_TOOLS)[number])}
					>
							{SAMPLE_TOOLS.map((name) => (
								<option key={name} value={name}>
									{TOOL_LABELS[name] ?? name}
								</option>
							))}
						</select>
					</Card>
				</div>
			</div>
			<View
				data={data}
				status={note ?? "Standalone preview with sample data"}
				onAction={(step) => setNote(`Preview only — this step runs when connected: ${step.label}`)}
				pending={null}
			/>
		</>
	);
}

interface ToolResultState {
	structuredContent?: unknown;
	content?: unknown;
	isError?: boolean;
}

function McpApp(): React.JSX.Element {
	const [toolName, setToolName] = useState<string | null>(null);
	const [toolArgs, setToolArgs] = useState<unknown>(null);
	const [toolResult, setToolResult] = useState<ToolResultState | null>(null);
	const [status, setStatus] = useState("Connecting to host…");
	const [cancelled, setCancelled] = useState<string | null>(null);
	const [calling, setCalling] = useState<string | null>(null);
	const appRef = useRef<App | null>(null);

	function refreshToolName(app: App | null): void {
		const name = app ? toolNameFromContext(app.getHostContext()) : null;
		if (name) setToolName(name);
	}

	const { app, isConnected, error } = useApp({
		appInfo: { ...APP_INFO },
		capabilities: {},
		onAppCreated: (created) => {
			// Register every handler BEFORE connect() so no notification is missed.
			appRef.current = created;
			created.addEventListener("toolinput", (params) => {
				setCancelled(null);
				setToolArgs(params.arguments ?? null);
				refreshToolName(created);
				setStatus("Tool input received");
			});
			created.addEventListener("toolinputpartial", () => {
				setStatus("Streaming results…");
			});
			created.addEventListener("toolresult", (params) => {
				setCancelled(null);
				setToolResult(params);
				setStatus(params.isError ? "Tool reported an error" : "Results ready");
			});
			created.addEventListener("toolcancelled", (params) => {
				setCancelled(params.reason ?? "cancelled");
				setStatus("Tool cancelled");
			});
			created.addEventListener("hostcontextchanged", (ctx) => {
				const name = toolNameFromContext(ctx);
				if (name) setToolName(name);
				const insets = (ctx as { safeAreaInsets?: { top?: number; right?: number; bottom?: number; left?: number } })
					.safeAreaInsets;
				if (insets) {
					document.body.style.padding = `${insets.top ?? 0}px ${insets.right ?? 0}px ${insets.bottom ?? 0}px ${insets.left ?? 0}px`;
				}
			});
		},
	});

	useHostStyles(app, app?.getHostContext());

	useEffect(() => {
		if (isConnected) refreshToolName(app);
	}, [isConnected, app]);

	const displayStatus = cancelled ? `Cancelled (${cancelled})` : status;

	/**
	 * Next steps invoke MCP tools, never external actions. Preferred path is
	 * `callServerTool` (host-proxied, same server); hosts without the
	 * serverTools capability fall back to asking the assistant to run the
	 * same tool with the same args. A successful call switches the UI to
	 * the called tool's own view with its fresh output.
	 */
	async function handleAction(action: ToolAction): Promise<void> {
		const current = appRef.current;
		if (!current) return;
		setCalling(action.label);
		setStatus(`Calling ${action.tool}…`);
		try {
			if (current.getHostCapabilities()?.serverTools) {
				const result = await current.callServerTool({
					name: action.tool,
					arguments: action.args ?? {},
				});
				setToolName(action.tool);
				setToolArgs(action.args ?? null);
				setToolResult(result);
				setCancelled(null);
				setStatus(result.isError ? "Tool reported an error" : "Results ready");
			} else {
				const argText =
					action.args && Object.keys(action.args).length > 0 ? ` with ${JSON.stringify(action.args)}` : "";
				await current.sendMessage({
					role: "user",
					content: [{ type: "text", text: `Run the ${action.tool} tool${argText}.` }],
				});
				setStatus(`Asked the assistant to run ${action.tool}`);
			}
		} catch {
			setStatus(`Could not reach ${action.tool}; try again`);
		} finally {
			setCalling(null);
		}
	}

	if (error) {
		return <StatusCard title="Connection failed" message={`Could not connect to the MCP host: ${error.message}.`} />;
	}

	if (!isConnected || (!toolArgs && !toolResult)) {
		return (
			<StatusCard
				title="Waiting for results"
				message="The assistant has not sent tool results yet. Run a job-hunter tool and its outcome renders here."
			/>
		);
	}

	const data = mapToolToDashboard(
		toolName ?? "unknown-tool",
		toolArgs,
		toolResult?.structuredContent ?? null,
		resultText(toolResult),
	);
	const View = VIEW_COMPONENTS[viewForTool(toolName)];
	return <View data={data} onAction={(action) => void handleAction(action)} pending={calling} status={displayStatus} />;
}

function Root(): React.JSX.Element {
	// Branch once at startup: standalone keeps its sample sources intact while
	// MCP mode reads exclusively from the tool lifecycle.
	return isMcpHost() ? <McpApp /> : <StandaloneApp />;
}

const root = document.getElementById("root");
if (!root) {
	throw new Error("Dashboard root element is missing.");
}
createRoot(root).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);
