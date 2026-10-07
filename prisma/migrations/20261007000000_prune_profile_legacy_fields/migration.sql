-- Prune legacy Profile columns folded into the unified shape (ADR-0003).
-- Data migration runs in application code (foldLegacyFields on read):
-- primary/secondary/weakSkills -> skills[], strong/adjacentDomains ->
-- domains[], careerGoals -> preferences.targetRoles; constraints and
-- citizenships (no logic consumer) are dropped.
ALTER TABLE "Profile" DROP COLUMN "constraints";
ALTER TABLE "Profile" DROP COLUMN "citizenships";
ALTER TABLE "Profile" DROP COLUMN "primarySkills";
ALTER TABLE "Profile" DROP COLUMN "secondarySkills";
ALTER TABLE "Profile" DROP COLUMN "weakSkills";
ALTER TABLE "Profile" DROP COLUMN "strongDomains";
ALTER TABLE "Profile" DROP COLUMN "adjacentDomains";
ALTER TABLE "Profile" DROP COLUMN "careerGoals";
