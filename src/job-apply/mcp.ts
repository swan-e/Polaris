import { readFile } from "fs/promises";
import { resolve } from "path";
import { runPipeline } from "./pipeline";

/**
 * MCP tool wrapper for the job-apply module.
 *
 * Wire into your main src/index.ts in 3 small spots (see INTEGRATION.md):
 *   1. import { jobApplyTools, handleJobApplyTool } from "./job-apply/mcp";
 *   2. spread ...jobApplyTools into your ListTools response's tools array
 *   3. in the CallTool handler, before your "unknown tool" throw:
 *        const r = await handleJobApplyTool(name, args);
 *        if (r) return r;
 */

const CANDIDATES = resolve(__dirname, "data", "candidates.json");

export const jobApplyTools = [
  {
    name: "discover_jobs",
    description:
      "Run one job-discovery cycle: scrape sources.json -> filter to new-grad SWE in target locations -> dedup against the tracker sheet -> score -> write candidates.json. Returns a summary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_candidates",
    description: "List the most recently discovered job candidates from candidates.json.",
    inputSchema: {
      type: "object",
      properties: { count: { type: "number", description: "How many to show (default 20)" } },
      additionalProperties: false,
    },
  },
];

/** Returns a tool result if `name` belongs to this module, otherwise null. */
export async function handleJobApplyTool(name: string, args: any) {
  if (name === "discover_jobs") {
    const jobs = await runPipeline();
    const lines = jobs
      .slice(0, 15)
      .map((j) => `- ${j.company} - ${j.title} [${j.location}]${j.score != null ? ` (${j.score})` : ""}`)
      .join("\n");
    return {
      content: [{ type: "text", text: `Discovered ${jobs.length} candidate(s).\n\n${lines || "(none)"}` }],
    };
  }

  if (name === "list_candidates") {
    const count = Number(args?.count ?? 20);
    let data: any;
    try {
      data = JSON.parse(await readFile(CANDIDATES, "utf8"));
    } catch {
      return { content: [{ type: "text", text: "No candidates.json yet - run discover_jobs first." }] };
    }
    const jobs = (data.jobs ?? []).slice(0, count);
    const lines = jobs
      .map(
        (j: any, i: number) =>
          `${i + 1}. ${j.company} - ${j.title} [${j.location}]${j.score != null ? ` (${j.score})` : ""}\n   ${j.url}`,
      )
      .join("\n");
    return {
      content: [{ type: "text", text: `${jobs.length} candidate(s) (generated ${data.generatedAt}):\n\n${lines}` }],
    };
  }

  return null;
}
