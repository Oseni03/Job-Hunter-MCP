"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, CircleCheck, LoaderCircle, ShieldCheck } from "lucide-react";

import { authClient } from "@/lib/auth-client.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function ConsentForm(): React.JSX.Element {
	const params = useSearchParams();
	const clientId = params.get("client_id") ?? "Unknown client";
	const scope = params.get("scope") ?? "mcp:tools";
	const claims = params.get("claims");
	// The plugin redirects here as /consent?<signed authorization query>.
	// It must be echoed as `oauth_query` with the decision so the server
	// knows which grant is being approved (else "missing oauth query").
	const oauthQuery = params.toString();
	const scopes = scope.split(" ").filter(Boolean);
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
				...(oauthQuery ? { oauth_query: oauthQuery } : {}),
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
		<main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="mb-1 flex size-10 items-center justify-center bg-primary text-primary-foreground">
						<ShieldCheck className="size-5" aria-hidden="true" />
					</div>
					<CardTitle>Authorize MCP access</CardTitle>
					<CardDescription>
						<span className="font-medium text-foreground">{clientId}</span> is requesting access to your
						Job Hunter tools.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<p className="text-xs font-medium text-muted-foreground">Requested scopes</p>
						<div className="flex flex-wrap gap-1.5">
							{scopes.map((s) => (
								<Badge key={s} variant="secondary">
									{s}
								</Badge>
							))}
						</div>
					</div>
					{claims ? (
						<div className="flex flex-col gap-2">
							<p className="text-xs font-medium text-muted-foreground">Requested claims</p>
							<pre className="overflow-x-auto bg-muted p-2.5 text-xs/relaxed">{claims}</pre>
						</div>
					) : null}
					<Separator />
					{error ? (
						<Alert variant="destructive">
							<CircleAlert aria-hidden="true" />
							<AlertTitle>Authorization failed</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}
					{done ? (
						<Alert>
							<CircleCheck aria-hidden="true" />
							<AlertTitle>{done}</AlertTitle>
						</Alert>
					) : null}
					<div className="flex gap-2">
						<Button type="button" className="flex-1" disabled={busy} onClick={() => decide(true)}>
							{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
							{busy ? "Working…" : "Allow"}
						</Button>
						<Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
							Deny
						</Button>
					</div>
				</CardContent>
				<CardFooter>
					<p className="text-xs/relaxed text-muted-foreground">
						Allowing grants scoped, revocable access. You can revoke it at any time.
					</p>
				</CardFooter>
			</Card>
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
