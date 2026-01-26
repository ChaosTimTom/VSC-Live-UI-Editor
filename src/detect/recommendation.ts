import type { DetectionReport, DetectionReportApp, DetectionReportPreviewTarget } from '../bridge/messages';

import { defaultPortForFramework } from './apps';

export function buildRecommendedUrl(args: {
  host: string;
  apps: DetectionReportApp[];
  previewTargets?: DetectionReportPreviewTarget[];
}): string | undefined {
  const host = args.host;
  const apps = args.apps ?? [];
  const previewTargets = args.previewTargets;

  const hasApps = apps.length > 0;
  const hasPreviews = Array.isArray(previewTargets) && previewTargets.length > 0;

  if (hasApps) {
    const top = apps[0];
    const port = top?.defaultPort ?? defaultPortForFramework(top?.framework as any);
    return `http://${host}:${port}`;
  }

  if (hasPreviews) {
    const top = previewTargets![0];
    const port = top?.defaultPort ?? 3000;
    const path = (top?.urlPath && top.urlPath.startsWith('/')) ? top.urlPath : '';
    return `http://${host}:${port}${path}`;
  }

  return undefined;
}

export function buildQuickStartNotes(args: {
  env?: DetectionReport['environment'];
  appsDetectedCount: number;
  hasAppsOrPreviews: boolean;
  hasHtmlCandidates: boolean;
}): string[] {
  const notes: string[] = [];
  const env = args.env;

  if (env?.isRemote) {
    notes.push('Remote/Container environment detected. App Mode will use VS Code port forwarding for the injected proxy when needed.');
    if (env.isContainer) notes.push('If your dev server isn’t reachable, ensure the port is forwarded in VS Code Ports panel.');
    if (env.isWsl) notes.push('If you are using WSL, ensure ports are forwarded if the UI runs in WSL.');
  }

  if (args.hasAppsOrPreviews && args.appsDetectedCount > 1) {
    notes.push('Multiple apps detected. App Mode will ask which one to use.');
  }

  if (!args.hasAppsOrPreviews) {
    if (!args.hasHtmlCandidates) {
      notes.push('No dev-server app detected. Use HTML mode, or start App Mode manually if your framework is unsupported.');
    } else {
      notes.push('No dev-server app detected. I found HTML entrypoints you can open directly.');
    }
  }

  return notes;
}
