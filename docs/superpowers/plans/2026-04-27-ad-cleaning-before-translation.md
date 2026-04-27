# Ad Cleaning Before Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide likely ads before translation extraction or viewport translation begins.

**Architecture:** Add `src/content/ad-cleaner.ts` as a small DOM utility used by the content entrypoint and floating ball. It marks ad nodes as ignored and hidden instead of deleting them, keeping layout disruption lower while preventing translation extraction.

**Tech Stack:** TypeScript, Chrome Extension content scripts, Vitest/jsdom.

---

### Task 1: Ad Cleaner Module

**Files:**
- Create: `src/content/ad-cleaner.ts`
- Test: `tests/content/ad-cleaner.test.ts`

- [ ] Write tests for hiding ad-like containers, preserving article content, and hiding dynamically inserted ad nodes.
- [ ] Run `HOST=127.0.0.1 npm test -- tests/content/ad-cleaner.test.ts` and confirm missing module failure.
- [ ] Implement `cleanAds(root)` and `startAdCleaner(root)` with conservative selectors and markers.
- [ ] Run the same test and confirm it passes.

### Task 2: Translation Ordering

**Files:**
- Modify: `src/content/index.ts`
- Modify: `src/content/floating-ball.ts`
- Test: `tests/content/index.test.ts`
- Test: `tests/content/floating-ball.test.ts`

- [ ] Add tests proving ads are cleaned before auto-translation readiness, page segment collection, and floating-ball translation.
- [ ] Run focused tests and confirm they fail.
- [ ] Wire `cleanAds` into initialization, collection, and viewport translation.
- [ ] Run focused tests and confirm they pass.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/project-overview.md`

- [ ] Document ad cleanup as a content-script capability.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `HOST=127.0.0.1 npm test`.
- [ ] Run `npm run build`.
