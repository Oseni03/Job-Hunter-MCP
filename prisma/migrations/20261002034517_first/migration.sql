-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issuer" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "constraints" TEXT NOT NULL,
    "workCountry" TEXT NOT NULL,
    "citizenships" JSONB NOT NULL,
    "permitClasses" JSONB NOT NULL,
    "languages" JSONB NOT NULL,
    "primarySkills" JSONB NOT NULL,
    "secondarySkills" JSONB NOT NULL,
    "weakSkills" JSONB NOT NULL,
    "strongDomains" JSONB NOT NULL,
    "adjacentDomains" JSONB NOT NULL,
    "careerGoals" JSONB NOT NULL,
    "energizingTasks" JSONB NOT NULL,
    "drainingTasks" JSONB NOT NULL,
    "resumeHash" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "rawText" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CompanyResearch" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "payload" TEXT NOT NULL,
    "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Application" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trackerHash" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "tex" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "ms" INTEGER,
    "ok" BOOLEAN NOT NULL,
    "note" TEXT,
    "inputHash" TEXT,
    "outputRef" TEXT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_issuer_sub_key" ON "User"("issuer", "sub");

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_jobKey_key" ON "Application"("userId", "jobKey");

-- CreateIndex
CREATE INDEX "ResumeVersion_userId_jobKey_idx" ON "ResumeVersion"("userId", "jobKey");

-- CreateIndex
CREATE INDEX "EventLog_userId_ts_idx" ON "EventLog"("userId", "ts");
