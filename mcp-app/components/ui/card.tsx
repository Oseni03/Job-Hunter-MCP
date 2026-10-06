import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.ts";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
	return (
		<section
			className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)}
			{...props}
		/>
	);
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
	return <div className={cn("flex items-center justify-between gap-2.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
	return (
		<h2
			className={cn("text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
	return <div className={cn("mt-2.5", className)} {...props} />;
}
