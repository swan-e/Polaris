#!/usr/bin/env node
import "dotenv/config";
import { runPipeline } from "./pipeline";

/**
 * Entry point. Ofelia (or a manual run) calls this for one discovery cycle.
 * Writes data/candidates.json for the resume-builder stage to pick up.
 */
runPipeline()
  .then((jobs) => {
    console.log(`\nDone. ${jobs.length} candidates ready.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("[pipeline] fatal:", err);
    process.exit(1);
  });
