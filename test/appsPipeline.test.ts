import { describe, expect, it } from 'vitest';

import * as fs from 'fs';
import * as path from 'path';

import type { AppCandidate } from '../src/appMode/appUtils';
import { buildDetectedAppsFromCandidates } from '../src/detect/apps';

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('buildDetectedAppsFromCandidates (fixtures)', () => {
  it('infers ports from scripts and ranks apps', async () => {
    const root = path.resolve(__dirname, '../samples/fixtures/apps');

    const pkgs: Record<string, any> = {
      next: readJson(path.join(root, 'next/package.json')),
      vite: readJson(path.join(root, 'vite/package.json')),
      astro: readJson(path.join(root, 'astro/package.json')),
    };

    const candidates: AppCandidate[] = [
      // Keep roots comparable so framework priority is what decides order.
      { root: { id: 'vite' } as any, label: 'apps/ui', framework: 'vite', devScript: 'dev' },
      { root: { id: 'next' } as any, label: 'apps/site', framework: 'next', devScript: 'dev' },
      { root: { id: 'astro' } as any, label: 'apps/docs', framework: 'astro', devScript: 'dev' },
    ];

    const apps = await buildDetectedAppsFromCandidates(candidates, {
      relRootOf: (r: any) => `apps/${r.id}`,
      readPackageJsonAtRoot: async (r: any) => pkgs[r.id],
      limit: 6,
    });

    // Ranking: next should come first.
    expect(apps[0]?.framework).toBe('next');

    // Port inference: from scripts where available.
    const next = apps.find(a => a.framework === 'next');
    expect(next?.defaultPort).toBe(3003);

    const vite = apps.find(a => a.framework === 'vite');
    expect(vite?.defaultPort).toBe(5175);

    // No explicit port in astro fixture => framework default.
    const astro = apps.find(a => a.framework === 'astro');
    expect(astro?.defaultPort).toBe(4321);
  });

  it('respects limit', async () => {
    const candidates: AppCandidate[] = [
      { root: { id: 'a' } as any, label: 'a', framework: 'vite', devScript: 'dev' },
      { root: { id: 'b' } as any, label: 'b', framework: 'next', devScript: 'dev' },
    ];

    const apps = await buildDetectedAppsFromCandidates(candidates, {
      relRootOf: (r: any) => r.id,
      readPackageJsonAtRoot: async () => ({ scripts: { dev: 'vite' } }),
      limit: 1,
    });

    expect(apps).toHaveLength(1);
  });
});
