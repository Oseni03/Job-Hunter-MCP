"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, CircleAlert, LoaderCircle } from "lucide-react";

import { authClient } from "@/lib/auth-client.ts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function SignInForm(): React.JSX.Element {
	const router = useRouter();
	const params = useSearchParams();
	// The OAuth plugin redirects unauthenticated authorize requests here as
	// /sign-in?<signed authorization query> (raw params, NOT nested under an
	// `oauth_query` key). The full query string must be echoed as
	// `oauth_query` in the auth request body: the plugin verifies the
	// signature and resumes the grant in that same response as
	// { redirect: true, url }. Without it the OAuth context is abandoned and
	// both sign-in and sign-up dead-end on "/" instead of resuming.
	const oauthQuery = params.toString();
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
			// Extra body field for the OAuth plugin's before-hook (not part
			// of the endpoint schema, hence the spread). Omitted on direct
			// visits so plain sign-in/sign-up keeps its normal response.
			const oauthField = oauthQuery ? ({ oauth_query: oauthQuery } as Record<string, string>) : {};
			const res =
				mode === "sign-up"
					? await authClient.signUp.email({ name: name || email, email, password, ...oauthField })
					: await authClient.signIn.email({ email, password, ...oauthField });
			if (res.error) {
				setError(res.error.message ?? (mode === "sign-up" ? "Sign-up failed." : "Sign-in failed."));
				return;
			}
			// With oauth_query attached, the plugin's after-hook replaces
			// the response with the resumed authorization — follow it (the
			// consent page or the client's redirect_uri, possibly
			// cross-origin, hence a full navigation, not router.push).
			const data = res.data as unknown as { redirect?: boolean; url?: string } | null;
			if (data?.redirect && data.url) {
				window.location.href = data.url;
				return;
			}
			router.push("/");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unexpected error.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<div className="mb-1 flex size-10 items-center justify-center bg-primary text-primary-foreground">
						<Briefcase className="size-5" aria-hidden="true" />
					</div>
					<CardTitle>{mode === "sign-up" ? "Create your account" : "Welcome back"}</CardTitle>
					<CardDescription>
						{oauthQuery
							? "An MCP client is requesting access to your job-hunting tools. Sign in to continue."
							: "Sign in to manage your job-hunting workspace."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs
						value={mode}
						onValueChange={(value) => {
							setMode(value as "sign-in" | "sign-up");
							setError(null);
						}}
					>
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="sign-in">Sign in</TabsTrigger>
							<TabsTrigger value="sign-up">Sign up</TabsTrigger>
						</TabsList>
					</Tabs>
					<form onSubmit={submit} className="mt-4 flex flex-col gap-4">
						{mode === "sign-up" ? (
							<div className="flex flex-col gap-2">
								<Label htmlFor="name">Name</Label>
								<Input
									id="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									required
									autoComplete="name"
								/>
							</div>
						) : null}
						<div className="flex flex-col gap-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								required
								autoComplete="email"
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								minLength={8}
								autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
							/>
						</div>
						{error ? (
							<Alert variant="destructive">
								<CircleAlert aria-hidden="true" />
								<AlertTitle>{mode === "sign-up" ? "Sign-up failed" : "Sign-in failed"}</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						) : null}
						<Button type="submit" className="w-full" disabled={busy}>
							{busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
							{busy ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
						</Button>
					</form>
				</CardContent>
				<CardFooter>
					<p className="text-xs/relaxed text-muted-foreground">
						Protected by OAuth 2.1. Your credentials never leave this server.
					</p>
				</CardFooter>
			</Card>
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
