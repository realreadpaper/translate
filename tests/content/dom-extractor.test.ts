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

  it('excludes text from blocked descendants inside selected nodes', () => {
    document.body.innerHTML = `
      <article>
        <p>Keep this <code>drop this</code> text.</p>
        <blockquote>Visible <pre>hidden block</pre> content.</blockquote>
      </article>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Keep this  text.' },
      { id: 'seg-1', text: 'Visible  content.' },
    ]);
  });

  it('ignores immersive translate controls from extracted segments', () => {
    document.body.innerHTML = `
      <article>
        <p>Hello world</p>
        <div data-immersive-ignore="true">
          <button>译</button>
          <p>当前模式：双语</p>
        </div>
      </article>
    `;

    expect(extractSegments(document.body)).toEqual([{ id: 'seg-0', text: 'Hello world' }]);
  });

  it('assigns DOM segment ids to the same elements returned for translation', () => {
    document.body.innerHTML = `
      <article>
        <p><code>const skipped = true</code></p>
        <p>First visible paragraph.</p>
        <p>Second visible paragraph.</p>
      </article>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'First visible paragraph.' },
      { id: 'seg-1', text: 'Second visible paragraph.' },
    ]);

    const paragraphs = Array.from(document.querySelectorAll('p'));
    expect((paragraphs[0] as HTMLElement).dataset.segmentId).toBeUndefined();
    expect((paragraphs[1] as HTMLElement).dataset.segmentId).toBe('seg-0');
    expect((paragraphs[2] as HTMLElement).dataset.segmentId).toBe('seg-1');
  });
});
