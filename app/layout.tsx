export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<html lang="en">
			<body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
		</html>
	);
}
