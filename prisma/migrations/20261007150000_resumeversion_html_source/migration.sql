-- ResumeVersion stores the fixed CV HTML source rather than LaTeX.
ALTER TABLE "ResumeVersion" RENAME COLUMN "tex" TO "html";
