import type { DashboardData, ToolAction } from "../types.ts";
import { list, rec, strings, text } from "../toolviews.ts";
import { Badge } from "../components/ui/badge.tsx";
import { ActionBar, AppShell, BulletList, DetailsCard, Hero, Notice, Section } from "./_shared.tsx";

export interface ProfileViewProps {
	data: DashboardData;
	onAction: (action: ToolAction) => void;
	pending: string | null;
	status?: string;
}

export function ProfileView(props: ProfileViewProps): React.JSX.Element {
	const { data, onAction, pending } = props;
	const details = rec(data.details);
	const profile = rec(details["profile"]);
	const languages = list(profile["languages"]);
	const skills = list(profile["skills"]);
	const domains = list(profile["domains"]);
	const experience = list(profile["experience"]);
	const projects = list(profile["projects"]);
	const targetRoles = strings(rec(profile["preferences"])["targetRoles"]);
	const notes = strings(details["notes"]);
	const warnings = strings(details["warnings"]);
	return (
		<AppShell title={data.title ?? "Profile setup"} badge="Profile" status={props.status}>
		<Hero
			title={text(profile["name"], "Profile")}
			badge={
				targetRoles.length > 0 ? (
					<Badge>
						Targeting {targetRoles.length} role{targetRoles.length === 1 ? "" : "s"}
					</Badge>
				) : undefined
			}
			meta={
				<>
					{[text(profile["location"]), text(profile["headline"])].filter((part) => part !== "").join(" · ")}
					{text(details["resumeHash"]) !== "" ? ` · hash ${text(details["resumeHash"]).slice(0, 8)}` : ""}
					{targetRoles.length > 0 ? ` · Targeting: ${targetRoles.join(", ")}` : ""}
				</>
			}
		/>

			{skills.length > 0 ? (
				<Section title={`Skills (${skills.length})`}>
					{skills.map((entry, index) => {
						const skill = rec(entry);
						return (
							<p key={`skill-${index}`} className="text-sm leading-relaxed">
								<span className="font-medium">{text(skill["name"], "Skill")}</span>
								{text(skill["category"]) !== "" ? (
									<span className="text-muted-foreground"> · {text(skill["category"])}</span>
								) : null}
								{text(skill["proficiency"]) !== "" ? (
									<span className="text-muted-foreground"> · {text(skill["proficiency"])}</span>
								) : null}
							</p>
						);
					})}
				</Section>
			) : null}

			{domains.length > 0 ? (
				<Section title="Domains">
					{domains.map((entry, index) => {
						const domain = rec(entry);
						return (
							<p key={`domain-${index}`} className="text-sm leading-relaxed">
								<span className="font-medium">{text(domain["name"], "Domain")}</span>
								{text(domain["category"]) !== "" ? (
									<span className="text-muted-foreground"> · {text(domain["category"])}</span>
								) : null}
							</p>
						);
					})}
				</Section>
			) : null}

			{languages.length > 0 ? (
				<Section title="Languages">
					{languages.map((entry, index) => {
						const language = rec(entry);
						return (
							<p key={`language-${index}`} className="text-sm leading-relaxed">
								<span className="font-medium">{text(language["language"], "Language")}</span>
								{text(language["level"]) !== "" ? (
									<span className="text-muted-foreground"> · {text(language["level"])}</span>
								) : null}
							</p>
						);
					})}
				</Section>
			) : null}

			{experience.length > 0 ? (
				<Section title={`Experience (${experience.length})`}>
					{experience.map((entry, index) => {
						const role = rec(entry);
						const position = text(role["position"]);
						const company = text(role["company"]);
						return (
							<div key={`experience-${index}`}>
								<p className="text-sm font-medium">
									{[position, company ? `at ${company}` : ""].filter((part) => part !== "").join(" ") ||
										"Role"}
								</p>
								{text(role["description"]) !== "" ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">{text(role["description"])}</p>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

			{projects.length > 0 ? (
				<Section title={`Projects (${projects.length})`}>
					{projects.map((entry, index) => {
						const project = rec(entry);
						const url = text(project["url"]) || text(project["github"]);
						return (
							<div key={`project-${index}`}>
								<p className="text-sm font-medium">{text(project["name"], "Project")}</p>
								{text(project["description"]) !== "" ? (
									<p className="mt-0.5 text-[13px] text-muted-foreground">{text(project["description"])}</p>
								) : null}
								{url !== "" ? (
									<a
										className="mt-0.5 block text-[13px] break-all text-primary underline underline-offset-2"
										href={url}
										target="_blank"
										rel="noreferrer"
									>
										{url}
									</a>
								) : null}
							</div>
						);
					})}
				</Section>
			) : null}

		{notes.length > 0 || text(details["dbNote"]) !== "" ? (
			<Section title="Setup notes">
				<BulletList items={notes} />
				{text(details["dbNote"]) !== "" ? (
					<p className="text-[13px] text-muted-foreground">{text(details["dbNote"])}</p>
				) : null}
			</Section>
		) : null}

		{warnings.length > 0 ? (
			<Notice title="Setup warnings">
				<BulletList items={warnings} />
			</Notice>
		) : null}

			<ActionBar actions={data.actions ?? []} onAction={onAction} pending={pending} />
			<DetailsCard markdown={data.markdown} details={data.details} />
		</AppShell>
	);
}
