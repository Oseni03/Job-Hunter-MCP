import type { LabelHTMLAttributes } from "react";

import { cn } from "../../lib/utils.ts";

/** shadcn-style label (self-contained: native label element, no headless dep). */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
	return (
		<label
			className={cn(
				"text-[13px] font-medium text-muted-foreground select-none has-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
