export type DashboardView = "overview" | "analysis" | "rank" | "search" | "interview" | "followups";

export interface DashboardItem {
	title: string;
	company?: string;
	score?: number;
	verdict?: string;
	url?: string;
	note?: string;
}

export interface DashboardData {
	view?: DashboardView;
	title?: string;
	summary?: string;
	markdown?: string;
	items?: DashboardItem[];
	actions?: string[];
}

export const VIEW_LABELS: Record<DashboardView, string> = {
	overview: "Overview",
	analysis: "Analysis",
	rank: "Rank",
	search: "Search",
	interview: "Interview",
	followups: "Follow-ups",
};
