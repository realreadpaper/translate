import { describe, expect, it } from 'vitest';

import { extractSegments } from '../../src/content/dom-extractor';

describe('extractSegments', () => {
  it('returns readable text nodes and skips blocked elements', () => {
    document.body.innerHTML = `
      <article>
        <h1>Hello world</h1>
        <p>Paragraph one.</p>
        <script>console.log('skip')</script>
        <code>const x = 1</code>
        <p>Paragraph two.</p>
      </article>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Hello world' },
      { id: 'seg-1', text: 'Paragraph one.' },
      { id: 'seg-2', text: 'Paragraph two.' },
    ]);
  });
});
