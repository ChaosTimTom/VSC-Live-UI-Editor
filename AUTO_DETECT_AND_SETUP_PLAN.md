# Live UI Editor — Auto Detect + Auto Setup (Master Plan)

This document is the implementation plan + progress tracker for making Live UI Editor:

- Auto-detect more frameworks and repo layouts (including monorepos)
- Auto-setup (install/start/connect) with minimal user input
- Provide a **no-dev-server fallback** that lists editable files directly
- Add universal ways to open “embedded UIs” (webviews, internal tools, component libraries) by discovering a runnable preview/harness

---

## What “universal” means (explicit definition)

Live UI Editor can be universal across *repos and workflows* as long as the UI becomes editable as a **DOM-based surface**.

### Supported UI surfaces (what we can edit)
- **Web DOM UIs** (HTML/CSS/JS): websites, SPAs, docs sites, design systems, component libraries.
- **Web runtimes in desktop shells**: Electron renderer, Tauri web UI, Capacitor web UI — *when they can run in a browser or webview-compatible preview*.
- **Static HTML artifacts**: exported pages, prototypes, generated docs, `dist/*.html`.

### Universal entrypoints (how we open them)
We make “open anything” practical by auto-detecting one of these:
1. **Running URL** (connect to an already-running dev/preview server)
2. **Startable dev/preview server** (we can run a command in the right folder and wait for readiness)
3. **Static entrypoint file** (open an `.html` file directly)
4. **UI harness** (Storybook/Ladle/Styleguidist/Docusaurus/etc.) that exists specifically to render UI in isolation

### Hard limits (still universal, but honest)
- **Non-DOM native toolkits** (WinUI/WPF/WinForms/SwiftUI/Android Views) aren’t directly editable.
- **Canvas/WebGL pixel UIs** aren’t meaningfully editable as DOM.
- **Cross-origin iframes** can’t be injected into unless same-origin or you control the page.

---

## TL;DR goals (what “done” looks like)

- **Welcome screen shows a rich “Detected” report**:
  - Lists detected app candidates (Vite/Next/CRA/Astro/SvelteKit/Angular/Vue/Nuxt/Gatsby/Remix/Generic + Storybook + Docusaurus)
  - For each candidate, shows **folder**, **how to run** (exact command), and **suggested URL(s)**
  - In monorepos: shows a **pick list** in the Welcome UI (not only a later VS Code quick pick)
- **Auto Setup** buttons work end-to-end:
  - Install deps (optional / confirm)
  - Start dev server (integrated or external)
  - Probe until ready
  - Open App Mode already connected
- **If no dev server is detected / set up**:
  - The App Mode section shows a list of editable “static entrypoint” files (HTML) immediately
  - Clicking opens Static HTML mode directly (no file picker)
- **If the UI is “embedded” (webview UI, internal tools, component libs)**:
  - Detected shows one or more **Preview Targets** (a runnable page or harness)
  - One-click starts the preview server and connects App Mode to the right URL/path

---

## Constraints & non-goals

### Constraints
- Must be safe by default:
  - Ask before running installs/commands
  - Never run commands outside the chosen app root
- Must keep existing flows working:
  - Current Static HTML mode
  - Current App Mode (manual connect)
  - Existing `quickStartInfo` logic should evolve, not regress

### Non-goals (for this phase)
- Editing arbitrary VS Code webviews *in-place* (webviews are isolated). We instead rely on a runnable preview/harness.
- Perfect runtime detection for every edge-case framework
- Canvas editing / non-DOM editing

---

## Current state (baseline)

- Extension already detects:
  - Vite + Next via config files + package.json heuristics
  - “Generic app candidates” via `dev`/`start` scripts and dependency heuristics
- Welcome UI shows a basic “Detected” panel
- When no app is detected, it currently only hints “use HTML mode” and does not provide a direct list of candidates

Primary current detection code:
- [src/appMode/appUtils.ts](src/appMode/appUtils.ts) (framework heuristics + app candidates)
- [src/appMode/viteUtils.ts](src/appMode/viteUtils.ts) (package manager detect, http readiness)
- [src/extension.ts](src/extension.ts) (buildQuickStartInfo + command wiring)
- [webview-ui/src/App.tsx](webview-ui/src/App.tsx) (Welcome UI)

---

## Architecture decisions

### A) Single “Detection Report” payload
Instead of ad-hoc fields, emit one structured report from the extension to the webview:

- `apps`: array of app candidates (framework, root, scripts, suggested commands, suggested urls)
- `htmlCandidates`: array of likely editable HTML entrypoints
- `previewTargets`: optional runnable UI targets for “embedded UIs” (webview UI pages, Storybook/Ladle, internal tools)
- `environment`: remote/container hints (optional)

This becomes the one thing the Welcome UI renders.

### B) Welcome UI drives setup; extension executes safely
- Webview picks *what* to do and passes structured intent
- Extension validates paths and runs commands in the right folder

### C) Progressive enhancement
- Phase 1 adds new capabilities without removing old ones
- Phase 2 refines ranking, parsing ports from scripts, etc.

---

## Work breakdown (milestones)

Each milestone has:
- **Outcome**
- **Acceptance** criteria
- **Files** likely touched

### Milestone 0 — Tracking + guardrails
**Outcome**
- Add this plan and commit to incremental, safe changes.

**Acceptance**
- This file exists, is readable, and has a progress log.

**Files**
- This doc

---

### Milestone 1 — Detection report v1 (apps + html candidates)
**Outcome**
- Replace/extend current `quickStartInfo` with a richer payload:
  - `appsDetected` becomes a detailed `apps` list
  - Add `htmlCandidates` list (ranked)

**Acceptance**
- In a repo with no dev server:
  - the Welcome UI shows a list of HTML candidates
- In a repo with apps:
  - the Welcome UI shows a structured list with roots and frameworks

**Implementation notes**
- HTML candidates:
  - scan `**/*.{html,htm}` excluding node_modules
  - rank `index.html`, `public/index.html`, `src/index.html`, etc.
  - cap results (50–150)

**Files**
- [src/extension.ts](src/extension.ts) (detection builder)
- [src/bridge/messages.ts](src/bridge/messages.ts) + [webview-ui/src/bridge/messages.ts](webview-ui/src/bridge/messages.ts) (message schema)
- [webview-ui/src/App.tsx](webview-ui/src/App.tsx) (render results)

---

### Milestone 2 — Click-to-open HTML candidates (no picker)
**Outcome**
- App Mode screen (when no dev server detected) shows “editable file list” and opens instantly.

**Acceptance**
- Clicking a candidate opens it in Static HTML mode without any dialogs.

**Implementation notes**
- Add a new message for “openStaticFile” or extend existing quickStart:
  - e.g. `quickStart: { mode:'static', static:{ target:'file', fileId:'...' } }`
- Extension resolves fileId to URI safely and loads it.

**Files**
- [src/bridge/messages.ts](src/bridge/messages.ts) + [webview-ui/src/bridge/messages.ts](webview-ui/src/bridge/messages.ts)
- [src/extension.ts](src/extension.ts)
- [webview-ui/src/App.tsx](webview-ui/src/App.tsx)

---

### Milestone 3 — Auto Setup actions (install/start/connect)
**Outcome**
- Welcome UI provides “Install deps”, “Start dev server”, “Connect” flows.

**Acceptance**
- A user can go from “Live UI: Open” → “Start App Mode” without manual terminal steps (with confirmation prompts).

**Implementation notes**
- For each app candidate provide:
  - working directory
  - command string (e.g. `pnpm dev`, `npm run dev`, `npm start`)
  - predicted url(s)
- Add a message: `runAppSetup` with:
  - `appRoot` + `action` (`install`|`start`|`connect`)
  - `connectMode` (`integrated`|`external`|`existing`)

**Files**
- [src/extension.ts](src/extension.ts) (terminal orchestration)
- [webview-ui/src/App.tsx](webview-ui/src/App.tsx) (buttons + UX)

---

### Milestone 4 — Better URL inference (ports from scripts + configs)
**Outcome**
- Suggested URL is correct more often.

**Acceptance**
- Common cases work:
  - `vite --port 3001`
  - `PORT=4000 next dev`
  - CRA default 3000

**Implementation notes**
- Parse script strings for:
  - `--port <n>`, `-p <n>`
  - `PORT=<n>` / `cross-env PORT=<n>`
- (Optional) For Vite, parse `vite.config.*` for `server: { port: ... }` (best-effort)

**Files**
- [src/appMode/appUtils.ts](src/appMode/appUtils.ts) or new `src/detect/*`
- [src/extension.ts](src/extension.ts)

---

### Milestone 5 — Framework expansion + ranking
**Outcome**
- Add Storybook + Docusaurus detectors.
- Rank “best” app candidate (more confident frameworks first).

**Acceptance**
- Storybook repos show a clear candidate with port 6006.
- Docusaurus repos show a clear candidate.

**Files**
- [src/appMode/appUtils.ts](src/appMode/appUtils.ts)
- [src/extension.ts](src/extension.ts)

---

### Milestone 6 — Monorepo UX (pick in Welcome UI)
**Outcome**
- If multiple apps are detected, the Welcome UI lets you pick which one before starting.

**Acceptance**
- User can select app `apps/web` vs `apps/admin` in Welcome UI.
- Starting server runs in the chosen folder.

**Implementation notes**
- Detect workspace type:
  - `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`, Yarn workspaces
- Prefer scanning typical roots:
  - `apps/*`, `packages/*`

**Files**
- [src/appMode/appUtils.ts](src/appMode/appUtils.ts)
- [webview-ui/src/App.tsx](webview-ui/src/App.tsx)

---

### Milestone 7 — Universal preview targets for “embedded UIs”
**Outcome**
- Detect and expose **Preview Targets** when a UI isn’t a traditional “app dev server”, e.g.:
  - VS Code extension webview UIs that have a `vite`/`webpack` preview path
  - Component harnesses: Storybook, Ladle, Styleguidist
  - Docs/dev sites that render UI: Docusaurus, Astro, etc.

**Acceptance**
- In repos where a UI harness exists, Welcome UI shows “Preview Targets”.
- One-click starts the harness in the correct folder and connects App Mode to the correct URL/path.
- If a repo contains a webview UI package that can run as a normal web page (e.g. Vite multi-page), it appears as a preview target.

**Implementation notes**
- Prefer standard harnesses first (Storybook/Ladle) because they’re explicitly designed for isolated UI editing.
- For “webview UI packages”, detect by:
  - presence of a `package.json` with `dev`/`start`
  - presence of one or more HTML entrypoints (`index.html`, `*.html`) or build inputs
  - optionally: multi-entry Vite configs that list multiple HTML inputs
- For targets that normally expect VS Code globals, support **dev fallbacks** (mocks) so they can run standalone.

**Files**
- [src/appMode/appUtils.ts](src/appMode/appUtils.ts)
- [src/extension.ts](src/extension.ts)
- [webview-ui/src/App.tsx](webview-ui/src/App.tsx)

---

### Milestone 8 — Remote / container friendliness
**Outcome**
- Provide accurate “connect” guidance when in Dev Containers/WSL/Remote.

**Acceptance**
- Notes appear when remote context is detected.

**Files**
- [src/extension.ts](src/extension.ts)
- [webview-ui/src/App.tsx](webview-ui/src/App.tsx)

---

## Suggested implementation order (safest incremental)

1. Milestone 1 (detection payload + html candidates)
2. Milestone 2 (click-to-open html candidates)
3. Milestone 3 (install/start/connect actions)
4. Milestone 6 (monorepo UX)
5. Milestones 4/5 (better url + framework expansion)
6. Milestone 7 (universal preview targets)
7. Milestone 8 (remote/container)

---

## Risks & mitigations

- **Risk: over-eager command execution**
  - Mitigation: confirmation prompts; only run in selected app root.
- **Risk: false positives in detection**
  - Mitigation: rank + explain; always allow manual override.
- **Risk: parsing scripts/configs is brittle**
  - Mitigation: best-effort; keep fallback ports.

---

## Progress log

> We will update this section as we implement. Keep entries short and dated.

### Status
- [x] Milestone 1 — Detection report v1 (apps + html candidates)
- [x] Milestone 2 — Click-to-open HTML candidates
- [x] Milestone 3 — Auto Setup actions (install/start/connect)
- [x] Milestone 4 — Better URL inference
- [x] Milestone 5 — Framework expansion + ranking
- [x] Milestone 6 — Monorepo UX (pick in Welcome UI)
- [x] Milestone 7 — Universal preview targets for “embedded UIs”
- [x] Milestone 8 — Remote/container friendliness

### Updates
- 2026-01-26: Created master plan document.
- 2026-01-26: Clarified “universal” definition (DOM-based surfaces + entrypoint hierarchy) and generalized Milestone 7 into Preview Targets.
- 2026-01-26: Implemented Detection Report payload (apps + htmlCandidates + previewTargets) and updated webview message schema.
- 2026-01-26: Added click-to-open HTML candidates (no picker) via `quickStart` static file target.
- 2026-01-26: Implemented selection-first Welcome onboarding for monorepos (pick app/preview target before install/start/connect).
- 2026-01-26: Added preview target URL defaults (port + path) and improved script-based inference.
- 2026-01-26: Added app candidate ranking + per-app port inference; populated environment flags + remote/container guidance.
- 2026-01-26: Wired App Mode proxy to use `asExternalUri` so App Mode works in Remote SSH / Dev Containers / WSL.
- 2026-01-26: Validated changes with a successful full build.
