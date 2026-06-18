import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./config";
import { loadResumeBlocks, type ExperienceEntry, type ProjectEntry, type ResumeBlock } from "./resume-data";
// Reuse Nova's config reader for config/applicant.json
import { readConfig } from "../lib/config";

const execFileAsync = promisify(execFile);

const TEMPLATE_PATH = resolve(__dirname, "templates", "resume.tex");
const OUT_DIR = resolve(__dirname, "data", "resumes");
const TECTONIC_BIN = process.env.TECTONIC_BIN || "tectonic";

const MAX_EXPERIENCES = Number(process.env.RESUME_MAX_EXPERIENCES || "3");
const MAX_PROJECTS = Number(process.env.RESUME_MAX_PROJECTS || "3");

interface Applicant {
  resumeLocations: Record<string, string> & { default: string };
}

/** Minimal shape of a job we need to tailor against. */
export interface BuildJob {
  company: string;
  title: string;
  description?: string;
  locationBucket?: string | null;
}

export interface BuildResult {
  texPath: string;
  pdfPath: string;
  selectedExperiences: string[];
  selectedProjects: string[];
}

export async function buildResume(job: BuildJob): Promise<BuildResult> {
  const [{ experiences, projects }, applicant] = await Promise.all([
    loadResumeBlocks(),
    Promise.resolve(readConfig<Applicant>("applicant.json")),
  ]);

  if (!experiences.length && !projects.length) {
    throw new Error("No resume blocks found — check that experiences.json/projects.json have `resume` fields and are reachable.");
  }

  const jdText = `${job.title}\n${job.description ?? ""}`;

  const expIdx = await selectBlocks(experiences.map((e) => e.resume!), jdText, MAX_EXPERIENCES, "experience");
  const projIdx = await selectBlocks(projects.map((p) => p.resume!), jdText, MAX_PROJECTS, "project");

  const location =
    (job.locationBucket && applicant.resumeLocations[job.locationBucket]) || applicant.resumeLocations.default;

  const expTex = expIdx.map((i) => renderBlock(experiences[i].resume!, experiences[i].link)).join("\n\n");
  const projTex = projIdx.map((i) => renderBlock(projects[i].resume!, projects[i].link)).join("\n\n");

  const template = await readFile(TEMPLATE_PATH, "utf8");
  const filled = template
    .replace("%%LOCATION%%", tex(location))
    .replace("%%EXPERIENCE%%", expTex)
    .replace("%%PROJECTS%%", projTex);

  await mkdir(OUT_DIR, { recursive: true });
  const base = `${slug(job.company)}-${slug(job.title)}`;
  const texPath = join(OUT_DIR, `${base}.tex`);
  await writeFile(texPath, filled, "utf8");

  const pdfPath = await compile(texPath, OUT_DIR);

  return {
    texPath,
    pdfPath,
    selectedExperiences: expIdx.map((i) => experiences[i].resume!.heading ?? experiences[i].company),
    selectedProjects: projIdx.map((i) => projects[i].resume!.heading ?? projects[i].name),
  };
}

// ── Selection ────────────────────────────────────────────────────────────────

/** Returns indices of the chosen blocks, most-relevant first, capped at `max`. */
async function selectBlocks(blocks: ResumeBlock[], jdText: string, max: number, kind: string): Promise<number[]> {
  if (blocks.length <= max) return blocks.map((_, i) => i);

  if (ENV.anthropicKey) {
    try {
      return await selectWithHaiku(blocks, jdText, max, kind);
    } catch (err) {
      console.warn(`[resume] Haiku selection failed (${(err as Error).message}); using tag overlap`);
    }
  }
  return selectByTagOverlap(blocks, jdText, max);
}

async function selectWithHaiku(blocks: ResumeBlock[], jdText: string, max: number, kind: string): Promise<number[]> {
  const client = new Anthropic({ apiKey: ENV.anthropicKey });
  const items = blocks.map((b, i) => ({ i, heading: b.heading, org: b.org, tags: b.tags }));

  const resp = await client.messages.create({
    model: ENV.haikuModel,
    max_tokens: 200,
    system: [
      {
        type: "text",
        text:
          `You pick which of a candidate's ${kind} entries to put on a tailored resume for a given job. ` +
          `Choose the most relevant, most-relevant first, at most ${max}. ` +
          `Return ONLY a JSON array of the integer "i" values — no prose, no fences.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      { role: "user", content: `JOB:\n${jdText.slice(0, 1500)}\n\n${kind.toUpperCase()} OPTIONS:\n${JSON.stringify(items)}` },
    ],
  });

  const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
  const arr = parseJsonArray(text)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < blocks.length);

  const unique = [...new Set(arr)].slice(0, max);
  return unique.length ? unique : selectByTagOverlap(blocks, jdText, max);
}

function selectByTagOverlap(blocks: ResumeBlock[], jdText: string, max: number): number[] {
  const jd = jdText.toLowerCase();
  const scored = blocks.map((b, i) => {
    const tags = new Set<string>([...(b.tags ?? []), ...b.bullets.flatMap((bl) => bl.tags ?? [])]);
    let score = 0;
    for (const t of tags) if (tagInJd(jd, t)) score++;
    return { i, score };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i); // stable-ish: ties keep original order
  return scored.slice(0, max).map((s) => s.i);
}

function tagInJd(jd: string, tag: string): boolean {
  const variants = new Set([tag, tag.replace(/-/g, " "), tag.replace(/-/g, "")]);
  for (const v of variants) {
    if (new RegExp(`\\b${escapeRegex(v)}\\b`, "i").test(jd)) return true;
  }
  return false;
}

// ── LaTeX rendering ──────────────────────────────────────────────────────────

function renderBlock(b: ResumeBlock, link?: string): string {
  const items = b.bullets.map((bl) => `        \\resumeItem{${tex(bl.text)}}`).join("\n");
  return [
    `    \\resumeSubheading`,
    `      {${tex(b.heading ?? "")}}{${tex(b.date ?? "")}}`,
    `      {${tex(b.org ?? "")}}{${link ? tex(link) : ""}}`,
    `      \\resumeItemListStart`,
    items,
    `      \\resumeItemListEnd`,
  ].join("\n");
}

/** Escape the LaTeX special chars that realistically appear in resume text. */
function tex(s: string): string {
  return s
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_");
}

// ── Compile ──────────────────────────────────────────────────────────────────

async function compile(texPath: string, outDir: string): Promise<string> {
  try {
    await execFileAsync(TECTONIC_BIN, ["--chatter", "minimal", "--outdir", outDir, texPath]);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(
        `tectonic not found. Install it (see notes) or set TECTONIC_BIN to its path. Original: ${err.message}`,
      );
    }
    throw new Error(`tectonic failed to compile ${texPath}: ${err.stderr || err.message}`);
  }
  return texPath.replace(/\.tex$/, ".pdf");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseJsonArray(text: string): any[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}