import type { DetectionReportPreviewTarget } from '../bridge/messages';

import { parsePortFromScript } from './scriptInference';

export type PackageInfo = {
  /** workspace-relative folder */
  root: string;
  /** parsed package.json */
  pkg: any;
  /** optional hint from caller (e.g. extension can scan for HTML files) */
  hasHtml?: boolean;
};

function findScriptByName(scripts: Record<string, unknown>, names: string[]): string | undefined {
  for (const name of names) {
    if (typeof scripts[name] === 'string' && String(scripts[name]).trim()) return name;
  }
  return undefined;
}

function findScriptByCommand(scripts: Record<string, unknown>, matcher: RegExp): string | undefined {
  for (const [name, cmd] of Object.entries(scripts)) {
    if (typeof cmd !== 'string') continue;
    if (matcher.test(cmd)) return name;
  }
  return undefined;
}

function getScriptText(scripts: Record<string, unknown>, scriptName: string | undefined): string | undefined {
  if (!scriptName) return undefined;
  const v = scripts[scriptName];
  return typeof v === 'string' ? v : undefined;
}

function inferPort(scripts: Record<string, unknown>, scriptName: string | undefined, fallback: number): number {
  const inferred = parsePortFromScript(getScriptText(scripts, scriptName));
  return (typeof inferred === 'number' && Number.isFinite(inferred) && inferred > 0) ? inferred : fallback;
}

function inferUrlPath(_scripts: Record<string, unknown>, _scriptName: string | undefined, fallback: string): string {
  // Best-effort: keep simple, avoid false positives.
  // Storybook commonly uses /iframe.html; keep caller's fallback.
  return fallback;
}

function looksLikeDevHarness(scripts: Record<string, unknown>): boolean {
  const common = ['storybook', 'start-storybook', 'ladle', 'styleguidist', 'styleguide', 'docusaurus', 'vitepress', 'vuepress', 'docsify', 'cosmos'];
  for (const [k, v] of Object.entries(scripts)) {
    if (!k || typeof v !== 'string') continue;
    const key = k.toLowerCase();
    if (common.some(c => key.includes(c))) return true;
    const cmd = v.toLowerCase();
    if (common.some(c => cmd.includes(c))) return true;
  }
  return false;
}

function kindPriority(k: unknown): number {
  switch (k) {
    case 'storybook':
      return 100;
    case 'ladle':
      return 90;
    case 'react-cosmos':
      return 80;
    case 'styleguidist':
      return 70;
    case 'docusaurus':
      return 60;
    case 'vitepress':
      return 50;
    case 'vuepress':
      return 45;
    case 'docsify':
      return 40;
    case 'vite-mpa':
      return 30;
    default:
      return 10;
  }
}

export function detectPreviewTargetsFromPackages(packages: PackageInfo[]): DetectionReportPreviewTarget[] {
  const out: DetectionReportPreviewTarget[] = [];
  const seenIds = new Set<string>();

  const pushTarget = (t: DetectionReportPreviewTarget) => {
    if (seenIds.has(t.id)) return;
    seenIds.add(t.id);
    out.push(t);
  };

  for (const info of packages) {
    const relRoot = String(info.root || '').replace(/\\/g, '/');
    const pkg = info.pkg;
    if (!pkg || typeof pkg !== 'object') continue;

    const scripts = (pkg.scripts && typeof pkg.scripts === 'object') ? (pkg.scripts as Record<string, unknown>) : {};
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) } as Record<string, unknown>;
    const hasDep = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

    if (!Object.keys(scripts).length && !Object.keys(deps).length) continue;

    const pickScript = (names: string[], commandMatcher?: RegExp): string | undefined => {
      return findScriptByName(scripts, names) ?? (commandMatcher ? findScriptByCommand(scripts, commandMatcher) : undefined);
    };

    // Storybook
    const storybookScript = pickScript(['storybook', 'storybook:dev', 'start-storybook', 'sb', 'sb:dev'], /(start-storybook|\bstorybook\b)/i);
    if (
      storybookScript ||
      hasDep('@storybook/react') ||
      hasDep('@storybook/vue') ||
      hasDep('@storybook/angular') ||
      hasDep('@storybook/svelte') ||
      hasDep('@storybook/nextjs') ||
      hasDep('@storybook/core')
    ) {
      if (storybookScript) {
        const port = inferPort(scripts, storybookScript, 6006);
        const urlPath = inferUrlPath(scripts, storybookScript, '/iframe.html');
        pushTarget({
          id: `storybook:${relRoot}:${storybookScript}`,
          label: 'Storybook',
          root: relRoot,
          scriptName: storybookScript,
          defaultPort: port,
          urlPath,
          kind: 'storybook',
        });
      }
    }

    // Ladle
    const ladleScript = pickScript(['ladle', 'ladle:serve', 'ladle:dev'], /\bladle\b/i);
    if (ladleScript || hasDep('@ladle/react')) {
      if (ladleScript) {
        const port = inferPort(scripts, ladleScript, 61000);
        pushTarget({
          id: `ladle:${relRoot}:${ladleScript}`,
          label: 'Ladle',
          root: relRoot,
          scriptName: ladleScript,
          defaultPort: port,
          urlPath: '/',
          kind: 'ladle',
        });
      }
    }

    // Styleguidist
    const sgScript = pickScript(['styleguidist', 'styleguide'], /(styleguidist|styleguide)/i);
    if (sgScript || hasDep('react-styleguidist')) {
      if (sgScript) {
        const port = inferPort(scripts, sgScript, 6060);
        pushTarget({
          id: `styleguidist:${relRoot}:${sgScript}`,
          label: 'Styleguidist',
          root: relRoot,
          scriptName: sgScript,
          defaultPort: port,
          urlPath: '/',
          kind: 'styleguidist',
        });
      }
    }

    // Docusaurus
    const docusaurusScript = (hasDep('@docusaurus/core') || hasDep('@docusaurus/preset-classic'))
      ? (pickScript(['start', 'docusaurus', 'docs:start'], /(docusaurus\s+start|\bdocusaurus\b)/i))
      : undefined;
    if (docusaurusScript) {
      const port = inferPort(scripts, docusaurusScript, 3000);
      pushTarget({
        id: `docusaurus:${relRoot}:${docusaurusScript}`,
        label: 'Docusaurus',
        root: relRoot,
        scriptName: docusaurusScript,
        defaultPort: port,
        urlPath: '/',
        kind: 'docusaurus',
      });
    }

    // VitePress
    const vitepressScript = hasDep('vitepress')
      ? pickScript(['docs:dev', 'vitepress', 'dev:docs'], /\bvitepress\s+dev\b/i)
      : undefined;
    if (vitepressScript) {
      const port = inferPort(scripts, vitepressScript, 5173);
      pushTarget({
        id: `vitepress:${relRoot}:${vitepressScript}`,
        label: 'VitePress',
        root: relRoot,
        scriptName: vitepressScript,
        defaultPort: port,
        urlPath: '/',
        kind: 'vitepress',
      });
    }

    // VuePress
    const vuepressScript = (hasDep('@vuepress/core') || hasDep('vuepress'))
      ? pickScript(['docs:dev', 'vuepress', 'dev:docs'], /\bvuepress\s+dev\b/i)
      : undefined;
    if (vuepressScript) {
      const port = inferPort(scripts, vuepressScript, 8080);
      pushTarget({
        id: `vuepress:${relRoot}:${vuepressScript}`,
        label: 'VuePress',
        root: relRoot,
        scriptName: vuepressScript,
        defaultPort: port,
        urlPath: '/',
        kind: 'vuepress',
      });
    }

    // Docsify
    const docsifyScript = hasDep('docsify-cli')
      ? pickScript(['docsify', 'docs:serve', 'docs'], /\bdocsify\s+serve\b/i)
      : undefined;
    if (docsifyScript) {
      const port = inferPort(scripts, docsifyScript, 3000);
      pushTarget({
        id: `docsify:${relRoot}:${docsifyScript}`,
        label: 'Docsify',
        root: relRoot,
        scriptName: docsifyScript,
        defaultPort: port,
        urlPath: '/',
        kind: 'docsify',
      });
    }

    // React Cosmos
    const cosmosScript = (hasDep('react-cosmos') || hasDep('@react-cosmos/core'))
      ? pickScript(['cosmos', 'cosmos:dev', 'dev:cosmos'], /\bcosmos\b/i)
      : undefined;
    if (cosmosScript) {
      const port = inferPort(scripts, cosmosScript, 5000);
      pushTarget({
        id: `react-cosmos:${relRoot}:${cosmosScript}`,
        label: 'React Cosmos',
        root: relRoot,
        scriptName: cosmosScript,
        defaultPort: port,
        urlPath: '/',
        kind: 'react-cosmos',
      });
    }

    // Vite multi-page / webview UI package (fallback)
    if (!looksLikeDevHarness(scripts) && (hasDep('vite') || hasDep('@vitejs/plugin-react') || hasDep('@vitejs/plugin-vue'))) {
      const mpaScript = pickScript(['dev', 'start'], /\bvite\b/i);
      if (mpaScript && info.hasHtml) {
        const port = inferPort(scripts, mpaScript, 5173);
        pushTarget({
          id: `vite-mpa:${relRoot}:${mpaScript}`,
          label: 'Vite (multi-page)',
          root: relRoot,
          scriptName: mpaScript,
          defaultPort: port,
          urlPath: '/',
          kind: 'vite-mpa',
        });
      }
    }
  }

  // Rank for UX: harnesses first, then anything else.
  out.sort((a, b) => {
    const ka = kindPriority(a.kind);
    const kb = kindPriority(b.kind);
    if (kb !== ka) return kb - ka;
    return (a.label || '').localeCompare(b.label || '');
  });

  return out.slice(0, 12);
}
