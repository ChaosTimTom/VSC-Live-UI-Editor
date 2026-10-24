import { describe, expect, it } from 'vitest';
import { rankHtmlCandidates } from '../src/detect/htmlCandidates';

describe('editable HTML discovery', () => {
  it('recommends source instead of the packaged SoundBoard releases from the report', () => {
    const files = Array.from({ length: 50 }, (_, i) => `releases/SoundBoard-1.0.0-beta.${i}-Windows-desktop/resources/app/gui/index.html`);
    const ranked = rankHtmlCandidates([...files, 'gui/index.html', 'src/about.html', 'dist/index.html']);
    expect(ranked.map(candidate => candidate.fileId)).toEqual(['gui/index.html', 'src/about.html']);
  });
  it('keeps build output accessible when it is the only available HTML', () => {
    expect(rankHtmlCandidates(['dist/index.html'])[0]?.fileId).toBe('dist/index.html');
  });
  it('handles Windows separators and release directories consistently', () => {
    expect(rankHtmlCandidates(['Releases\\app\\index.html', 'index.html'])[0]?.fileId).toBe('index.html');
  });
});
