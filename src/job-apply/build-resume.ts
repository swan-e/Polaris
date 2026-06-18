#!/usr/bin/env node
import "dotenv/config";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { buildResume } from "./resume-builder";

/**
 * Test/CLI: build a tailored resume for candidates in data/candidates.json.
 *   npx tsx src/job-apply/build-resume.ts          -> builds for the top candidate
 *   npx tsx src/job-apply/build-resume.ts all       -> builds for every candidate
 *   npx tsx src/job-apply/build-resume.ts 3         -> builds for the first 3
 */
const CANDIDATES = resolve(__dirname, "data", "candidates.json");

async function main() {
  const arg = process.argv[2];
  const data = JSON.parse(await readFile(CANDIDATES, "utf8"));
  const jobs = data.jobs ?? [];
  if (!jobs.length) {
    console.log("No candidates in candidates.json — run discovery first (npx tsx src/job-apply/index.ts).");
    return;
  }

  const count = arg === "all" ? jobs.length : Math.max(1, Number(arg) || 1);
  const targets = jobs.slice(0, count);

  for (const job of targets) {
    try {
      const r = await buildResume(job);
      console.log(`\n✓ ${job.company} — ${job.title}`);
      console.log(`  experiences: ${r.selectedExperiences.join(", ")}`);
      console.log(`  projects:    ${r.selectedProjects.join(", ")}`);
      console.log(`  pdf:         ${r.pdfPath}`);
    } catch (err) {
      console.error(`\n✗ ${job.company} — ${job.title}: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});