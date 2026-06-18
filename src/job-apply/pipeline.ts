import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import { loadSources } from "./sources";
import { discoverAll } from "./discovery";
import { filterJobs, matchLocation } from "./filter";
import { dedupAgainstSheet } from "./dedup";
import { scoreJobs } from "./scoring";
import { ENV } from "./config";
import type { ScoredJob } from "./types";

const OUT_PATH = resolve(__dirname, "data", "candidates.json");

/**
 * Stage 1 pipeline: discover -> filter -> dedup -> score -> write candidates.json.
 * Later stages read candidates.json to build resumes and prepare the queue.
 */
export async function runPipeline(): Promise<ScoredJob[]> {
  const config = await loadSources();
  const discovered = await discoverAll(config);
  const { kept } = filterJobs(discovered);
  const fresh = await dedupAgainstSheet(kept);
  const top = await scoreJobs(fresh, ENV.nightlyCap);

  const annotated = top.map((j) => ({ ...j, locationBucket: matchLocation(j) }));

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(
    OUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: annotated.length, jobs: annotated }, null, 2),
  );

  console.log(`\n[pipeline] wrote ${annotated.length} candidates -> ${OUT_PATH}`);
  for (const j of annotated.slice(0, 10)) {
    console.log(`  - ${j.company} - ${j.title} [${j.location}] ${j.score != null ? `(${j.score})` : ""}`);
  }
  return annotated;
}
