export function parsePortFromScript(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw;

  // Common env var patterns: PORT=4000, cross-env PORT=4000, STORYBOOK_PORT=6006, etc.
  const envMatch = s.match(
    /(?:^|\s)(?:cross-env\s+)?(?:PORT|STORYBOOK_PORT|LADLE_PORT|DOCUSAURUS_PORT)=(\d{2,5})(?:\s|$)/i,
  );
  if (envMatch) {
    const n = Number(envMatch[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Flags: --port 3001, --port=3001, -p 3001
  const flagMatch = s.match(/(?:^|\s)(?:--port(?:\s+|=)|-p\s+)(\d{2,5})(?:\s|$)/i);
  if (flagMatch) {
    const n = Number(flagMatch[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Some tools use --listen <port>
  const listenMatch = s.match(/(?:^|\s)--listen(?:\s+|=)(\d{2,5})(?:\s|$)/i);
  if (listenMatch) {
    const n = Number(listenMatch[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return undefined;
}
