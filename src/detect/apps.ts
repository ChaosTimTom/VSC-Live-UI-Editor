import type { AppCandidate, AppFramework } from '../appMode/appUtils';
import type { DetectionReportApp } from '../bridge/messages';

import { parsePortFromScript } from './scriptInference';
import { rankApps } from './ranking';

export function defaultPortForFramework(fw: AppFramework | undefined): number {
  switch (fw) {
    case 'next':
    case 'cra':
    case 'nuxt':
    case 'remix':
      return 3000;
    case 'vite':
    case 'sveltekit':
      return 5173;
    case 'astro':
      return 4321;
    case 'angular':
      return 4200;
    case 'vue':
      return 8080;
    case 'gatsby':
      return 8000;
    default:
      return 3000;
  }
}

export type BuildAppsOptions = {
  /** Convert an AppCandidate.root to workspace-relative 'root' string */
  relRootOf: (root: AppCandidate['root']) => string;
  /** Read JSON for a root-relative path; should return parsed package.json */
  readPackageJsonAtRoot: (root: AppCandidate['root']) => Promise<any | undefined>;
  limit?: number;
};

export async function buildDetectedAppsFromCandidates(
  candidates: AppCandidate[],
  opts: BuildAppsOptions,
): Promise<DetectionReportApp[]> {
  const apps: DetectionReportApp[] = await Promise.all(
    candidates.map(async (a) => {
      const relRoot = String(opts.relRootOf(a.root) || '').replace(/\\/g, '/');
      const label = a.label || relRoot || (a.root as any)?.fsPath || relRoot;
      const scriptName = a.devScript === 'start' ? 'start' : a.devScript === 'dev' ? 'dev' : undefined;

      let inferredPort: number | undefined;
      if (scriptName) {
        const pkg = await opts.readPackageJsonAtRoot(a.root);
        const scripts = (pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object')
          ? (pkg.scripts as Record<string, unknown>)
          : {};
        inferredPort = parsePortFromScript(scripts[scriptName]);
      }

      const defaultPort = (typeof inferredPort === 'number' && Number.isFinite(inferredPort) && inferredPort > 0)
        ? inferredPort
        : defaultPortForFramework(a.framework);

      return {
        root: relRoot,
        framework: a.framework,
        devScript: a.devScript,
        scriptName,
        defaultPort,
        isTauri: a.isTauri ? true : undefined,
        label,
      };
    }),
  );

  return rankApps(apps, opts.limit ?? 6);
}
