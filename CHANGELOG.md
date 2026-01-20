# Changelog

All notable changes to this project will be documented in this file.

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
