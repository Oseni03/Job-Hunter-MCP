import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils.ts";

const alertVariants = cva(
	"relative grid w-full gap-1 rounded-xl border px-4 py-3 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
	{
		variants: {
			variant: {
				default: "bg-card text-card-foreground",
				destructive:
					"border-destructive/40 bg-card text-destructive [&_p]:text-destructive/90",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps): React.JSX.Element {
	return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
	return <div className={cn("font-medium [&_a]:underline [&_a]:underline-offset-3", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
	return (
		<div
			className={cn("text-[13px]/relaxed text-balance text-muted-foreground [&_p:not(:last-child)]:mb-2", className)}
			{...props}
		/>
	);
}

export { alertVariants };
