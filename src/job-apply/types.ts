/** Shared types for the job-apply pipeline. */

export type AtsPlatform = "greenhouse" | "lever" | "ashby";
export type SourceType = AtsPlatform | "github" | "jobboard";
export type Platform = AtsPlatform | "workday" | "other";

/** Raw source config from sources.json */
export interface SourcesConfig {
  github_repos: GithubRepoSource[];
  job_boards: JobBoardSource[];
  ats_companies: AtsCompanySource[];
}

export interface GithubRepoSource {
  owner: string;
  repo: string;
  /** "auto" tries a JSON listings feed, then falls back to the README table. */
  format?: "auto" | "json" | "readme";
  /** Optional explicit raw path to a JSON listings file. */
  jsonPath?: string;
}

export interface JobBoardSource {
  name: string;
  url: string;
}

export interface AtsCompanySource {
  platform: AtsPlatform;
  slug: string;
}

/** Unified job shape produced by every discovery adapter. */
export interface RawJob {
  source: string; // human label of the originating source
  sourceType: SourceType;
  platform: Platform; // where the application is actually submitted
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string; // canonical posting / apply URL
  postedAt?: string; // ISO date if known
  description?: string; // plain text, may be truncated
  salary?: string; // free-text range if the posting exposes one
  raw?: unknown; // original payload, for debugging
}

/** A job that survived filtering + dedup, optionally scored. */
export interface ScoredJob extends RawJob {
  score?: number; // 0-100 relevance, from Haiku
  scoreReason?: string;
}
