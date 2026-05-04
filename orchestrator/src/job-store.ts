import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Job, JobEvent, JobInput, JobSnapshot, JobStatus } from "./types.js";

/**
 * In-memory job/event store used by the local runner and the container process.
 *
 * Cloudflare Durable Objects should own durable state in the hosted control
 * plane. The runner container deliberately keeps only process-local state so it
 * can focus on executing Clayers core and streaming stdout/stderr events.
 */
export class JobStore {
  private readonly jobs = new Map<string, Job>();
  private readonly events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(1000);
  }

  create(input: JobInput): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: `job_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      status: "queued",
      input: sanitizeInput(input),
      createdAt: now,
      updatedAt: now,
      events: [],
      issueCount: 0
    };
    this.jobs.set(job.id, job);
    this.addEvent(job.id, "job.queued", { input: job.input });
    return job;
  }

  list(): JobSnapshot[] {
    return [...this.jobs.values()].map((job) => snapshotJob(job, false));
  }

  get(id: string): Job | null {
    return this.jobs.get(id) ?? null;
  }

  setStatus(id: string, status: JobStatus, data: Record<string, unknown> = {}): void {
    const job = this.get(id);
    if (!job) return;
    job.status = status;
    job.updatedAt = new Date().toISOString();
    this.addEvent(id, `job.${status}`, data);
  }

  markIssue(id: string): void {
    const job = this.get(id);
    if (job) {
      job.issueCount += 1;
      job.updatedAt = new Date().toISOString();
    }
  }

  addEvent(id: string, type: string, data: Record<string, unknown> = {}): JobEvent | null {
    const job = this.get(id);
    if (!job) return null;
    const event: JobEvent = {
      id: job.events.length + 1,
      type,
      time: new Date().toISOString(),
      data
    };
    job.events.push(event);
    job.updatedAt = event.time;
    this.events.emit(id, event);
    return event;
  }

  subscribe(id: string, listener: (event: JobEvent) => void): () => void {
    this.events.on(id, listener);
    return () => this.events.off(id, listener);
  }
}

export function snapshotJob(job: Job, includeEvents = true): JobSnapshot {
  const snapshot: JobSnapshot = {
    id: job.id,
    status: job.status,
    input: job.input,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    issueCount: job.issueCount,
    eventCount: job.events.length
  };

  if (includeEvents) {
    snapshot.events = job.events;
  }

  return snapshot;
}

function sanitizeInput(input: JobInput): JobInput {
  const sanitized: JobInput = { mode: input.mode };
  if (input.path) sanitized.path = input.path;
  if (input.repoUrl) sanitized.repoUrl = redactUrl(input.repoUrl);
  return sanitized;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = "redacted";
      url.password = "redacted";
    }
    return url.toString();
  } catch {
    return value.replace(/:\/\/[^/@]+@/, "://redacted@");
  }
}
