import { describe, expect, it } from 'vitest';
import { pageEntryCandidates, pageSourceUnchanged, validatePageRewrite } from '../src/chat/pageRedesign';
import { detectFrameworkFromPkg } from '../src/detect/frameworkFromPkg';
import { tailwindTokensFromStylePatch } from '../src/appMode/styleAdapters';
import { __testExports } from '../src/codeModifier/CodeModifier';

describe('source redesign protection', () => {
  it('accepts a valid component rewrite with the existing exports', () => {
    expect(validatePageRewrite('App.tsx', 'export default function App() { return <p>Old</p>; }',
      'export default function App() { return <main><p>New</p></main>; }').valid).toBe(true);
  });
  it('refuses malformed JSX and removed exports', () => {
    const original = 'export const Card = () => <p>Old</p>;';
    expect(validatePageRewrite('Card.tsx', original, 'export const Card = () => <p>Broken;').valid).toBe(false);
    expect(validatePageRewrite('Card.tsx', original, 'const Other = () => <p>New</p>;').valid).toBe(false);
  });
  it('preserves client directives and imported dependencies', () => {
    const original = '"use client"; import { useState } from "react"; export default function App() { return <p>Old</p>; }';
    expect(validatePageRewrite('App.tsx', original, original.replace('Old', 'New')).valid).toBe(true);
    expect(validatePageRewrite('App.tsx', original, original.replace('"use client";', '').replace('Old', 'New')).valid).toBe(false);
    expect(validatePageRewrite('App.tsx', original, original.replace('import { useState } from "react";', '').replace('Old', 'New')).valid).toBe(false);
  });
  it('refuses HTML that removes or alters existing scripts', () => {
    const original = '<!doctype html><html><head><script src="app.js"></script></head><body>Old</body></html>';
    expect(validatePageRewrite('page.html', original, original.replace('Old', 'New')).valid).toBe(true);
    expect(validatePageRewrite('page.html', original, original.replace('<script src="app.js"></script>', '')).valid).toBe(false);
    expect(validatePageRewrite('page.html', original, original.replace('app.js', 'different.js')).valid).toBe(false);
  });
  it('refuses empty, unchanged, and unsupported source rewrites', () => {
    expect(validatePageRewrite('App.tsx', 'hello', '').valid).toBe(false);
    expect(validatePageRewrite('App.tsx', 'hello', 'hello').valid).toBe(false);
    expect(validatePageRewrite('App.vue', 'hello', '<template>New</template>').valid).toBe(false);
  });
  it('detects edits made after preview, including whitespace', () => {
    expect(pageSourceUnchanged('const a = 1;', 'const a = 1;')).toBe(true);
    expect(pageSourceUnchanged('const a = 1;', 'const a = 2;')).toBe(false);
    expect(pageSourceUnchanged('const a = 1;', 'const a = 1;\n')).toBe(false);
  });
});

describe('framework-aware page and style detection', () => {
  it('finds Next App Router and Pages Router routes without selecting an element', () => {
    expect(pageEntryCandidates('next', '/pricing?plan=pro')).toContain('app/pricing/page.tsx');
    expect(pageEntryCandidates('next', '/pricing')).toContain('src/pages/pricing.jsx');
    expect(pageEntryCandidates('next')).toContain('pages/index.tsx');
    expect(pageEntryCandidates('next', '/../private')).toEqual([]);
  });
  it('recognizes meta-frameworks even when they also depend on Vite', () => {
    for (const [dep, framework] of [['astro', 'astro'], ['@sveltejs/kit', 'sveltekit'], ['nuxt', 'nuxt'], ['@remix-run/dev', 'remix']]) {
      expect(detectFrameworkFromPkg({ devDependencies: { vite: '*', [dep]: '*' } })).toBe(framework);
    }
  });
  it('preserves every property of mixed Tailwind patches', () => {
    expect(tailwindTokensFromStylePatch({ backgroundColor: 'red', boxShadow: '0 2px 4px black', letterSpacing: '2px' }))
      .toEqual(['bg-[red]', 'shadow-[0_2px_4px_black]', '[letter-spacing:2px]']);
    expect(tailwindTokensFromStylePatch({ display: 'contents' })).toEqual(['[display:contents]']);
  });
  it('replaces conflicting utilities while preserving variants and custom classes', () => {
    const source = 'export const Card = () => <div className="card bg-red-500 hover:bg-green-500 p-4">X</div>;';
    const updated = __testExports.ensureJsxClassNamesAtLocation(source, 'Card.tsx', 1, ['bg-[blue]', 'p-[20px]']);
    expect(updated).toContain('card hover:bg-green-500 bg-[blue] p-[20px]');
    expect(updated).not.toContain('bg-red-500');
  });
});
