# Changelog

All notable changes to this project will be documented in this file.

## 0.3.2

### Features
- **Page Redesign (Figma-like):** Ask `@ui-wizard` to redesign an entire page — "redesign this page as a modern SaaS landing page", "give it a dark theme", etc. CSS streams into the live viewport in real-time (~300 ms flushes), then you can approve or reject the result. On approval the CSS is baked into a full file rewrite.
- New message pipeline: `injectPageCss` / `clearPageCss` flows through extension → webview → iframe for both Static HTML and App Mode.

### Bug fixes
- Fixed `isToWebviewMessage` validator missing runtime checks for `injectPageCss`, `clearPageCss`, `workspaceConfig`, and `diffResult` message types (silently returned `false`).

### Tests
- Added 116 new tests for page redesign: intent detection (27+17+9 cases), apply/reject parsing, `stripCodeFences` / `stripJsonFences`, and bridge message validation with edge cases. Total: 143 tests across 10 files.

## 0.3.1

### Bug fixes
- Fixed: `@ui-wizard` always said "Select an element first" in App Mode when the selected element couldn't be mapped to source (unmapped elements). Now records selection context so UI Wizard can respond.
- Fixed: App Mode `elementSelected` messages were dropping `ancestors` and `selectionHints` data, reducing UI Wizard's ability to scope CSS selectors and detect repeated items.

### Marketplace
- Replaced category "Other" with "Programming Languages" for better discoverability.
- Expanded keywords from 22 to 39 (added angular, vue, svelte, astro, nuxt, css editor, visual css, design tool, frontend, web design, prototype, inspector, devtools, and more).
- Added 20 GitHub repository topics for SEO.
- README: added framework badges, demo GIF placeholder, screenshot placeholders, and star/review call-to-action.

## 0.3.0

### Editor tools
- Property Inspector: view and edit every computed CSS property of the selected element, with native color picker and ARIA labels.
- Element Tree: collapsible DOM tree panel with search; click any node to select it in the preview.
- CSS Cascade panel: shows all matching CSS rules, specificity, and overridden properties.
- Diff Preview: before/after HTML diff using LCS algorithm so you can verify changes before saving.
- Responsive Bar: six viewport presets (Mobile S/M/L, Tablet, Laptop, Desktop) with zoom controls and reload.
- Hover Highlight overlay, Spacing Guides, and Dimension Tooltip for visual debugging.

### Element operations (CRUD)
- Insert, Duplicate, Wrap, and Delete elements via toolbar buttons and keyboard shortcuts.
- Keyboard shortcuts: `Ctrl+D` (duplicate), `Ctrl+G` (wrap), `Delete`/`Backspace` (delete).
- Multi-select: `Ctrl+Shift+Click` to toggle, `Ctrl+A` to select all siblings, `Escape` to clear.
- Bulk operations: delete and style changes apply to every selected element.

### Undo / Redo
- Full undo/redo stack (`Ctrl+Z` / `Ctrl+Shift+Z`) for style, text, layout, and CRUD operations.

### Workspace persistence
- `.liveui.json` save/load/restore for session state.

### UI polish
- Unified brand color palette (teal/purple/pink) across all panels and the help viewer.
- Glassmorphic panel backgrounds with backdrop blur.
- Keyboard shortcut badges on toolbar buttons.
- Loading spinner on Welcome screen while workspace scan runs.
- Smooth transitions on all interactive controls.

### Docs
- Rewrote all help pages: keyboard shortcuts, static-html-mode, getting-started, app-mode, troubleshooting.
- Documented all new panels, CRUD operations, multi-select, and undo/redo.
- Added `@ui-wizard` chat participant documentation.

### Marketplace
- Updated framework support table (Angular, Astro, SvelteKit, Vue, Nuxt, Gatsby, Remix now listed).
- Updated controls/shortcuts table with all new keybindings.
- Added VS Code walkthrough for guided first-install experience.

## 0.2.3

- Docs: rewrote help pages into step-by-step beginner walkthroughs.
- Docs: updated HELP.md to match the new beginner-friendly guidance.
- Marketplace: improved listing metadata (description, banner, badges, keywords).

## 0.2.2

- Docs: Help now opens an interactive, navigable Help viewer panel (multi-page docs + search + quick links).

## 0.2.1

- App Mode: collapsible sidebar UI overhaul (React/Vite app-mode page).
- App Mode: fixed CSP so the webview can load ESM module imports (prevents blank screen).
- App Mode: added Help button that opens built-in getting-started + troubleshooting doc.

## 0.1.9

- App Mode: rebuilt controls as a collapsible sidebar (no more top overlay covering the app).
- App Mode: now loads a dedicated Vite/React webview page (`appMode.html`).

## 0.1.8

- Docs/Community: added Discord link + badge and pointed users to Discord for help, ideas/feedback, and sharing wins.

## 0.1.7

- App Mode: Layout Apply is now a 3-mode control: Off / Safe / Full.
  - Safe persists drag moves as margin adjustments (avoids freezing responsive width/height/transform).
  - Full persists drag/resize as width/height/transform (previous behavior).
- App Mode: added Start Backend button to help launch a separate backend/API server when apps need it for navigation/data.
  - Remembers your choice per app root for one-click starts.

## 0.1.6

- Packaging/Performance: bundled the extension with esbuild so the VSIX no longer ships huge `node_modules`.
- App Mode: toolbar is now a floating HUD overlay with transparent background so the app stays visible.

## 0.1.5

- Packaging: fixed VSIX to include runtime dependencies so commands activate correctly after Marketplace install.

## 0.1.4

- App Mode: **Style Target** adapters -- Auto/Tailwind/CSS file/Inline with visible reason + override.
- App Mode: Tailwind adapter (adds utility tokens to `className` when possible) and CSS-file class adapter improvements.
- App Mode: Mobile workflow -- viewport presets plus safe-area/warning overlays.
- App Mode: Inline safety warning for layout-sensitive inline edits, with per-project "remember my choice" options.

## 0.1.3

- App Mode security: only accepts messages from the expected iframe origin/source.
- App Mode security: warns/confirm before connecting to a non-local dev server URL.
- App Mode security: blocks edits/resolution to files outside the workspace/app root (path traversal guardrail).

## 0.1.2

- App Mode: clearer selection state when an element is selected but cannot be mapped to source (Identity: Unmapped).
- App Mode: one-click Stable IDs enable flow (writes a dev-only Babel plugin into your app and patches Vite/Next config).
- App Mode: optional Tauri Shim (early-injected) to help Tauri-targeted apps load in a browser iframe for navigation.
- App Mode: improved iframe permissions for clipboard operations.

## 0.1.1

- Initial Marketplace release.
