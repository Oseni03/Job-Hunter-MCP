import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const origin =
    process.argv.slice(2).find((argument) => argument !== "--") ||
    "http://localhost:3000";

async function main() {
    const client = new Client({
        name: "job-hunter-test-client",
        version: "1.0.0",
    });
    const endpoint = new URL("/mcp", `${origin}/`);
    const transport = new StreamableHTTPClientTransport(endpoint);

    console.log("Connecting to", endpoint.toString());
    await client.connect(transport);

    console.log("Connected", client.getServerCapabilities());

    const { tools } = await client.listTools();
    console.log("Tools", tools.map((tool) => tool.name));

    const result = await client.callTool({
        name: "evaluate-job",
        arguments: {
            postingText: [
                "Senior ML Engineer at Acme.",
                "We welcome international applicants and offer visa sponsorship.",
                "Requirements: Python, SQL, Machine Learning.",
                "Domain: fraud detection.",
                "Remote. Apply by 15 March 2026.",
            ].join("\n"),
            company: "Acme",
            role: "Senior ML Engineer",
            profile: {
                name: "Test Candidate",
                primarySkills: ["Python", "SQL", "Machine Learning"],
                secondarySkills: ["Docker"],
                strongDomains: ["fraud detection"],
                careerGoals: ["ML Engineer"],
                energizingTasks: ["model building"],
                drainingTasks: ["maintenance"],
                languages: [{ language: "English", level: "C1" }],
            },
        },
    });
    console.log("Result", JSON.stringify(result, null, 2));

    await client.close();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
