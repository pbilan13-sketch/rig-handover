// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of runs/<night>.jsonl, after parsing at the edge. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for a night. Times keep the log's offset. */
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

/** A night read from disk. `rows` is sorted by job. */
export type Night = {
  night: string;
  rows: DigestRow[];
  /** Lines that did not parse; counted, never thrown. */
  badLines: number;
};

/** Returns null when runs/<night>.jsonl does not exist. */
export type ReadNight = (runsDir: string, night: string) => Night | null;
