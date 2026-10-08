import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.ts";

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
	value?: number;
}

/** shadcn-style progress bar (self-contained: no headless dep, inlines into the single-file bundle). */
export function Progress({ className, value, ...props }: ProgressProps): React.JSX.Element {
	const clamped = Math.min(100, Math.max(0, Math.round(value ?? 0)));
	return (
		<div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={clamped}
			className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
			{...props}
		>
			<div className="h-full rounded-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
		</div>
	);
}
