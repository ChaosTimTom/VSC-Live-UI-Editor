import { describe, expect, it } from 'vitest';

import { rankApps, type RankedApp } from '../src/detect/ranking';

describe('rankApps', () => {
  it('prioritizes higher-signal frameworks', () => {
    const apps: RankedApp[] = [
      { root: 'apps/ui', label: 'vite-app', framework: 'vite' },
      { root: 'apps/site', label: 'next-app', framework: 'next' },
    ];

    const ranked = rankApps(apps, 6);
    expect(ranked[0]?.framework).toBe('next');
  });

  it('applies root bonuses within the same framework', () => {
    const apps: RankedApp[] = [
      { root: 'packages/web', label: 'pkg', framework: 'vite' },
      { root: '.', label: 'root', framework: 'vite' },
    ];

    const ranked = rankApps(apps, 6);
    expect(ranked[0]?.label).toBe('root');
  });

  it('penalizes examples/demos/samples', () => {
    const apps: RankedApp[] = [
      { root: 'samples/demo', label: 'demo', framework: 'vite' },
      { root: 'apps/web', label: 'prod', framework: 'vite' },
    ];

    const ranked = rankApps(apps, 6);
    expect(ranked[0]?.label).toBe('prod');
  });

  it('gives a small bonus to tauri apps', () => {
    const apps: RankedApp[] = [
      { root: 'apps/web', label: 'plain', framework: 'vite' },
      { root: 'apps/web', label: 'tauri', framework: 'vite', isTauri: true },
    ];

    const ranked = rankApps(apps, 6);
    expect(ranked[0]?.label).toBe('tauri');
  });

  it('respects limit (minimum 1)', () => {
    const apps: RankedApp[] = [
      { root: 'apps/site', label: 'a', framework: 'vite' },
      { root: 'apps/site', label: 'b', framework: 'vite' },
    ];

    expect(rankApps(apps, 1)).toHaveLength(1);
    expect(rankApps(apps, 0)).toHaveLength(1);
  });
});
