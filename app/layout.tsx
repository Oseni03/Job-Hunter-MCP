import { Inter, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

import "./globals.css";

const geistMonoHeading = Geist_Mono({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'});


export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<html lang="en" className={cn("font-sans", inter.variable, geistMonoHeading.variable)}>
			<body className="min-h-screen bg-background font-sans text-foreground antialiased">{children}</body>
		</html>
	);
}
