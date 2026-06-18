import type { RawJob, SourcesConfig } from "../types";
import { fetchGreenhouse } from "./greenhouse";
import { fetchLever } from "./lever";
import { fetchAshby } from "./ashby";
import { fetchGithubRepo } from "./github";
import { fetchJobBoard } from "./jobboard";

/** Run every configured source and return a flat, de-duplicated-by-URL list. */
export async function discoverAll(config: SourcesConfig): Promise<RawJob[]> {
  const tasks: Promise<RawJob[]>[] = [];

  for (const c of config.ats_companies) {
    if (c.platform === "greenhouse") tasks.push(safe(() => fetchGreenhouse(c.slug)));
    else if (c.platform === "lever") tasks.push(safe(() => fetchLever(c.slug)));
    else if (c.platform === "ashby") tasks.push(safe(() => fetchAshby(c.slug)));
  }
  for (const r of config.github_repos) tasks.push(safe(() => fetchGithubRepo(r)));
  for (const b of config.job_boards) tasks.push(safe(() => fetchJobBoard(b)));

  const results = await Promise.all(tasks);
  const all = results.flat();

  // Collapse exact-URL duplicates that several sources may surface.
  const byUrl = new Map<string, RawJob>();
  for (const job of all) {
    const key = (job.url || `${job.company}|${job.title}`).toLowerCase();
    if (!byUrl.has(key)) byUrl.set(key, job);
  }
  const deduped = [...byUrl.values()];
  console.log(`[discovery] ${all.length} raw → ${deduped.length} unique across ${tasks.length} sources`);
  return deduped;
}

async function safe(fn: () => Promise<RawJob[]>): Promise<RawJob[]> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[discovery] source failed: ${(err as Error).message}`);
    return [];
  }
}
