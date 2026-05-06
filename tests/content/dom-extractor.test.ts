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

  it('extracts visible text from generic rendered containers without site selectors', () => {
    document.body.innerHTML = `
      <main>
        <div class="article-card">
          <span>Generic card title</span>
          <span> with a plain span body.</span>
        </div>
        <section>
          <div>
            <span>Nested generic content.</span>
          </div>
        </section>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Generic card title with a plain span body.' },
      { id: 'seg-1', text: 'Nested generic content.' },
    ]);

    const card = document.querySelector('.article-card') as HTMLElement;
    expect(card.dataset.segmentId).toBe('seg-0');
  });

  it('skips invisible generic text while keeping visible siblings', () => {
    document.body.innerHTML = `
      <main>
        <div style="display: none">Hidden by display.</div>
        <div style="visibility: hidden">Hidden by visibility.</div>
        <div hidden>Hidden by attribute.</div>
        <div aria-hidden="true">Hidden for assistive tech.</div>
        <div><span>Visible generic text.</span></div>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Visible generic text.' },
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
      { id: 'seg-0', text: 'Keep this text.' },
      { id: 'seg-1', text: 'Visible content.' },
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

  it('skips common page chrome while keeping article content', () => {
    document.body.innerHTML = `
      <header role="banner">
        <nav aria-label="Primary">
          <a href="/home"><span>Home</span></a>
          <a href="/explore"><span>Explore</span></a>
          <a href="/notifications"><span>Notifications</span></a>
          <a href="/messages"><span>Messages</span></a>
          <a href="/bookmarks"><span>Bookmarks</span></a>
        </nav>
      </header>
      <main>
        <article data-testid="tweet">
          <div data-testid="User-Name">Someone</div>
          <div data-testid="tweetText">Only the post body should be translated.</div>
          <div role="group" aria-label="Reply, Repost, Like">Reply Repost Like</div>
        </article>
        <form role="search">
          <label>Search</label>
          <button>Submit</button>
        </form>
      </main>
      <footer>Terms Privacy Cookies</footer>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Only the post body should be translated.' },
    ]);
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

  it('extracts X/Twitter post text containers', () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="tweet">
          <div data-testid="User-Name">Someone</div>
          <div data-testid="tweetText" lang="en">
            <span>First line of the post.</span>
            <span> Second line with #AI</span>
          </div>
          <div role="group" aria-label="Reply, Repost, Like">Actions</div>
        </article>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'First line of the post. Second line with #AI' },
    ]);

    const tweetText = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    expect(tweetText.dataset.segmentId).toBe('seg-0');
  });

  it('extracts X/Twitter post body when X renders it as a lang text container', () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span>Someone</span>
            <span>@someone</span>
          </div>
          <div lang="en" dir="auto">
            <span>X rendered this body without tweetText.</span>
            <span> It should still be translated.</span>
          </div>
          <div role="group" aria-label="Reply, Repost, Like">Reply Repost Like</div>
        </article>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      {
        id: 'seg-0',
        text: 'X rendered this body without tweetText. It should still be translated.',
      },
    ]);

    const body = document.querySelector('[lang="en"][dir="auto"]') as HTMLElement;
    expect(body.dataset.segmentId).toBe('seg-0');
  });

  it('skips X/Twitter native translation labels while keeping the post body', () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="tweet">
          <div data-testid="User-Name">Someone</div>
          <div data-testid="translationIndicator" lang="en">
            Translated from Chinese <span>Show original</span>
          </div>
          <div data-testid="tweetText" lang="zh">
            原文正文需要进入翻译队列。
          </div>
        </article>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: '原文正文需要进入翻译队列。' },
    ]);
  });

  it('extracts X/Twitter long article body containers without translating post chrome', () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="tweet">
          <div data-testid="User-Name">
            <span>Author Name</span>
            <span>@author</span>
          </div>
          <div data-testid="tweetText">Short preview before opening the article.</div>
          <div data-testid="card.layoutLarge.detail">
            <h1 lang="en">Long article headline</h1>
            <div lang="en">
              <p>Long article first paragraph.</p>
              <p>Long article second paragraph with more detail.</p>
            </div>
          </div>
          <div role="group" aria-label="Reply, Repost, Like">Reply Repost Like</div>
        </article>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Short preview before opening the article.' },
      { id: 'seg-1', text: 'Long article headline' },
      {
        id: 'seg-2',
        text: 'Long article first paragraph. Long article second paragraph with more detail.',
      },
    ]);
  });

  it('keeps existing segment ids stable when dynamic content is inserted before them', () => {
    document.body.innerHTML = `
      <main>
        <div data-testid="tweetText">First visible tweet</div>
        <div data-testid="tweetText">Second visible tweet</div>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'First visible tweet' },
      { id: 'seg-1', text: 'Second visible tweet' },
    ]);

    const firstTweet = document.querySelector('[data-testid="tweetText"]') as HTMLElement;
    const insertedTweet = document.createElement('div');
    insertedTweet.dataset.testid = 'tweetText';
    insertedTweet.textContent = 'New tweet inserted above';
    firstTweet.before(insertedTweet);

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-2', text: 'New tweet inserted above' },
      { id: 'seg-0', text: 'First visible tweet' },
      { id: 'seg-1', text: 'Second visible tweet' },
    ]);
  });

  it('extracts Reddit post and comment body containers without actions', () => {
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <div slot="title">A useful Reddit post title</div>
          <div slot="text-body">
            <p>Post body first paragraph.</p>
            <p>Post body second paragraph.</p>
          </div>
          <div slot="post-meta">r/example u/person</div>
          <div slot="actionRow">Vote Reply Share</div>
        </shreddit-post>
        <shreddit-comment>
          <div slot="comment">
            <p>This is a useful comment.</p>
          </div>
          <div slot="commentMeta">u/commenter</div>
        </shreddit-comment>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'A useful Reddit post title' },
      { id: 'seg-1', text: 'Post body first paragraph. Post body second paragraph.' },
      { id: 'seg-2', text: 'This is a useful comment.' },
    ]);

    expect(
      (document.querySelector('[slot="text-body"]') as HTMLElement).dataset.segmentId,
    ).toBe('seg-1');
    expect((document.querySelector('[slot="comment"]') as HTMLElement).dataset.segmentId).toBe(
      'seg-2',
    );
  });

  it('extracts Reddit post title before media instead of the outer media container', () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="post-container">
          <div data-testid="post-content">
            <h3>the cost is low, the value is high, you're going to bed.</h3>
            <img alt="Screenshot text that should not be part of the title" src="/post.png" />
          </div>
        </article>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: "the cost is low, the value is high, you're going to bed." },
    ]);

    expect((document.querySelector('h3') as HTMLElement).dataset.segmentId).toBe('seg-0');
    expect(
      (document.querySelector('[data-testid="post-content"]') as HTMLElement).dataset.segmentId,
    ).toBeUndefined();
  });

  it('skips Reddit recommendation and post chrome text to avoid duplicate translations', () => {
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <div slot="recommendation-context">
            <p>Because you've visited this community before</p>
          </div>
          <div slot="post-meta">
            <p>Because you've visited this community before</p>
            <span>r/ClaudeCode</span>
          </div>
          <a slot="title">Useful Claude Code tip</a>
        </shreddit-post>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Useful Claude Code tip' },
    ]);
  });

  it('does not run generic paragraph extraction inside Reddit post containers', () => {
    document.body.innerHTML = `
      <main>
        <shreddit-post>
          <a slot="title">Precise Reddit title</a>
          <div>
            <p>Generic paragraph inside Reddit chrome should be ignored.</p>
          </div>
          <div slot="text-body">
            <p>Precise Reddit body should be translated.</p>
          </div>
        </shreddit-post>
        <article>
          <p>Normal page paragraph should still be translated.</p>
        </article>
      </main>
    `;

    expect(extractSegments(document.body)).toEqual([
      { id: 'seg-0', text: 'Precise Reddit title' },
      { id: 'seg-1', text: 'Precise Reddit body should be translated.' },
      { id: 'seg-2', text: 'Normal page paragraph should still be translated.' },
    ]);
  });
});
