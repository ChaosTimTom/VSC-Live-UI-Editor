import { describe, expect, it } from 'vitest';

import * as fs from 'fs';
import * as path from 'path';

import { detectPreviewTargetsFromPackages, type PackageInfo } from '../src/detect/previewTargets';

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('detectPreviewTargetsFromPackages (fixtures)', () => {
  it('detects all supported preview kinds from fixtures', () => {
    const fixturesRoot = path.resolve(__dirname, '../samples/fixtures');

    const packages: PackageInfo[] = [
      { root: 'samples/fixtures/storybook', pkg: readJson(path.join(fixturesRoot, 'storybook/package.json')) },
      { root: 'samples/fixtures/ladle', pkg: readJson(path.join(fixturesRoot, 'ladle/package.json')) },
      { root: 'samples/fixtures/styleguidist', pkg: readJson(path.join(fixturesRoot, 'styleguidist/package.json')) },
      { root: 'samples/fixtures/docusaurus', pkg: readJson(path.join(fixturesRoot, 'docusaurus/package.json')) },
      { root: 'samples/fixtures/vitepress', pkg: readJson(path.join(fixturesRoot, 'vitepress/package.json')) },
      { root: 'samples/fixtures/vuepress', pkg: readJson(path.join(fixturesRoot, 'vuepress/package.json')) },
      { root: 'samples/fixtures/docsify', pkg: readJson(path.join(fixturesRoot, 'docsify/package.json')) },
      { root: 'samples/fixtures/react-cosmos', pkg: readJson(path.join(fixturesRoot, 'react-cosmos/package.json')) },
      // Vite MPA requires an HTML hint (the extension computes this by scanning for *.html).
      { root: 'samples/fixtures/vite-mpa', pkg: readJson(path.join(fixturesRoot, 'vite-mpa/package.json')), hasHtml: true },
    ];

    const targets = detectPreviewTargetsFromPackages(packages);
    const kinds = new Set(targets.map(t => t.kind));

    expect(kinds.has('storybook')).toBe(true);
    expect(kinds.has('ladle')).toBe(true);
    expect(kinds.has('styleguidist')).toBe(true);
    expect(kinds.has('docusaurus')).toBe(true);
    expect(kinds.has('vitepress')).toBe(true);
    expect(kinds.has('vuepress')).toBe(true);
    expect(kinds.has('docsify')).toBe(true);
    expect(kinds.has('react-cosmos')).toBe(true);
    expect(kinds.has('vite-mpa')).toBe(true);

    // Spot-check a couple of inferred ports + URL paths.
    const storybook = targets.find(t => t.kind === 'storybook');
    expect(storybook?.defaultPort).toBe(6006);
    expect(storybook?.urlPath).toBe('/iframe.html');

    const ladle = targets.find(t => t.kind === 'ladle');
    expect(ladle?.defaultPort).toBe(61000);

    const cosmos = targets.find(t => t.kind === 'react-cosmos');
    expect(cosmos?.defaultPort).toBe(5000);
  });

  it('de-dupes targets by id', () => {
    const fixturesRoot = path.resolve(__dirname, '../samples/fixtures');
    const storybookPkg = readJson(path.join(fixturesRoot, 'storybook/package.json'));

    const packages: PackageInfo[] = [
      { root: 'samples/fixtures/storybook', pkg: storybookPkg },
      { root: 'samples/fixtures/storybook', pkg: storybookPkg },
    ];

    const targets = detectPreviewTargetsFromPackages(packages);
    expect(targets.filter(t => t.kind === 'storybook')).toHaveLength(1);
  });
});
