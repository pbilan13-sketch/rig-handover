import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/index.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n).not.toBeNull();
    expect(n!.badLines).toBe(1);
    expect(n!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds runs, retries, last status/error and times per job', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    const fx = rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(fx).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', owner: 'rook' });
    expect(fx.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(fx.lastAt).toBe('2026-10-29T01:37:00+01:00');
    const nb = rows.find((r) => r.job === 'notes/backup')!;
    expect(nb).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a row whose owner is null', () => {
    const dr = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render')!;
    expect(dr.owner).toBeNull();
    expect(dr.lastError).toBeNull();
  });

  it('returns null for a night with no file or a bad night name', () => {
    expect(readNight('runs', '2000-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-01-01.jsonl'), '');
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts unparsable and malformed lines, never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-01-02.jsonl'),
      ['{"at":"t","job":"a","status":"ok","owner":"x"}', '{oops', '{"at":"t","job":"b","status":"weird","owner":"x"}', '[]'].join('\n'),
    );
    const n = readNight(dir, '2026-01-02')!;
    expect(n.badLines).toBe(3);
    expect(n.rows).toHaveLength(1);
  });
});
