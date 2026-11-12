import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/index.js';

// Fixtures live in a temp dir; runs/ is read-only and never touched here.
const NORMAL = '2026-10-29';
const EMPTY = '2026-10-30';
const BAD = '2026-10-31';
const MISSING = '2026-11-01';

let runsDir: string;
let app: Hono;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  // Written in log order, not job order: rig/rotate-logs first, lane/sync second.
  writeFileSync(
    join(runsDir, `${NORMAL}.jsonl`),
    [
      '{"at":"2026-10-29T01:00:00+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
      '{"at":"2026-10-29T01:00:05+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"upstream 503"}',
      '{"at":"2026-10-29T01:05:05+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [
      '{"at":"2026-10-31T02:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      '{"at":"x","job":"a","status":"ok"',
      '{"at":"2026-10-31T03:00:00+01:00","job":"rig/rotate-logs","status":"fail","owner":"lane-07","error":"disk full"}',
      '',
    ].join('\n'),
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

/** Job names in the order the HTML table lists them. */
function jobsInPage(html: string): string[] {
  return [...html.matchAll(/<tr[^>]*>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1] ?? '');
}

describe('GET /digest/:night (page)', () => {
  it('200 for a normal night, with each job in the table', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`digest · ${NORMAL}`);
    expect(jobsInPage(html)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(html).toContain('upstream 503');
  });

  it('404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for that night');
  });

  it('200 and "nothing ran" for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('did not parse');
  });

  it('200, warns about the bad line, and still shows the good rows', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line did not parse');
    expect(jobsInPage(html)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(html).toContain('disk full');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 for a normal night, rows in job order', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(body.rows[0]).toMatchObject({ job: 'lane/sync', runs: 2, retries: 1, lastStatus: 'ok' });
  });

  it('404 with an error for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `no run log for ${MISSING}` });
  });

  it('200 with no rows and zero bad lines for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('200 with badLines 1 and the good rows still there', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(body.rows[1]).toMatchObject({ job: 'rig/rotate-logs', lastStatus: 'fail', lastError: 'disk full' });
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${BAD}`)).text();
    const json = (await (await app.request(`/api/digest/${BAD}`)).json()) as Night;
    expect(jobsInPage(html)).toEqual(json.rows.map((r) => r.job));
  });
});
