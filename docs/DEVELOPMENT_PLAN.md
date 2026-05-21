# Minse EPUB Viewer Development Plan

## Goal

Build a polished PC EPUB viewer first. Keep the architecture friendly to future Android and iOS work, but do not expand the initial scope into a full cross-platform product unless the PC version is stable.

## Product Scope

### MVP

- Open local EPUB files.
- Render EPUB content with table of contents navigation.
- Save and restore the last reading location per book.
- Turn pages with mouse wheel and keyboard.
- Zoom with `Ctrl + Wheel`.
- Change font family, font size, line height, margin, and theme.
- Add, remove, and navigate bookmarks.
- Highlight selected text with color choices.
- Add text notes to selected text.
- Enable text-only mode that hides images and decorative media.

### Post-MVP

- Free-position text box annotations.
- Annotation export.
- Full text search.
- Reading statistics.
- Optional cloud sync.
- Android and iOS ports after the PC model is stable.

## PC App Direction

Recommended stack:

- Electron for the desktop shell.
- React for UI.
- A reusable JavaScript core package for book metadata, settings, annotations, and text-only rendering rules.
- EPUB rendering through a proven library such as `epubjs` when dependencies are added.
- Local persistence through JSON files or SQLite. Start with JSON for speed, then migrate only if data grows complex.

## Core Features

### Reading

- File open dialog.
- Recent books.
- Table of contents sidebar.
- Current location and progress display.
- Last location restore.
- Page navigation through mouse wheel, arrow keys, and clickable controls.

### Viewing

- `Ctrl + Wheel` zoom in/out.
- Font family selection.
- Font size controls.
- Line height controls.
- Margin controls.
- Theme selection: light, dark, sepia.
- Text-only mode:
  - Hide `img`, `svg`, `picture`, `video`, `audio`, `canvas`, `figure`, and background images.
  - Keep normal text layout as much as possible.
  - Warn when a book appears to be image-only or has too little text.

### Bookmarks

- Add bookmark at current EPUB CFI or location.
- Remove bookmark.
- Show bookmark list.
- Jump to bookmark.

### Highlights

- Capture selected text range.
- Save range by EPUB CFI when available.
- Store selected quote for fallback display.
- Support multiple colors.
- Delete highlight.

### Text Notes

- Attach a note to a selected text range.
- Show notes in a sidebar.
- Jump from note to source location.
- Edit and delete notes.

### Text Box Notes

This is intentionally post-MVP because EPUB content is reflowable.

Suggested storage:

- Chapter identifier.
- Nearby anchor CFI.
- Relative x/y position within the viewport or paragraph region.
- Box size and style.
- Text content.

## Local Data Model

```json
{
  "bookId": "sha256-of-file-or-stable-epub-identity",
  "title": "Book title",
  "lastLocation": "epub-cfi-or-location",
  "settings": {
    "fontFamily": "system",
    "fontSize": 18,
    "lineHeight": 1.6,
    "margin": 24,
    "theme": "light",
    "zoom": 1,
    "textOnly": false
  },
  "bookmarks": [],
  "highlights": [],
  "notes": [],
  "textBoxes": []
}
```

## Development Strategy

Use test-driven development for the reusable core:

1. Write tests for settings validation and merging.
2. Write tests for text-only CSS generation.
3. Write tests for bookmark and annotation models.
4. Implement core modules until tests pass.
5. Add Electron UI and connect it to the tested core.
6. Add integration tests around user flows.

## Milestones

### Milestone 1: Core Foundation

- Project skeleton.
- Test runner.
- Core settings model.
- Text-only mode rules.
- Bookmark/highlight/note model helpers.

### Milestone 2: Desktop Shell

- Electron window.
- File open flow.
- EPUB render placeholder.
- App layout with toolbar and sidebars.

### Milestone 3: Reading UX

- EPUB rendering.
- Wheel page turning.
- `Ctrl + Wheel` zoom.
- Font and theme controls.
- Last location save/restore.

### Milestone 4: Personal Data

- Bookmarks.
- Highlights.
- Text notes.
- Local persistence.

### Milestone 5: Stabilization

- Large EPUB testing.
- Korean, English, Japanese EPUB testing.
- Image-heavy EPUB testing.
- Error handling.
- Backup and recovery for local reading data.

## Test Case Plan

### Unit Tests

- Default reading settings are valid.
- Partial settings merge without losing defaults.
- Invalid settings are clamped or rejected.
- Text-only mode CSS hides image/media elements.
- Text-only mode can preserve captions when requested.
- Bookmark creation requires a location.
- Highlight creation requires a range and selected text.
- Text note creation requires a range and note body.
- Annotation IDs are stable strings.

### Integration Tests

- Opening a book creates a book record.
- Moving pages updates last location.
- Changing font persists per book.
- Enabling text-only mode persists per book.
- Adding a bookmark appears in the sidebar.
- Clicking a bookmark restores the location.
- Adding a highlight survives reload.
- Adding a note survives reload.

### UI Tests

- Main toolbar renders.
- Settings panel opens and changes reading options.
- Wheel without Ctrl navigates pages.
- Wheel with Ctrl changes zoom.
- Text-only toggle hides images.
- Annotation sidebar lists highlights and notes.

