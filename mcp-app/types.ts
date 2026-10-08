export type DashboardView =
	| "overview"
	| "analysis"
	| "rank"
	| "search"
	| "interview"
	| "followups"
	| "cv"
	| "letter"
	| "track"
	| "strategy"
	| "answers"
	| "research"
	| "brief"
	| "profile";

/**
 * A next step that invokes an MCP tool, never an external action. The app
 * runs it with `callServerTool`; hosts without the serverTools capability
 * fall back to asking the assistant to run the same tool with the same args.
 */
export interface ToolAction {
	label: string;
	tool: string;
	args?: Record<string, unknown>;
}

export interface DashboardItem {
	title: string;
	company?: string;
	score?: number;
	verdict?: string;
	url?: string;
	note?: string;
	action?: ToolAction;
}

export interface DashboardData {
	view?: DashboardView;
	title?: string;
	summary?: string;
	description?: string;
	details?: unknown;
	markdown?: string;
	items?: DashboardItem[];
	actions?: ToolAction[];
}

export const VIEW_LABELS: Record<DashboardView, string> = {
	overview: "Overview",
	analysis: "Analysis",
	rank: "Rank",
	search: "Search",
	interview: "Interview",
	followups: "Follow-ups",
	cv: "Tailored CV",
	letter: "Cover Letter",
	track: "Application",
	strategy: "Strategy",
	answers: "Answers",
	research: "Research",
	brief: "Job Brief",
	profile: "Profile",
};
