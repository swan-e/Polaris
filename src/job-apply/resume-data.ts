import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { ENV } from "./config";

/**
 * Loads experiences.json / projects.json from your PersonalWebsite (single source of truth).
 * Source is a URL by default (works from laptop, desktop, or Railway alike) but may also be a
 * local file path for quick iteration. Fetched copies are cached to data/ and reused if a
 * later fetch fails. The two source URLs live in config.ts (ENV.experiencesUrl / projectsUrl);
 * override them with RESUME_EXPERIENCES_URL / RESUME_PROJECTS_URL in .env.
 */

const CACHE_DIR = resolve(__dirname, "data");

const EXPERIENCES_SRC = ENV.experiencesUrl;
const PROJECTS_SRC = ENV.projectsUrl;

export interface ResumeBullet {
  text: string;
  tags: string[];
}
export interface ResumeBlock {
  heading?: string;
  org?: string;
  date?: string;
  tags: string[];
  bullets: ResumeBullet[];
}
export interface ExperienceEntry {
  company: string;
  role: string;
  date: string;
  link?: string;
  desc?: string;
  hideOnSite?: boolean;
  resume?: ResumeBlock;
  [k: string]: unknown;
}
export interface ProjectEntry {
  name: string;
  link?: string;
  desc?: string;
  tech?: string[];
  status?: string;
  hideOnSite?: boolean;
  resume?: ResumeBlock;
  [k: string]: unknown;
}

async function loadSource<T>(src: string, cacheName: string): Promise<T[]> {
  try {
    let text: string;
    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src, { headers: { "User-Agent": "nova-job-apply" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } else {
      text = await readFile(src, "utf8");
    }
    const data = JSON.parse(text);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(resolve(CACHE_DIR, cacheName), text);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`[resume-data] could not load ${src} (${(err as Error).message}); trying cache`);
    try {
      return JSON.parse(await readFile(resolve(CACHE_DIR, cacheName), "utf8"));
    } catch {
      console.warn(`[resume-data] no cached ${cacheName}; returning empty`);
      return [];
    }
  }
}

export async function loadExperiences(): Promise<ExperienceEntry[]> {
  return loadSource<ExperienceEntry>(EXPERIENCES_SRC, "experiences.cache.json");
}

export async function loadProjects(): Promise<ProjectEntry[]> {
  return loadSource<ProjectEntry>(PROJECTS_SRC, "projects.cache.json");
}

/** Only entries that carry a `resume` block are usable by the resume builder. */
export async function loadResumeBlocks(): Promise<{ experiences: ExperienceEntry[]; projects: ProjectEntry[] }> {
  const [experiences, projects] = await Promise.all([loadExperiences(), loadProjects()]);
  return {
    experiences: experiences.filter((e) => e.resume),
    projects: projects.filter((p) => p.resume),
  };
}