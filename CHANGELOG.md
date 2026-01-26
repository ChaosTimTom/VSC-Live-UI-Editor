# Changelog

All notable changes to this project will be documented in this file.

## 0.2.2

- Docs: Help now opens an interactive, navigable Help viewer panel (multi-page docs + search + quick links).

## 0.2.3

- Docs: rewrote help pages into step-by-step beginner walkthroughs.
- Docs: updated HELP.md to match the new beginner-friendly guidance.
- Marketplace: improved listing metadata (description, banner, badges, keywords).

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

## 0.1.3

- App Mode security: only accepts messages from the expected iframe origin/source.
- App Mode security: warns/confirm before connecting to a non-local dev server URL.
- App Mode security: blocks edits/resolution to files outside the workspace/app root (path traversal guardrail).

## 0.1.4

- App Mode: **Style Target** adapters — Auto/Tailwind/CSS file/Inline with visible reason + override.
- App Mode: Tailwind adapter (adds utility tokens to `className` when possible) and CSS-file class adapter improvements.
- App Mode: Mobile workflow — viewport presets plus safe-area/warning overlays.
- App Mode: Inline safety warning for layout-sensitive inline edits, with per-project “remember my choice” options.

## 0.1.2

- App Mode: clearer selection state when an element is selected but cannot be mapped to source (Identity: Unmapped).
- App Mode: one-click Stable IDs enable flow (writes a dev-only Babel plugin into your app and patches Vite/Next config).
- App Mode: optional Tauri Shim (early-injected) to help Tauri-targeted apps load in a browser iframe for navigation.
- App Mode: improved iframe permissions for clipboard operations.

## 0.1.1

- Initial Marketplace release.
