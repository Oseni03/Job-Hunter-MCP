-- ResumeVersion stores recompilable source plus review text plus verification (ADR-0003).
ALTER TABLE "ResumeVersion" ADD COLUMN "markdown" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ResumeVersion" ADD COLUMN "verification" JSONB;
