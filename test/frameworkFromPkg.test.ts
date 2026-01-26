import { describe, expect, it } from 'vitest';

import * as fs from 'fs';
import * as path from 'path';

import { detectDevScript, detectFrameworkFromPkg } from '../src/detect/frameworkFromPkg';

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('detectFrameworkFromPkg (fixtures)', () => {
  it('detects frameworks based on dependencies', () => {
    const root = path.resolve(__dirname, '../samples/fixtures/apps');

    const cases: Array<{ dir: string; expected: ReturnType<typeof detectFrameworkFromPkg> }> = [
      { dir: 'next', expected: 'next' },
      { dir: 'vite', expected: 'vite' },
      { dir: 'cra', expected: 'cra' },
      { dir: 'astro', expected: 'astro' },
      { dir: 'sveltekit', expected: 'sveltekit' },
      { dir: 'angular', expected: 'angular' },
      { dir: 'vue', expected: 'vue' },
      { dir: 'nuxt', expected: 'nuxt' },
      { dir: 'gatsby', expected: 'gatsby' },
      { dir: 'remix', expected: 'remix' },
      { dir: 'generic', expected: 'generic' },
    ];

    for (const c of cases) {
      const pkg = readJson(path.join(root, c.dir, 'package.json'));
      expect(detectFrameworkFromPkg(pkg)).toBe(c.expected);
    }
  });
});

describe('detectDevScript', () => {
  it('prefers dev, then start', () => {
    expect(detectDevScript({ scripts: { dev: 'foo', start: 'bar' } })).toBe('dev');
    expect(detectDevScript({ scripts: { start: 'bar' } })).toBe('start');
  });

  it('returns undefined when neither dev nor start exist', () => {
    expect(detectDevScript({ scripts: { serve: 'x' } })).toBeUndefined();
    expect(detectDevScript({})).toBeUndefined();
  });
});
