"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth-client.ts";

function ConsentForm(): React.JSX.Element {
	const params = useSearchParams();
	const clientId = params.get("client_id") ?? "Unknown client";
	const scope = params.get("scope") ?? "mcp:tools";
	const claims = params.get("claims");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState<string | null>(null);

	async function decide(accept: boolean): Promise<void> {
		setBusy(true);
		setError(null);
		try {
			let parsedClaims: unknown;
			try {
				parsedClaims = claims ? (JSON.parse(claims) as unknown) : undefined;
			} catch {
				parsedClaims = undefined;
			}
			const res = await authClient.oauth2.consent({
				accept,
				scope,
				...(parsedClaims !== undefined ? { claims: parsedClaims as never } : {}),
			});
			if (res.error) {
				setError(res.error.message ?? "Consent failed.");
				return;
			}
			const data = res.data as unknown as { url?: string; redirect?: string } | null;
			const url = data?.url ?? data?.redirect ?? null;
			// Denials cancel the grant and stay on this page; accept resumes
			// the flow at the client's redirect URI when the server provides it.
			if (accept && url) {
				window.location.href = url;
				return;
			}
			setDone(accept ? "Approved. You can close this window." : "Denied. No access was granted.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unexpected error.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1rem" }}>
			<h1>Authorize MCP access</h1>
			<p>
				<strong>{clientId}</strong> is requesting access to your Job Hunter tools.
			</p>
			<p>
				Requested scopes: <code>{scope}</code>
			</p>
			{claims ? (
				<p>
					Requested claims: <code>{claims}</code>
				</p>
			) : null}
			{error ? <p style={{ color: "crimson" }}>{error}</p> : null}
			{done ? <p>{done}</p> : null}
			<div>
				<button type="button" disabled={busy} onClick={() => decide(true)}>
					{busy ? "Working…" : "Allow"}
				</button>{" "}
				<button type="button" disabled={busy} onClick={() => decide(false)}>
					Deny
				</button>
			</div>
		</main>
	);
}

export default function ConsentPage(): React.JSX.Element {
	return (
		<Suspense>
			<ConsentForm />
		</Suspense>
	);
}
