import { readFile } from "fs/promises";
import { resolve } from "path";
import type { SourcesConfig } from "./types";

const DEFAULT_PATH = resolve(__dirname, "sources.json");

export async function loadSources(path: string = DEFAULT_PATH): Promise<SourcesConfig> {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text) as Partial<SourcesConfig>;

  const config: SourcesConfig = {
    github_repos: parsed.github_repos ?? [],
    job_boards: parsed.job_boards ?? [],
    ats_companies: parsed.ats_companies ?? [],
  };

  for (const c of config.ats_companies) {
    if (!c.platform || !c.slug) {
      throw new Error(`Invalid ats_companies entry: ${JSON.stringify(c)} (need platform + slug)`);
    }
  }
  for (const r of config.github_repos) {
    if (!r.owner || !r.repo) {
      throw new Error(`Invalid github_repos entry: ${JSON.stringify(r)} (need owner + repo)`);
    }
  }
  return config;
}
