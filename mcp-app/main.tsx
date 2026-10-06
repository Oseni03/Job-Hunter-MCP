import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp, useHostStyles, type App } from "@modelcontextprotocol/ext-apps/react";

import { Dashboard } from "./dashboard.tsx";
import { SAMPLE_CALLS, SAMPLE_TOOLS } from "./samples.ts";
import { TOOL_LABELS, mapToolToDashboard } from "./toolviews.ts";
import "./styles.css";

const APP_INFO = { name: "job-hunter-dashboard", version: "1.0.0" } as const;

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
	return (
		<>
			<div className="jh-root">
				<div className="jh-container">
					<div className="jh-card jh-picker">
						<label className="jh-label" htmlFor="jh-tool">
							Previewing tool output
						</label>
						<select
							id="jh-tool"
							className="jh-select"
							value={tool}
							onChange={(event) => setTool(event.target.value as (typeof SAMPLE_TOOLS)[number])}
						>
							{SAMPLE_TOOLS.map((name) => (
								<option key={name} value={name}>
									{TOOL_LABELS[name] ?? name}
								</option>
							))}
						</select>
					</div>
				</div>
			</div>
			<Dashboard
				data={data}
				status={note ?? "Standalone preview with sample data"}
				onAction={(step) => setNote(`Preview only — this step runs when connected: ${step.slice(0, 90)}`)}
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
				refreshToolName(created);
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

	function requestStep(step: string): void {
		const app = appRef.current;
		if (!app) return;
		void app
			.sendMessage({ role: "user", content: [{ type: "text", text: step }] })
			.catch(() => {});
	}

	if (error) {
		return (
			<>
				<div className="jh-root">
					<div className="jh-container">
						<div className="jh-error" role="alert">
							Could not connect to the MCP host: {error.message}.
						</div>
					</div>
				</div>
				<Dashboard data={{ view: "overview" }} status={displayStatus} />
			</>
		);
	}

	if (!isConnected || (!toolArgs && !toolResult)) {
		return <Dashboard data={{ view: "overview" }} status={displayStatus} />;
	}

	return (
		<Dashboard
			data={mapToolToDashboard(
				toolName ?? "unknown-tool",
				toolArgs,
				toolResult?.structuredContent ?? null,
				resultText(toolResult),
			)}
			status={toolName ? undefined : displayStatus}
			onAction={requestStep}
		/>
	);
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
