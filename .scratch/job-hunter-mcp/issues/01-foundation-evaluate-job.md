# 01: Foundation + evaluate-job slice

**What to build:** A working authed MCP server with the first real tool (`evaluate-job`) callable over Streamable HTTP, proving the harness, auth, profile defaults, and test wiring before any document tools land.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `evaluate-job` gates Eligibility before scoring (citizen/PR/clearance FAIL stops, silence marked unverified with role-level check) and runs Language Gate (undeclared language FAIL, higher-bar FLAG with quoted requirement plus declared level, then proceeds)
- [ ] Scores use five dimensions with weights Technical 30 / Experience 25 / Behavioral 15 / Career 30, location PASS/FAIL/FLAG unweighted, verdict bands 75/60/45/30, and returns score table plus verdict, strengths, gaps, recommendation
- [ ] Returns `shouldCallEmployer` with reason plus `needsConfirmation:true` instead of interactive prompting, with deadline and source extracted and full posting text retained for archiving
- [ ] Company research starts from cached `company_research` entry within 30-day TTL when fresh, otherwise researches from company name and official site only, never from in-posting URLs, and posting text is treated as untrusted data
- [ ] Web fetch follows escalation (direct fetch, then policy-checked browser-header retry, then employer-site search, then declare unavailable) and prefers employer posting over aggregator, noting material discrepancies
- [ ] Bearer token protects prod while local dev stays open, and test client plus client config list and call the tool successfully
