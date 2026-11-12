import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

export function isNight(night: string): boolean {
  return NIGHT.test(night);
}

/** Parse one log line at the edge. Returns null for anything that is not a valid run line. */
export function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || o.job === '') return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status as RunStatus)) return null;
  if (o.owner !== null && o.owner !== undefined && typeof o.owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  return {
    at: o.at,
    job: o.job,
    status: o.status as RunStatus,
    owner: typeof o.owner === 'string' ? o.owner : null,
    ...(typeof o.error === 'string' ? { error: o.error } : {}),
  };
}

/** Fold parsed lines (in log order) into one row per job, sorted by job. */
export function toRows(lines: RunLine[]): DigestRow[] {
  const byJob = new Map<string, DigestRow>();
  for (const l of lines) {
    const r = byJob.get(l.job);
    if (!r) {
      byJob.set(l.job, {
        job: l.job,
        owner: l.owner,
        runs: 1,
        retries: l.status === 'retry' ? 1 : 0,
        lastStatus: l.status,
        lastError: l.error ?? null,
        firstAt: l.at,
        lastAt: l.at,
      });
      continue;
    }
    r.runs += 1;
    if (l.status === 'retry') r.retries += 1;
    r.lastStatus = l.status;
    if (l.error !== undefined) r.lastError = l.error;
    if (l.owner !== null) r.owner = l.owner;
    r.lastAt = l.at;
  }
  return [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (l) lines.push(l);
    else badLines += 1;
  }
  return { night, rows: toRows(lines), badLines } satisfies Night;
};
