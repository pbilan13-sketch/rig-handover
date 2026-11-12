import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countNight } from '../src/digest/counts.js';

describe('countNight', () => {
  it('counts lines per status and skips bad lines', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-counts-'));
    const l = (job: string, status: string) => JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job, status });
    writeFileSync(join(dir, '2026-10-28.jsonl'), [l('a', 'ok'), l('a', 'retry'), l('a', 'ok'), 'garbage', '', l('b', 'fail')].join('\n'));
    expect(countNight(dir, '2026-10-28')).toEqual({ ok: 2, retry: 1, fail: 1 });
  });

  it('returns null for a missing or malformed night', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-counts-'));
    expect(countNight(dir, '2026-10-29')).toBeNull();
    expect(countNight(dir, '../x')).toBeNull();
  });

  it('reads the real fixture', () => {
    const c = countNight('runs', '2026-10-28');
    expect(c).not.toBeNull();
    expect(c!.ok + c!.retry + c!.fail).toBeGreaterThan(0);
  });
});
