import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.ts";

const badgeVariants = cva(
	"inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium whitespace-nowrap",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary text-primary-foreground",
				secondary: "border-border bg-secondary text-secondary-foreground",
				outline: "border-input text-foreground",
			},
		},
		defaultVariants: {
			variant: "secondary",
		},
	},
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
	return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
