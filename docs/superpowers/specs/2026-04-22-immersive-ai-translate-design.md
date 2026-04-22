# Immersive AI Translate Design

**Date:** 2026-04-22

**Status:** Draft approved in conversation, pending file review

## 1. Summary

Immersive AI Translate is a Chrome / Edge browser extension for immersive full-page translation. The MVP focuses on translating web page content into a target language while preserving reading flow, page structure, and user control. The extension supports multiple translation providers, defaults to bilingual display, and lets users switch between original-only, translated-only, and bilingual reading modes without reloading the page.

The first release is intentionally limited to a local-first extension architecture. Users configure API keys and provider settings directly in the extension. Login, cloud sync, membership, and server-side proxying are explicitly out of scope for MVP, but the design keeps those paths open through clear adapter and transport boundaries.

## 2. Product Goals

### 2.1 Primary goals

- Let users translate the current web page into a chosen target language with one primary action.
- Make the translated page comfortable to read, not just technically translated.
- Support multiple AI and translation providers so users can choose based on quality, cost, and speed.
- Preserve the original page and allow instant switching between display modes.
- Provide a practical local-first MVP that can be implemented and tested with strict TDD.

### 2.2 Non-goals for MVP

- User login or registration
- Pro membership or billing
- Server-side request forwarding
- Cloud settings sync
- Hover translation
- Text selection translation
- PDF, image, or subtitle translation
- Cross-device collaboration features

## 3. Target Users

- Users who regularly read foreign-language articles, blogs, and documentation in the browser
- Users who want better quality than basic machine translation
- Users who want to compare different AI providers
- Users who prefer controlling their own API keys instead of depending on a closed platform

## 4. Core User Scenarios

### 4.1 Full-page translation

The user opens a web page, clicks the extension, and starts translation. The extension extracts the main readable text blocks, sends them to the selected provider, and renders the translated result back into the page.

### 4.2 Bilingual reading

The extension defaults to bilingual mode. Users can read original and translated content together and switch to translated-only or original-only mode without needing another translation request.

### 4.3 Provider switching

Users can configure multiple providers and switch between them from the extension UI. The extension uses the selected provider for subsequent page translations.

### 4.4 Local configuration

Users can configure API key, model, base URL, source language, target language, and display mode in the extension settings stored locally with browser storage.

## 5. MVP Scope

### 5.1 In scope

- Chrome / Edge browser extension
- Full-page immersive translation
- Default bilingual display
- Display mode switching:
  - bilingual
  - translated-only
  - original-only
- Source and target language selection
- Source language auto-detection support in provider config and translation flow
- Provider support:
  - OpenAI-compatible API
  - DeepSeek
  - At least one traditional translation service implementation
  - Custom OpenAI-compatible base URL
- Local settings page for provider credentials and defaults
- Robust page content extraction and segmented translation
- Graceful failure handling with partial success support
- Restore original page view without breaking layout

### 5.2 Explicit exclusions

- Login system
- Remote account identity
- Paid plan / Pro gating
- Cloud proxy / relay
- Usage billing
- Hover / selection translation
- Translation memory
- Glossary management
- OCR or image extraction

## 6. UX Requirements

### 6.1 Translation UX

- Translation must start from a clear primary action in the popup.
- Users must receive clear feedback for idle, loading, success, partial success, and failure states.
- The page should remain readable throughout translation.
- Partial completion is better than failing the whole page.
- Users must always be able to restore the original page.

### 6.2 Reading modes

- Default mode is bilingual.
- Users can switch display mode without re-requesting translation.
- The original text should remain recoverable even in translated-only mode.

### 6.3 Provider UX

- Switching providers should be straightforward in the popup or settings.
- Invalid provider configuration should produce readable, actionable errors.
- Users should not need to repeatedly open deep settings for common actions.

## 7. Success Metrics

- A first-time user can configure a provider and translate a page within 3 minutes.
- The extension can successfully translate common article, blog, and documentation pages at a usable level.
- Failure does not damage the original page experience.
- Users perceive the workflow as more convenient than copy-pasting content into a chat tool.

## 8. Technical Architecture

### 8.1 High-level architecture

The MVP uses a Manifest V3 browser extension architecture with four main layers:

1. Popup / Options UI
2. Background service worker
3. Content script
4. Provider adapter layer

This structure isolates UI, translation orchestration, DOM manipulation, and provider-specific API logic. It keeps the codebase testable and creates clean extension points for future server-side transport and account-backed configuration.

### 8.2 Responsibilities by layer

#### Popup / Options UI

- Start page translation
- Select provider
- Select source and target languages
- Switch display mode
- Configure API key, base URL, and model
- Surface user-readable state and errors

#### Background service worker

- Read settings
- Validate provider configuration
- Coordinate translation requests
- Batch segments for translation
- Route calls to the selected provider adapter
- Normalize provider errors
- Send results and status back to the page

#### Content script

- Extract translatable text segments from the current page
- Track current page translation session state
- Render translation output into the DOM
- Toggle reading modes
- Restore original page state

#### Provider adapter layer

- Build requests for each provider
- Parse provider responses
- Normalize provider-specific failures
- Expose provider metadata and capabilities

## 9. Proposed Code Boundaries

The initial code structure should separate shared domain types, background orchestration, page-side extraction/rendering, and persistence.

### 9.1 Shared

- `src/shared/types`
- `src/shared/config`
- `src/shared/messages`

Responsibilities:

- Shared types for providers, languages, segments, settings, session state, and translation results
- Default config and schema helpers
- Typed message contracts between popup, background, and content script

### 9.2 Background

- `src/background/providers`
- `src/background/translator`
- `src/background/messaging`

Responsibilities:

- Provider registry
- Config validation
- Translation orchestration
- Batch and retry logic
- Message handling for popup/content communication

### 9.3 Content

- `src/content/dom-extractor`
- `src/content/segment-renderer`
- `src/content/page-session`

Responsibilities:

- Extract safe text nodes from the page
- Track page translation state
- Render bilingual / translated-only / original-only modes
- Restore the page on demand

### 9.4 Storage

- `src/storage/settings`

Responsibilities:

- Persist local settings through `chrome.storage.local`
- Provide a stable abstraction for future remote settings support

## 10. Full-Page Translation Flow

1. User opens the popup and clicks the translate action.
2. Popup sends `START_PAGE_TRANSLATION` to background.
3. Background loads saved settings and validates selected provider config.
4. Background asks the content script to collect translatable segments from the current tab.
5. Content script extracts stable segments and returns metadata keyed by segment id.
6. Background groups segments into translation batches.
7. Background invokes the selected provider adapter.
8. Provider returns normalized translated segments or batch-level errors.
9. Background sends translated results and status updates back to the content script.
10. Content script renders translation results into the page and updates session state.
11. Popup and page state reflect progress, success, partial success, or failure.

Key design decisions:

- DOM extraction and API communication are separated.
- Segment ids link extraction output to translated output.
- The original DOM is preserved so display mode switching and restore do not require another extraction pass.

## 11. Provider Strategy

### 11.1 Supported provider families

- OpenAI-compatible APIs
- DeepSeek
- Traditional translation provider implementation for MVP
- Custom OpenAI-compatible endpoint via configurable base URL

### 11.2 Unified provider interface

Each provider adapter should expose:

- `validateConfig()`
- `translateSegments()`
- `normalizeError()`
- `getMeta()`

This keeps adapters focused on request construction, response parsing, and error mapping. DOM logic, UI, and session handling remain outside provider code.

### 11.3 Transport expectations

- OpenAI-compatible, DeepSeek, and custom-compatible endpoints should share a transport path where possible.
- Traditional translation providers may require a dedicated transport implementation.
- A transport abstraction should be introduced early so future server-side relay can be added without rewriting provider logic.

## 12. Content Extraction and Rendering

### 12.1 Extraction rules

The content script should identify readable text content while skipping nodes that should not be translated or altered, including:

- `script`
- `style`
- `code`
- `pre`
- `textarea`
- `input`
- empty or whitespace-only nodes

Segments should preserve page order and carry stable ids for later mapping.

### 12.2 Translation batching

The page must not be sent as one giant prompt. Segments should be grouped into bounded batches using character or token thresholds. This reduces failures, controls cost, and makes progress reporting possible.

### 12.3 Rendering strategy

The MVP should use text-node anchored rendering instead of replacing large HTML blocks wholesale.

Expected behavior:

- Keep original content accessible
- Insert translated content in a way that preserves layout as much as possible
- Support bilingual, translated-only, and original-only modes
- Restore original view by removing or disabling translation artifacts

### 12.4 Why this rendering strategy

- It is less destructive than broad `innerHTML` replacement.
- It simplifies restore behavior.
- It supports instant mode switching without another network request.
- It reduces the risk of breaking interactive page structure.

## 13. Error Handling Model

### 13.1 Error categories

- Configuration errors
  - missing API key
  - invalid base URL
  - missing model when required
- Network errors
  - timeout
  - offline
  - rate limit
  - upstream server failure
- Provider errors
  - authentication failure
  - unsupported request format
  - quota or billing issues
- Page errors
  - no translatable content
  - injection not available
  - target node invalidated during render
- Partial failures
  - one or more batches fail while others succeed

### 13.2 Error handling principles

- Translate as much as possible before surfacing failure.
- Never damage the original page because of a failed translation.
- Return actionable errors to the user in plain language.
- Preserve successful batches even if some batches fail.
- Make retry behavior local to the failed batch when possible.

## 14. Extensibility Paths

The MVP deliberately excludes cloud and premium features, but the following abstractions should be included early:

- `Transport` interface: local direct requests now, remote gateway later
- `SettingsSource` interface: local settings now, remote-backed settings later
- `ProviderCapability` metadata: supports richer future provider-specific features
- `FeatureFlags` or equivalent extensibility mechanism for hover translation and selection translation

These abstractions should stay lightweight in MVP and only cover needs already implied by the design.

## 15. TDD Strategy

### 15.1 Core rule

No production code should be added before a failing test exists for the behavior being implemented.

### 15.2 Testing layers

#### Unit tests

Focus:

- provider config validation
- request construction
- error normalization
- batching logic
- settings defaults and schema behavior
- session state transitions

#### DOM behavior tests

Focus:

- translatable node extraction
- skipping excluded nodes
- stable segment ordering
- bilingual rendering
- translated-only / original-only switching
- restore behavior

#### Background integration tests

Focus:

- popup-to-background message flow
- settings loading
- provider routing
- partial failure handling
- normalized result delivery

#### End-to-end tests

Focus:

- loading the extension
- opening a test page
- triggering full-page translation
- seeing bilingual output
- switching display modes
- surfacing readable config errors

## 16. Recommended Implementation Stack

- TypeScript
- Vite
- React for popup and options pages
- Native TypeScript modules for content script and background worker
- Vitest for unit and integration tests
- jsdom for DOM behavior tests
- Playwright for extension end-to-end tests

This stack balances fast feedback with realistic extension verification.

## 17. MVP Delivery Sequence

The implementation should progress in small, testable slices:

1. Settings schema and defaults
2. Provider registry and config validation
3. Segment extraction
4. Batch translation orchestrator
5. DOM renderer and display mode switching
6. Background/content messaging
7. Popup MVP
8. Options page MVP
9. End-to-end stabilization

Each slice should follow strict Red -> Green -> Refactor loops and produce a working increment.

## 18. Acceptance Criteria

The MVP is considered complete when:

- Unit tests pass
- DOM behavior tests pass
- Background integration tests pass
- At least one full-page translation E2E path passes
- At least one provider config error path passes
- Manual verification confirms:
  - a real article-like page can be translated
  - display modes can switch without retranslation
  - the original page can be restored
  - layout damage is limited and acceptable for MVP

## 19. Open Decisions Resolved

The following decisions were confirmed during design:

- Platform: Chrome / Edge browser extension
- Primary MVP scenario: full-page immersive translation
- Provider direction: OpenAI-compatible, DeepSeek, traditional translation implementation, custom base URL
- Display default: bilingual with switching support
- Key management plan: local and cloud are both part of long-term product direction, but MVP is local-first
- Login / Pro / relay: excluded from MVP

## 20. Risks and Mitigations

### 20.1 DOM variability risk

Risk:
Different sites structure content unpredictably, making extraction and render consistency difficult.

Mitigation:
Keep extraction rules conservative, preserve original nodes, and test against representative article-like fixtures early.

### 20.2 Provider inconsistency risk

Risk:
Different providers return different response shapes, error behaviors, and latency profiles.

Mitigation:
Use strict adapter interfaces and normalized error/result models.

### 20.3 MV3 runtime constraints

Risk:
Background service workers and content-script coordination can be fragile if state is not well-contained.

Mitigation:
Keep session state explicit, messages typed, and integration tests focused on message boundaries.

### 20.4 Scope expansion risk

Risk:
Adding login, cloud sync, selection translation, or hover translation too early will dilute MVP quality.

Mitigation:
Treat those as later roadmap items and keep MVP implementation aligned to the approved scope in this document.
