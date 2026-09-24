import { spawn } from "node:child_process";

export interface RegenerationJob {
  status: "running" | "succeeded" | "failed";
  startedAt: string;
  finishedAt: string | null;
  logTail: string[];
}

// globalThis so dev-server module reloads don't orphan a running job.
const g = globalThis as unknown as { __helpRegenJob?: RegenerationJob };

export function getRegenerationJob(): RegenerationJob | null {
  return g.__helpRegenJob ?? null;
}

/**
 * Spawns the Playwright capture pipeline as a child process and returns
 * immediately, so the server action (and the UI) never block on it.
 * Needs Chromium + a reachable app at baseUrl — i.e. a dev/self-hosted box,
 * not a serverless function.
 */
export function startRegenerationJob(baseUrl: string): RegenerationJob {
  if (g.__helpRegenJob?.status === "running") return g.__helpRegenJob;

  const job: RegenerationJob = {
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logTail: [],
  };
  g.__helpRegenJob = job;

  const child = spawn("npx", ["tsx", "scripts/capture-workflow-screenshots.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, BASE_URL: baseUrl },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const push = (chunk: Buffer) => {
    job.logTail.push(...chunk.toString().split("\n").filter(Boolean));
    job.logTail = job.logTail.slice(-12);
  };
  child.stdout.on("data", push);
  child.stderr.on("data", push);
  child.on("error", (e) => {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.logTail.push(e.message);
  });
  child.on("close", (code) => {
    job.status = code === 0 ? "succeeded" : "failed";
    job.finishedAt = new Date().toISOString();
  });
  return job;
}
