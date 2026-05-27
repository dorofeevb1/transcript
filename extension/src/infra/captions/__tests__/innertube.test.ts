import { describe, expect, it } from 'vitest';
import { parseCaptionXml } from '../innertube';

const SAMPLE_XML = `<?xml version="1.0" encoding="utf-8" ?>
<timedtext format="3">
<body>
<p t="1200" d="2160">All right, so here we are</p>
<p t="5318" d="2656">the cool thing about these guys</p>
</body>
</timedtext>`;

describe('innertube parseCaptionXml', () => {
  it('parses format 3 <p t d> tags (milliseconds)', () => {
    const segments = parseCaptionXml(SAMPLE_XML);
    expect(segments.length).toBe(2);
    expect(segments[0].start).toBeCloseTo(1.2, 1);
    expect(segments[0].text).toContain('All right');
    expect(segments[1].start).toBeCloseTo(5.318, 1);
  });

  it('parses classic <text start dur> tags', () => {
    const xml = `<text start="1.0" dur="2.0">Hello</text>`;
    const segments = parseCaptionXml(xml);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe('Hello');
    expect(segments[0].start).toBe(1);
  });
});
