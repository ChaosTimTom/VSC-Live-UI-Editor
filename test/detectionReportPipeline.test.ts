import { describe, expect, it } from 'vitest';

import * as fs from 'fs';
import * as path from 'path';

import type { AppCandidate } from '../src/appMode/appUtils';
import type { DetectionReport } from '../src/bridge/messages';

import { buildDetectedAppsFromCandidates } from '../src/detect/apps';
import { rankHtmlCandidates } from '../src/detect/htmlCandidates';
import { detectPreviewTargetsFromPackages, type PackageInfo } from '../src/detect/previewTargets';
import { buildQuickStartNotes, buildRecommendedUrl } from '../src/detect/recommendation';

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('Detection Report pipeline (no VS Code, fixtures)', () => {
  it('builds apps + previews + html candidates + recommendation', async () => {
    const host = '127.0.0.1';

    // 1) Apps (use app fixtures)
    const appsRoot = path.resolve(__dirname, '../samples/fixtures/apps');
    const nextPkg = readJson(path.join(appsRoot, 'next/package.json'));
    const vitePkg = readJson(path.join(appsRoot, 'vite/package.json'));

    const candidates: AppCandidate[] = [
      { root: { id: 'vite' } as any, label: 'apps/ui', framework: 'vite', devScript: 'dev' },
      { root: { id: 'next' } as any, label: 'apps/site', framework: 'next', devScript: 'dev' },
    ];

    const apps = await buildDetectedAppsFromCandidates(candidates, {
      relRootOf: (r: any) => `apps/${r.id}`,
      readPackageJsonAtRoot: async (r: any) => (r.id === 'next' ? nextPkg : vitePkg),
      limit: 6,
    });

    // 2) Preview targets (use preview fixtures)
    const previewsRoot = path.resolve(__dirname, '../samples/fixtures');
    const previewPkgs: PackageInfo[] = [
      { root: 'samples/fixtures/storybook', pkg: readJson(path.join(previewsRoot, 'storybook/package.json')) },
      { root: 'samples/fixtures/ladle', pkg: readJson(path.join(previewsRoot, 'ladle/package.json')) },
      { root: 'samples/fixtures/vite-mpa', pkg: readJson(path.join(previewsRoot, 'vite-mpa/package.json')), hasHtml: true },
    ];
    const previewTargets = detectPreviewTargetsFromPackages(previewPkgs);

    // 3) HTML candidates (synthetic list)
    const htmlCandidates = rankHtmlCandidates(
      [
        'index.html',
        'public/index.html',
        'docs/index.html',
        'src/page.html',
        'test/fixture.html',
      ],
      12,
    );

    // 4) Recommendation + notes
    const recommendedUrl = buildRecommendedUrl({ host, apps, previewTargets });
    const notes = buildQuickStartNotes({
      env: { isRemote: true, isContainer: true },
      appsDetectedCount: apps.length,
      hasAppsOrPreviews: apps.length > 0 || previewTargets.length > 0,
      hasHtmlCandidates: htmlCandidates.length > 0,
    });

    const report: DetectionReport = {
      apps,
      htmlCandidates,
      previewTargets,
      environment: { isRemote: true, isContainer: true },
    };

    // Assertions that cover the full data flow.
    expect(report.apps.length).toBeGreaterThan(0);
    expect(report.previewTargets?.length).toBeGreaterThan(0);
    expect(report.htmlCandidates.length).toBeGreaterThan(0);

    // Ranking: next should be top app.
    expect(report.apps[0]?.framework).toBe('next');

    // Recommendation: prefers apps over previews.
    expect(recommendedUrl).toBe(`http://${host}:${report.apps[0]?.defaultPort}`);

    // HTML ranking sanity: public/index.html should win.
    expect(report.htmlCandidates[0]?.fileId.toLowerCase()).toBe('public/index.html');

    // Notes include remote/container hint.
    expect(notes.some(n => n.toLowerCase().includes('remote/container'))).toBe(true);
  });
});
