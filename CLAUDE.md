# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A vanilla JavaScript PWA (Progressive Web App) for browsing the altonale festival program in Hamburg. Users swipe through event cards Tinder-style to mark events as "Interessant", "Verzichtbar", or "Highlight".

## Running the App

No build step. Serve the files with any HTTP server, for example:

```powershell
npx serve .
# or
python -m http.server 8080
```

Open `index.html` directly in a browser also works for most features, but the service worker requires an HTTP context.

## Architecture

All application logic lives in **three files**:

- [index.html](index.html) — HTML shell; loads js-yaml from CDN, then `app.js`
- [app.js](app.js) — entire app: data parsing, state, UI rendering, gesture handling
- [styles.css](styles.css) — all styling; dark purple theme with pink/yellow accents

Data is a single YAML file ([altonale_2026_programm.yaml](altonale_2026_programm.yaml)) parsed client-side at startup via js-yaml. No backend.

### app.js internals

Entry point: `bindControls()` and `loadYaml()` called at the bottom of the file.

**State** (module-level variables):
- `selectedEvents` — `Map<id, 'interessant'|'verzichtbar'|'highlight'>` tracking user choices
- `deckEvents` — array of events currently in the discover stack
- `viewMode` — `'discover'` or `'interesting'`

**Two view modes:**
- *Entdecken (discover)*: card-stack UI; each card is a DOM element with absolute positioning
- *Interessant*: flat list of events the user marked as interessant or highlight

**Swipe system** (`attachSwipeHandlers`): uses Pointer Events API. Gesture recognized when movement exceeds thresholds (90px horizontal, 100px vertical). Cards animate with CSS transforms during drag; on release they snap to the decision (right → interessant, left → verzichtbar, up → highlight, down → reset/requeue). Stamp overlays (INTERESSANT / VERZICHTBAR / HIGHLIGHT text) appear as visual feedback during the gesture.

**Event IDs**: generated deterministically from `zeitpunkt + ort + titel` at parse time; used as keys in `selectedEvents`.

### PWA

- [manifest.json](manifest.json) — app name "altonale Programm", standalone display mode
- [service-worker.js](service-worker.js) — caches all assets for offline use; cache must be manually versioned when assets change
