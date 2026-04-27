# Ad Cleaning Before Translation Design

## Goal

Hide likely advertising and sponsored content before webpage text is collected for translation, improving page readability and preventing ad copy from being sent to translation providers.

## Architecture

Add a focused content-script module, `src/content/ad-cleaner.ts`, responsible for detecting and hiding ad-like DOM containers. The cleaner marks matched nodes with `data-immersive-ad-hidden="true"` and `data-immersive-ignore="true"` and applies `display: none`, so existing translation extraction skips them without deleting page-owned nodes.

The cleaner runs in three places:

- During content initialization, before auto-translate or floating-ball setup.
- Immediately before collecting page segments.
- Immediately before floating-ball viewport translation batches.

It also watches dynamic DOM insertions with a debounced `MutationObserver`, so late-loading ads are hidden before later translation scans.

## Detection Scope

The first version uses conservative DOM heuristics:

- iframe sources containing ad network hints such as `doubleclick`, `googlesyndication`, `adservice`, `taboola`, or `outbrain`
- element id/class/aria-label/data attributes containing ad hints such as `advert`, `sponsored`, `promoted`, `adsbygoogle`, `ad-slot`, `ad-banner`, `taboola`, or `outbrain`
- common ad containers such as `[data-ad]`, `[data-testid*="ad"]`, `[aria-label*="advert"]`

It avoids touching extension-owned nodes, translated nodes, script/style/input/code content, and document body/html.

## Testing

Unit tests cover:

- hiding common ad containers and marking them as ignored
- preserving normal article content
- excluding hidden ad text from `extractSegments`
- running ad cleanup before auto-translate starts and before segment collection
- cleaning dynamic ad insertions
