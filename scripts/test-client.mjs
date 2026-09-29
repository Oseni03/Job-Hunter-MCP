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

    const postingText = [
        "Senior ML Engineer at Acme.",
        "We welcome international applicants and offer visa sponsorship.",
        "Requirements: Python, SQL, Machine Learning.",
        "Nice to have: Docker, Kubernetes.",
        "Domain: fraud detection.",
        "Remote. Apply by 15 March 2026. Ref: ACME-123.",
    ].join("\n");
    const profile = {
        name: "Test Candidate",
        primarySkills: ["Python", "SQL", "Machine Learning"],
        secondarySkills: ["Docker"],
        strongDomains: ["fraud detection"],
        adjacentDomains: ["credit risk"],
        careerGoals: ["ML Engineer"],
        energizingTasks: ["model building"],
        drainingTasks: ["maintenance"],
        languages: [{ language: "English", level: "C1" }],
    };

    const result = await client.callTool({
        name: "evaluate-job",
        arguments: { postingText, company: "Acme", role: "Senior ML Engineer", profile },
    });
    console.log("Result", JSON.stringify(result, null, 2));

    const cv = await client.callTool({
        name: "tailor-cv",
        arguments: {
            postingText,
            company: "Acme",
            role: "Senior ML Engineer",
            profile,
            experience: [
                {
                    title: "Data Analyst",
                    company: "R&D Corp",
                    period: "2020-2024",
                    bullets: ["Cut losses by 12% with Python models for fraud detection."],
                },
            ],
            education: [
                {
                    degree: "MSc Data Science",
                    period: "2022-2024",
                    institution: "Test University",
                    inProgress: true,
                    expectedDate: "June 2026",
                },
            ],
        },
    });
    console.log("CV", JSON.stringify(cv, null, 2));

    const letter = await client.callTool({
        name: "write-cover-letter",
        arguments: {
            postingText,
            company: "Acme",
            role: "Senior ML Engineer",
            profile,
            hiringManager: "Jane Smith",
            companySpecifics: ["Acme processes payments across Europe."],
            highlights: ["Shipped a model that cut review time by 30%."],
        },
    });
    console.log("Letter", JSON.stringify(letter, null, 2));

    const emptySlug = await client.callTool({
        name: "tailor-cv",
        arguments: { postingText: "Requirements: Python.", profile },
    });
    console.log("EmptySlug", JSON.stringify(emptySlug, null, 2));

    await client.close();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
