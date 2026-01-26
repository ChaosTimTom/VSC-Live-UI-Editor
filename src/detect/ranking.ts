export type RankedApp = {
  root: string;
  label: string;
  framework:
    | 'vite'
    | 'next'
    | 'cra'
    | 'astro'
    | 'sveltekit'
    | 'angular'
    | 'vue'
    | 'nuxt'
    | 'gatsby'
    | 'remix'
    | 'generic';
  isTauri?: boolean;
};

export function frameworkScore(fw: RankedApp['framework']): number {
  switch (fw) {
    case 'next':
      return 100;
    case 'vite':
      return 95;
    case 'sveltekit':
      return 90;
    case 'astro':
      return 88;
    case 'remix':
      return 85;
    case 'nuxt':
      return 82;
    case 'cra':
      return 78;
    case 'angular':
      return 76;
    case 'vue':
      return 74;
    case 'gatsby':
      return 70;
    case 'generic':
    default:
      return 40;
  }
}

export function rootBonus(relRoot: string): number {
  const lower = String(relRoot || '').toLowerCase();
  let score = 0;
  if (lower === '.' || lower === '') score += 15;
  if (lower.startsWith('apps/')) score += 8;
  if (lower.startsWith('packages/')) score += 6;
  if (lower.includes('/web')) score += 6;
  if (lower.includes('/app')) score += 4;
  if (lower.includes('example') || lower.includes('demo') || lower.includes('samples/')) score -= 6;
  return score;
}

export function rankApps<T extends RankedApp>(apps: T[], limit = 6): T[] {
  const scored = apps.map(a => ({
    a,
    score: frameworkScore(a.framework) + rootBonus(a.root) + (a.isTauri ? 2 : 0),
  }));

  scored.sort((x, y) => (y.score - x.score) || x.a.label.localeCompare(y.a.label));
  return scored.slice(0, Math.max(1, limit)).map(x => x.a);
}
