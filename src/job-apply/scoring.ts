import Anthropic from "@anthropic-ai/sdk";
import type { RawJob, ScoredJob } from "./types";
import { ENV } from "./config";

/**
 * RANK candidates to trim to the nightly cap. The rule filter already decided which jobs
 * are acceptable; this only runs when there are MORE than `cap` of them and we must choose
 * the best ones. Under the cap, scoring is skipped entirely — no LLM cost.
 *
 * Prompt caching: the static rubric is a cached system block.
 */
const RUBRIC = `You rank job postings by how good a match they are for a specific candidate, to
pick the best ones when there are too many to apply to. Output STRICT JSON only.

CANDIDATE: graduating May 2026, B.S. Computer Science (Virginia Tech). Early-career software
engineer. Stack: full-stack web (React, TypeScript, FastAPI, Python), some ML/NLP, data viz.
Open to: software engineering roles of any flavor (incl. forward-deployed), roles asking for
up to ~2 years experience, internships, and product/project/program management. Target
locations: Los Angeles, NYC, Northern Virginia, Chicago, San Francisco/Bay Area, US-remote.

Each job includes "curatedNewGrad" (true = came from a hand-curated new-grad list).

Return a JSON array: {"i": <index>, "score": <0-100>, "reason": "<short>"}.
Rank higher: strong stack overlap, target location, early-career/new-grad-reachable,
full-time SWE over tangential roles. Rank lower: weak stack fit, borderline location, or
roles needing well beyond ~2 years. Do not zero anything out — this is ranking, not
gatekeeping. Output ONLY the JSON array, no prose or fences.`;

export async function scoreJobs(jobs: RawJob[], cap = ENV.nightlyCap): Promise<ScoredJob[]> {
  if (jobs.length === 0) return [];

  // Under the cap: nothing to trim — keep all rule-filtered jobs, no LLM call.
  if (jobs.length <= cap) {
    return jobs.map((j) => ({ ...j }));
  }

  if (!ENV.anthropicKey) {
    console.warn("[scoring] ANTHROPIC_API_KEY not set — keeping first N rule-filtered jobs");
    return jobs.slice(0, cap).map((j) => ({ ...j }));
  }

  const client = new Anthropic({ apiKey: ENV.anthropicKey });
  const scored: ScoredJob[] = [];
  const BATCH = 25;

  for (let start = 0; start < jobs.length; start += BATCH) {
    const batch = jobs.slice(start, start + BATCH);
    const payload = batch.map((j, i) => ({
      i,
      title: j.title,
      company: j.company,
      location: j.location,
      remote: j.remote,
      curatedNewGrad: j.sourceType === "github" || j.sourceType === "jobboard",
      desc: (j.description ?? "").slice(0, 600),
    }));

    try {
      const resp = await client.messages.create({
        model: ENV.haikuModel,
        max_tokens: 1500,
        system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Jobs:\n${JSON.stringify(payload)}` }],
      });
      const text = resp.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
      const arr = parseJsonArray(text);
      for (const item of arr) {
        const idx = Number(item.i);
        const job = batch[idx];
        if (job) scored.push({ ...job, score: clamp(item.score), scoreReason: item.reason });
      }
    } catch (err) {
      console.warn(`[scoring] batch failed, keeping unscored: ${(err as Error).message}`);
      for (const j of batch) scored.push({ ...j });
    }
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = scored.slice(0, cap);
  console.log(`[scoring] ranked ${jobs.length} -> kept top ${top.length}`);
  return top;
}

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

function clamp(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}