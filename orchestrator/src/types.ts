export type JobMode = "sync" | "review" | "adopt";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_issues"
  | "failed";

export interface JobInput {
  mode: JobMode;
  path?: string;
  repoUrl?: string;
}

export interface JobEvent<TData extends Record<string, unknown> = Record<string, unknown>> {
  id: number;
  type: string;
  time: string;
  data: TData;
}

export interface Job {
  id: string;
  status: JobStatus;
  input: JobInput;
  createdAt: string;
  updatedAt: string;
  events: JobEvent[];
  issueCount: number;
}

export interface JobSnapshot {
  id: string;
  status: JobStatus;
  input: JobInput;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  eventCount: number;
  events?: JobEvent[];
}

export interface StepOptions {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  allowNonZero?: boolean;
  markIssueOnNonZero?: boolean;
}

export interface StepResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}
