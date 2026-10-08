import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "../../lib/utils.ts";

export interface SeparatorProps extends SeparatorPrimitive.Props {
	orientation?: "horizontal" | "vertical";
}

/** shadcn-style separator over Base UI (same primitive the Next.js app uses). */
export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps): React.JSX.Element {
	return (
		<SeparatorPrimitive
			orientation={orientation}
			className={cn(
				"shrink-0 bg-border",
				orientation === "vertical" ? "w-px self-stretch" : "h-px w-full",
				className,
			)}
			{...props}
		/>
	);
}
