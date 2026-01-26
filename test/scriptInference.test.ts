import { describe, expect, it } from 'vitest';

import { parsePortFromScript } from '../src/detect/scriptInference';

describe('parsePortFromScript', () => {
  it('parses PORT= style env vars', () => {
    expect(parsePortFromScript('PORT=4000 vite')).toBe(4000);
    expect(parsePortFromScript('cross-env PORT=4001 next dev')).toBe(4001);
  });

  it('parses common preview env vars', () => {
    expect(parsePortFromScript('STORYBOOK_PORT=6007 start-storybook')).toBe(6007);
    expect(parsePortFromScript('LADLE_PORT=6100 ladle serve')).toBe(6100);
  });

  it('parses --port and -p flags', () => {
    expect(parsePortFromScript('vite --port 5174')).toBe(5174);
    expect(parsePortFromScript('vite --port=5175')).toBe(5175);
    expect(parsePortFromScript('serve -p 1234')).toBe(1234);
  });

  it('parses --listen flag', () => {
    expect(parsePortFromScript('foo --listen 3333')).toBe(3333);
    expect(parsePortFromScript('foo --listen=3334')).toBe(3334);
  });

  it('returns undefined when no port is found', () => {
    expect(parsePortFromScript(undefined)).toBeUndefined();
    expect(parsePortFromScript(123)).toBeUndefined();
    expect(parsePortFromScript('no port here')).toBeUndefined();
    expect(parsePortFromScript('PORT=abc')).toBeUndefined();
  });
});
