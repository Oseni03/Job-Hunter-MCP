"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth-client.ts";

function resumePath(oauthQuery: string | null): string {
	if (oauthQuery) {
		return `/api/auth/oauth2/authorize?${oauthQuery}`;
	}
	return "/";
}

function SignInForm(): React.JSX.Element {
	const router = useRouter();
	const params = useSearchParams();
	const oauthQuery = params.get("oauth_query");
	const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(event: React.FormEvent): Promise<void> {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			if (mode === "sign-up") {
				const res = await authClient.signUp.email({ name: name || email, email, password });
				if (res.error) {
					setError(res.error.message ?? "Sign-up failed.");
					return;
				}
			} else {
				const res = await authClient.signIn.email({ email, password });
				if (res.error) {
					setError(res.error.message ?? "Sign-in failed.");
					return;
				}
			}
			// Session cookie is now set; the OAuth plugin resumes the
			// authorization flow from the authorize endpoint.
			router.push(resumePath(oauthQuery));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unexpected error.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<main style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
			<h1>Sign in to Job Hunter MCP</h1>
			<p>Sign in to authorize MCP clients access to your job-hunting tools.</p>
			<div style={{ marginBottom: 12 }}>
				<button type="button" onClick={() => setMode("sign-in")} disabled={mode === "sign-in"}>
					Sign in
				</button>{" "}
				<button type="button" onClick={() => setMode("sign-up")} disabled={mode === "sign-up"}>
					Sign up
				</button>
			</div>
			<form onSubmit={submit}>
				{mode === "sign-up" ? (
					<div style={{ marginBottom: 8 }}>
						<label>
							Name
							<br />
							<input value={name} onChange={(e) => setName(e.target.value)} required />
						</label>
					</div>
				) : null}
				<div style={{ marginBottom: 8 }}>
					<label>
						Email
						<br />
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</label>
				</div>
				<div style={{ marginBottom: 8 }}>
					<label>
						Password
						<br />
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							minLength={8}
						/>
					</label>
				</div>
				{error ? <p style={{ color: "crimson" }}>{error}</p> : null}
				<button type="submit" disabled={busy}>
					{busy ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
				</button>
			</form>
		</main>
	);
}

export default function SignInPage(): React.JSX.Element {
	return (
		<Suspense>
			<SignInForm />
		</Suspense>
	);
}
