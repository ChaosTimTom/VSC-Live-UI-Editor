import type { DetectionReportHtmlCandidate } from '../bridge/messages';

export function scoreHtmlCandidatePath(rel: string): number {
  const normalized = String(rel || '').replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  const withLeading = lower.startsWith('/') ? lower : `/${lower}`;
  const base = lower.split('/').pop() ?? lower;

  let score = 0;
  if (base === 'index.html' || base === 'index.htm') score += 100;
  if (withLeading.endsWith('/index.html') || withLeading.endsWith('/index.htm')) score += 20;
  if (withLeading.includes('/public/')) score += 35;
  if (withLeading.includes('/src/')) score += 12;
  if (withLeading.includes('/app/')) score += 10;
  if (withLeading.includes('/pages/')) score += 10;
  if (withLeading.includes('/dist/')) score += 18;
  if (withLeading.includes('/build/')) score += 18;
  if (withLeading.includes('/docs/')) score += 8;
  if (withLeading.includes('/storybook')) score += 6;
  // Avoid test fixtures by default.
  if (withLeading.includes('/test') || withLeading.includes('/__tests__') || withLeading.includes('/fixtures/')) score -= 10;

  return score;
}

export function rankHtmlCandidates(files: string[], limit = 12): DetectionReportHtmlCandidate[] {
  const candidates: DetectionReportHtmlCandidate[] = [];

  for (const file of files) {
    const rel = String(file || '').replace(/\\/g, '/');
    if (!rel) continue;
    const score = scoreHtmlCandidatePath(rel);
    candidates.push({ fileId: rel, label: rel, score });
  }

  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.label.localeCompare(b.label));
  return candidates.slice(0, Math.max(1, limit));
}
