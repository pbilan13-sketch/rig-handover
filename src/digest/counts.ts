import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isNight, parseLine } from './read.js';

export type NightCounts = { ok: number; retry: number; fail: number };

/** Count log lines per status for a night. Null when the night's file cannot be read. */
export function countNight(runsDir: string, night: string): NightCounts | null {
  if (!isNight(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const l = parseLine(raw);
    if (l) counts[l.status] += 1;
  }
  return counts;
}
