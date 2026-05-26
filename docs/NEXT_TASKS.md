# Next Tasks

## Current State

- MVP prototype is functional for local EPUB reading.
- EPUB opening, TOC navigation, last location restore, wheel/page navigation, Ctrl+Wheel zoom, view settings, bookmarks, highlights, notes, annotation export, Electron shell, and native file open are implemented.
- Reader layout bugs recently fixed:
  - Ctrl+Wheel now zooms text/reflow instead of scaling the whole panel.
  - Reader panel expands with the window instead of staying capped at 760px.
  - EPUB margin setting applies symmetrically through padding.
  - Toolbar stays fixed while left/right panels are toggled.
- Font behavior recently updated:
  - Default font is now `Original`, preserving EPUB publisher fonts.
  - Korean-readable font choices are available: System, KoPubWorld Batang/Dotum, Noto Serif/Sans KR, Nanum Myeongjo/Gothic.
  - Legacy font setting values migrate to recommended Korean font choices.
- Local library data now writes a backup copy and can recover from corrupt or missing primary localStorage data.
- `run.bat` starts the dev server through `npm.cmd run dev`.
- Milestone 6 search work has started:
  - Sidebar search panel is available for opened EPUBs.
  - Search walks EPUB spine sections through EPUB.js section search APIs.
  - Search results jump back to EPUB CFI locations.
  - Search results are highlighted in the book body, with toolbar previous/next navigation.
- Toolbar polish has started:
  - Text-like navigation/bookmark/search symbols were replaced with consistent icon-style controls.
- Font UX refinement has started:
  - Settings now show whether selected Korean font choices appear available or will fall back.

## Verified

- `npm.cmd test` passed with 41 tests.
- `node --check web/app.js` passed after the latest UI/font changes.
- Latest verification: `npm.cmd test` passed with 65 tests, and `node --check web/app.js` passed after search wiring.
- Browser automation through the Codex in-app browser failed due to sandbox/runtime startup, so visual checks were done manually by the user and by static/server checks.

## Next Recommended Work

1. Search UX refinement
   - Add live search debounce after typing stops.
   - Consider keyboard shortcuts for previous/next search result.
   - Consider caching section search text for faster repeated searches on large EPUBs.

2. Visual polish pass
   - Tune toolbar spacing, active states, hover states, and disabled states.
   - Consider making the left/right panel toggle icons visually match the reference image more closely.

3. Font UX refinement
   - Consider adding a font preview sample in the settings panel.
   - Decide whether font settings should be global, per-book, or both. Current behavior is per-book because settings are stored on the book record.

4. Stabilization with real EPUB files
   - Test large EPUB files, image-heavy EPUB files, and Korean/Japanese/English mixed EPUB files.
   - Improve error messages for corrupt EPUBs, unsupported files, or memory-heavy books.
   - Watch `logs/app.log` after opening large files for `epub.open.failed`, `window.error`, or `window.unhandledrejection`.

5. Desktop persistence direction
   - Decide whether to keep localStorage for the prototype or move Electron builds to JSON files under the app data directory.
   - If moving to file persistence, add backup/restore around that file too.

6. Integration/UI tests
   - Add browser-level tests for panel toggles, font setting persistence, and EPUB layout reflow after zoom or panel changes.
   - Add tests for `Original` font mode not overriding EPUB `font-family`.

## Useful Commands

```bat
run.bat
```

```powershell
npm.cmd test
node --check web\app.js
Get-Content logs\app.log -Tail 80
```
