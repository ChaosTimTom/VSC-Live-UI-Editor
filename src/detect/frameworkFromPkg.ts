import type { AppFramework } from '../appMode/appUtils';

export function detectFrameworkFromPkg(pkg: any): AppFramework {
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, unknown>;
  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

  if (has('next')) return 'next';
  if (has('vite') || has('@vitejs/plugin-react') || has('@vitejs/plugin-react-swc')) return 'vite';
  if (has('react-scripts')) return 'cra';
  if (has('astro')) return 'astro';
  if (has('@sveltejs/kit')) return 'sveltekit';
  if (has('@angular/core')) return 'angular';
  if (has('@vue/cli-service')) return 'vue';
  if (has('nuxt')) return 'nuxt';
  if (has('gatsby')) return 'gatsby';
  if (has('@remix-run/dev') || has('remix')) return 'remix';

  return 'generic';
}

export function detectDevScript(pkg: any): 'dev' | 'start' | undefined {
  const scripts = (pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object')
    ? (pkg.scripts as Record<string, unknown>)
    : {};

  if (typeof scripts.dev === 'string' && scripts.dev.trim()) return 'dev';
  if (typeof scripts.start === 'string' && scripts.start.trim()) return 'start';
  return undefined;
}
