# Live UI Editor — V2.0 Living Plan

> **Purpose**: This is the single “living” guide for the Live UI Editor extension.
> It captures what we built in V1, what worked, what didn’t, known gaps, and the step-by-step plan for V2.
>
> **How to use**:
> - Update **Status**, **Decisions**, and **Lessons** as we learn.
> - For every change, add a line to **Changelog** and mark checklist items.
> - Keep scope honest: if a feature is "preview-only" vs "code-applied", say so.

---

## 0) Executive Summary

### What V1 proved
- Running the real app (Vite dev server) inside a VS Code webview via proxy + injection works.
- We can select elements and map them back to source **sometimes** using React fiber `_debugSource`.
- We can preview edits safely via staged edits + explicit “Apply to Code”.

### What V1 struggles with
- **Identity & targeting**: “file + line (+ column)” is not stable enough when multiple nodes share a line, components re-render, or transformations occur.
- **Layout edits**: writing `transform` / `width` / `height` is too blunt; it often changes unintended elements due to layout constraints (flex/grid/parent sizing).
- **Apply reliability**: preview can look correct while code application fails or applies to the wrong node; failures aren’t always surfaced clearly.
- **Performance & smoothness**: constant overlay tracking and scanning for marquee selection can be expensive on complex DOMs.

### V2 mission
**Identity-first, property-safe editing**:
- Always know *exactly what element is selected*.
- Only modify *explicitly intended properties*.
- Separate **preview mechanism** from **code-apply mechanism**.

---

## 1) Glossary

- **App Mode**: run the real app dev server, proxy HTML, inject client script, show in iframe within webview.
- **Selection**: user clicks element; we highlight it and establish identity + metadata.
- **Preview**: show changes live without writing files.
- **Apply**: write changes into source code (JSX/CSS) deterministically.
- **Identity**: stable reference to the source node (not just line numbers).

---

## 2) Current V1 Architecture (baseline)

### 2.1 Extension side
- Launch/attach to Vite dev server.
- Reverse proxy injects a client script into HTML responses.
- Webview hosts an iframe pointing at proxy origin.
- Message bridge between injected script ↔ webview ↔ extension.
- Staged edits queue with Apply/Discard and pending count.
- `CodeModifier` uses ts-morph to patch inline JSX styles/text.

### 2.2 Injected client script side
- Selection overlays + handles.
- Drag/resize applies inline `transform` / `width` / `height`.
- Text editing via `contenteditable`.
- Multi-select marquee + group operations (current implementation uses DOM scans).

---

## 2.3 Current State Snapshot (V1 code map)

Use this section as a navigation hub while iterating.

### Extension (VS Code host)
- Core activation + App Mode orchestration: [src/extension.ts](src/extension.ts)
  - Starts/attaches Vite dev server, proxies/injects, opens App Mode webview.
  - Receives selection/edit messages and stages pending edits.
  - Applies pending edits via `CodeModifier` and refreshes UI.

### App Mode webview wrapper
- Top bar UI + iframe container: [src/appMode/webviewAppModeHtml.ts](src/appMode/webviewAppModeHtml.ts)
  - Apply/Discard buttons + pending count.
  - Forwards injected script messages to extension.

### Injected app client (runs inside the app origin)
- Selection overlays, interactions, and message senders: [src/appMode/injectedClientScript.ts](src/appMode/injectedClientScript.ts)
  - Selection mapping uses React fiber `_debugSource` when available.
  - Preview today mutates DOM inline styles.
  - Multi-select: Shift+Click toggles; Shift+Drag marquee selects; group drag/resize updates member styles.

### Message schema / validation
- Bridge messages: [src/bridge/messages.ts](src/bridge/messages.ts)
  - Defines `updateStyle`, `updateText`, `applyPendingEdits`, `discardPendingEdits`, selection messages, etc.
  - Carries `column` + `elementContext` (where available).

### Code application engine
- JSX/HTML rewriting + selection heuristics: [src/codeModifier/CodeModifier.ts](src/codeModifier/CodeModifier.ts)
  - Applies `updateStyle` / `updateText` using ts-morph for JSX.
  - Uses “best node” selection with `line + column + elementContext` scoring.
  - NOTE: V1 currently writes inline styles by default.

### Chat assistant (UI Wizard)
- Natural language edits + helpers: [src/chat/uiWizard.ts](src/chat/uiWizard.ts)
  - Uses current selection from the extension.
  - Background image helper and style edits call `CodeModifier`.

### Dev server / proxy utilities
- Windows detached dev server launcher: [src/appMode/detachedDevServer.ts](src/appMode/detachedDevServer.ts)
- Vite helper utilities (app root detection, readiness checks, etc.): [src/appMode/viteUtils.ts](src/appMode/viteUtils.ts)

### Known behavior gaps to keep in mind (V1)
- Apply can fail or mis-target when identity is ambiguous (even with column/context).
- Layout edits (width/height/transform) can create collateral layout changes in real apps.
- Preview (DOM mutation) can drift from Apply (source patch).

---

## 3) What Works Today (V1)

### App Mode fundamentals
- Real app renders (router, SPA runtime) because it’s the real dev server.
- Click-to-code works when React `_debugSource` is available.

### Safety improvements
- Staged edits: preview-first; nothing touches disk until Apply.
- Close prompt: Apply / Discard / Cancel (Cancel reopens panel to avoid losing staged state).

### Targeting improvements
- Added use of `_debugSource.columnNumber` + `elementContext` to disambiguate when possible.- ±2 line search tolerance handles off-by-one from source maps / Babel transforms.

### Apply improvements
- Bottom-to-top edit ordering prevents line number corruption when applying multiple edits.
- All CSS properties are now persisted (not just width/height/transform).
- Apply report shows detailed success/failure for each edit.

### New capabilities
- **Delete Element**: Remove JSX elements from source via 🗑️ button.
- **i18n Text Editing**: Detects `{t('key')}` patterns and updates translation JSON files.
---

## 4) What Did Not Work / Pain Points (V1)

### 4.1 Targeting is still brittle
Symptoms:
- “I selected background, but it changed a different element (accent box).”
- “Apply didn’t stick.”

Root causes:
- Multiple JSX nodes can exist on the same line.
- Column numbers aren’t guaranteed.
- React debug source can be missing/optimized.
- The source patcher can choose the wrong candidate if it cannot identify uniquely.

### 4.2 Layout edits cause unintended side-effects
Symptoms:
- Resizing/moving one thing changes the size/position of other things.
- Group resize changes both size and position unexpectedly.

Root causes:
- Layout is constrained by parent flex/grid rules; `transform` and `width/height` bypass intended layout.
- Applying `transform` as persistence is often wrong for real layout (transform is visual, not layout).

### 4.3 Preview and Apply are not the same mechanism
Symptoms:
- Preview looks correct, Apply produces different result.

Root causes:
- Preview currently mutates DOM inline; Apply patches code differently.

### 4.4 Performance / scaling issues
Symptoms:
- On big pages, marquee selection and overlay updates can lag.

Root causes:
- DOM-wide scans for marquee selection.
- Frequent RAF overlay updates.

---

## 5) V2 Principles (non-negotiables)

1. **Stable identity or no apply**
   - If we cannot identify the element deterministically, we should not claim we can apply safely.

2. **Preview is a stylesheet override**
   - Preview should not rely on mutating inline styles on the app DOM.

3. **Apply is deterministic, visible, and reversible**
   - Always show what will change before writing.
   - Provide undo/rollback per batch.

4. **Layout editing is explicit**
   - Default “Style Mode” (safe properties).
   - Separate “Layout Mode” with stronger guardrails and intentional strategies.

5. **Cross-framework by design**
   - React-first, but architecture should allow other frameworks through adapters.

---

## 6) V2 Target Architecture

### 6.1 Identity injection (core)
**Add an optional client package + build plugin**:
- `@live-ui-editor/client` (runtime helper)
- `@live-ui-editor/vite-plugin` (or Babel/SWC plugin)

Plugin responsibility:
- Inject a stable attribute into rendered elements, e.g.
  - `data-lui="<stable-id>"`

Stable ID design:
- Prefer a hash of:
  - file path (relative)
  - line + column
  - JSX node path (AST path) or an injected compile-time unique id

Outcome:
- Selection and edits key on `data-lui`.
- Code apply can find the exact node with certainty.

Fallbacks:
- If plugin not installed:
  - React fiber debug source fallback (best effort).
  - Preview-only mode if identity confidence < threshold.

### 6.2 Preview mechanism: stylesheet overrides
Instead of setting inline styles, inject a `<style id="lui-preview">`:
- Each pending edit adds a rule:
  - `[data-lui="..."] { background-image: url(...); }`

Benefits:
- Fast
- Reversible
- Doesn’t permanently mutate app DOM

### 6.3 Apply mechanism: patch strategies
V2 should support multiple apply targets:

1) **Inline style patch (JSX)**
- Only when element has inline style or when we intentionally add it.

2) **Class-based patch (preferred)**
- If element has a class:
  - locate the stylesheet/module
  - update the class rule

3) **Create a new class**
- If no class exists:
  - create `lui-<id>` class
  - apply class to node
  - create/update a stylesheet file

4) **Framework-specific styling systems**
- Tailwind: prefer editing class list (safe subset).
- CSS modules: update module file.
- Styled-components: only if deterministic.

Rule: If we cannot apply with high confidence → stay in preview and explain why.

### 6.4 Edit modes

**Style Mode (default)**
Safe properties only:
- background, border, radius, shadow
- typography (color, size, weight, line height)
- spacing (padding/margin) with constraints

**Layout Mode (explicit toggle)**
- Move/resize strategies based on layout context:
  - flex child → prefer `margin`, `alignSelf`, `flex`, `gap`
  - grid → prefer `gridColumn/Row`, `justifySelf/alignSelf`
  - absolute → allow `left/top/right/bottom`
- Avoid persisting `transform` except for truly intentional transforms.

### 6.5 Performance strategy
- Overlay updates only for selected/hovered elements.
- Marquee selection should use:
  - spatial index (optional) or
  - incremental sampling + early cutoff
- Avoid scanning `body *` unless necessary.

---

## 7) V2 Roadmap (Milestones)

### Milestone A — Reliability foundation (Identity + Preview)
- [ ] Define stable ID format and confidence model
- [ ] Add client package skeleton (`@live-ui-editor/client`)
- [ ] Add Vite plugin (inject `data-lui`)
- [ ] Update injected script to prefer `data-lui` for selection
- [ ] Replace preview mutation with stylesheet override
- [ ] Update staged edits format to store `elementId` + property patches

**Exit criteria**:
- Selecting background always targets same element.
- Preview never changes unrelated elements.

### Milestone B — Apply engine (deterministic patching)
- [ ] Apply patches by elementId → AST node match
- [ ] Add “Apply Review” panel listing planned file diffs
- [ ] Hard fail when confidence low; show actionable guidance
- [ ] Add batch undo/rollback for Apply

**Exit criteria**:
- “Apply to Code” always matches preview, or clearly fails with reason.

### Milestone C — Styling systems support
- [ ] Inline JSX style apply
- [ ] CSS file rule apply
- [ ] CSS modules apply
- [ ] Tailwind class edits (safe subset)

**Exit criteria**:
- Background image can be applied via asset reference, not data URL.

### Milestone D — Layout Mode (safe, intentional)
- [ ] Detect layout context (flex/grid/absolute)
- [ ] Implement move/resize strategies per context
- [ ] Group move/resize rules (no unexpected extra properties)
- [ ] Add user controls: “Only change X”, “Lock position”, “Lock size”

**Exit criteria**:
- Moving/resizing doesn’t unpredictably change other elements.

### Milestone E — Multi-framework adapters
- [ ] React adapter (primary)
- [ ] HTML/CSS adapter
- [ ] Vue/Svelte adapter plan + minimal proof

---

## 8) Decisions Log (keep updated)

- **Decision**: App Mode (real dev server) is the default for SPA frameworks.
- **Decision**: Preview uses stylesheet overrides; inline DOM mutation is deprecated.
- **Decision**: Layout editing is a separate mode with guardrails.

Add new decisions here as we go.

---

## 9) Known Gaps / Risks

- Some projects won’t allow plugins easily; need a graceful fallback mode.
- CSS discovery is hard (global CSS vs modules vs CSS-in-JS).
- Tailwind edits must avoid breaking responsive variants.
- If identity injection is missing, we must prevent “wrong element apply”.

---

## 10) Lessons Learned (update continuously)

- “file + line” is not enough for stable targeting.
- Preview must be reversible and not drift from Apply.
- Layout edits are context-dependent; generic width/height/transform causes collateral changes.
- Images embedded as data URLs bloat source files; must use asset references.- **CSP matters**: webview scripts need proper CSP configuration including `webview.cspSource` and `'unsafe-inline'` for VS Code's injected bootstrap.
- **Template string escaping**: When generating JS inside template strings, escape sequences like `\n` become literal newlines and break syntax.
- **TypeScript types limit behavior**: Hardcoded types like `{ width?; height?; transform? }` silently drop other CSS properties; use `Record<string, string>` for flexibility.
- **Edit ordering is critical**: When applying multiple edits to the same file, process bottom-to-top (descending line order) to prevent line number corruption.
- **Click event conflicts**: UI elements in the injected script need to be registered in `isEditorUiEl()` and the document click handler must early-return to prevent event stealing.
- **i18n complicates text editing**: Elements using translation functions like `{t('key')}` don't have literal text in source; must detect and update translation files instead.
---

## 11) Immediate Next Steps (Recommended)

If we want the fastest path to a smoother V2:

1) **Stop embedding images as data URLs**
   - Copy asset into project and reference it.

2) **Preview via stylesheet override**
   - Single `<style>` injection keyed by stable selector.

3) **Add stable IDs via plugin**
   - Make selection/apply deterministic.

---

## 11.1 Troubleshooting + Repro Recipes (living)

Use these as the “definition of done” checks while we refactor.

### Telemetry to capture (per repro)
When debugging, record these as a small text block (copy/paste from Output or a debug panel).

**Selection**
- Selected element identity:
  - V1: `file`, `line`, `column`, `elementContext` (tag/id/classList/text)
  - V2: `elementId` (stable `data-lui`), plus the original source location used to generate it
- Identity confidence (0–1) and why (missing column, multiple candidates, no stable id, etc.)

**Preview**
- Preview mechanism used (V1 inline mutation vs V2 stylesheet override)
- Preview payload (properties changed + values)
- Count of targeted elements (single vs multi-select)

**Apply**
- Apply strategy chosen:
  - JSX inline style
  - Existing class rule
  - New class creation
  - Tailwind class edit
  - Other
- Exact list of properties intended to write (guardrails should prevent extras)
- File(s) modified and whether Apply review matched expectation
- Failure reason (if any):
  - Ambiguous identity
  - Unsupported styling system
  - AST node not found
  - Patch produced no diff
  - Validation failed

**Post-apply verification**
- After reload: did the UI match preview?
- Any collateral changes observed (what changed, where)

### Repro A — Wrong element gets edited (targeting)
**Goal**: prove selection identity is stable and apply affects only the intended node.

Steps:
1. Open App Mode and select a large background container.
2. Run UI Wizard: “set background image” and choose a file.
3. Click away and re-select the same background.
4. Apply to Code.

Expected:
- Only the background container changes.
- No accent boxes / badges / unrelated nodes receive background image.
- Apply produces a deterministic file change, or clearly reports “cannot apply safely”.

Capture:
- Selected element metadata (file/line/column/context).
- Whether selection has stable ID (V2) or relies on debug source (V1).

---

### Repro B — Apply doesn’t stick (silent failure)
**Goal**: ensure apply failure is surfaced with reasons.

Steps:
1. Make a preview change (color or background).
2. Apply to Code.
3. Reload dev server / reopen App Mode.

Expected:
- If apply succeeded: reload shows the same change.
- If apply failed: UI shows explicit reason (ex: ambiguous identity, unsupported styling system).

---

### Repro C — Layout collateral damage (resize/move)
**Goal**: verify Layout Mode guardrails prevent unintended changes.

Steps:
1. In a flex/grid layout, resize a child element and apply.
2. Observe siblings and parent.

Expected (Style Mode):
- Layout editing should be disabled or require explicit Layout Mode.

Expected (Layout Mode):
- Only the intended property changes are written (e.g., flex-basis/margin/gap), not random width/transform.
- Sibling positions/sizes should not change unexpectedly beyond what the chosen strategy implies.

---

### Repro D — Group operations cause unexpected size+position writes
**Goal**: ensure group ops don’t write extra properties beyond user intent.

Steps:
1. Multi-select several items.
2. Group move, then group resize.
3. Apply to Code.

Expected:
- Group move should write only position strategy props (not width/height).
- Group resize should write only sizing strategy props (not transform unless explicitly intended).
- Apply review should list each element’s patch clearly.

---

### Repro E — Performance regression (large DOM)
**Goal**: keep UI smooth on large pages.

Steps:
1. Open a heavy page (lots of DOM nodes).
2. Move mouse to hover; draw marquee; drag/resize.

Expected:
- No noticeable stutter while hovering/dragging.
- Marquee selection should not require a full `body *` scan in V2.

---

## 12) Changelog (add entries)

- 2026-01-17: Created V2 plan document.
- 2026-01-17: Added “Current State Snapshot” code map section.
- 2026-01-17: Added troubleshooting + repro recipes section.
- 2026-01-17: Added repro telemetry capture checklist.
- 2026-01-17: Added optional `elementId` support (`data-lui`) across App Mode selection/staging/apply; injected client can derive file/line from `data-lui` payload.
- 2026-01-17: Started a `vite-plugin-live-ui-editor` starter (build-time `data-lui` injection) under `tools/`.- 2026-01-17: **Fixed App Mode UI not clickable** — CSP was blocking VS Code's injected `acquireVsCodeApi()` bootstrap; added `${webview.cspSource}` and `'unsafe-inline'` to `script-src` in `webviewAppModeHtml.ts`.
- 2026-01-17: **Fixed JS syntax error in Apply report** — Template string was outputting literal `\n` instead of escaped newlines, breaking the injected script. Fixed escaping in `webviewAppModeHtml.ts`.
- 2026-01-17: **Improved JSX node matching** — Expanded `findNearestJsxNodeAtLine` and `findBestJsxNodeAtLocation` to search ±2 lines to handle off-by-one from React fiber source maps / Babel transforms.
- 2026-01-17: **Fixed CSS property persistence** — Changed `PendingEdit.style` type from `{ width?; height?; transform? }` to `Record<string, string>` so all CSS properties (including `backgroundImage`) are persisted.
- 2026-01-17: **Implemented i18n text editing** — Added detection of `{t('key')}` patterns in JSX, extraction of translation keys, and update of translation JSON files (`src/locales/en.json`). New methods: `updateTextWithI18n()`, `detectAndUpdateI18n()`, `extractI18nKeyFromJsxContent()`.
- 2026-01-17: **Implemented Delete Element feature** — Added 🗑️ delete button to selection UI, `deleteElement` command handler, and `CodeModifier.deleteElement()` method using ts-morph to remove JSX elements from source.
- 2026-01-17: **Fixed race condition in Apply** — Edits to the same file were corrupting each other because line numbers shifted after each edit. Fixed by sorting edits by line number DESCENDING (bottom-to-top) within each file before applying.
- 2026-01-17: **Fixed Delete button not responding** — Added `live-ui-editor-delete-btn` to `isEditorUiEl()` check and added early return in `onClick` handler to prevent document click from stealing the event.

---

## 13) Session Work Log (2026-01-17)

### Issues Diagnosed & Fixed

#### Issue 1: App Mode UI completely broken (buttons not clickable)
**Symptom**: After adding the Apply report UI, none of the App Mode top bar buttons responded to clicks.
**Root Cause**: Content Security Policy was blocking VS Code's injected webview API bootstrap script.
**Fix**: Added `${webview.cspSource}` and `'unsafe-inline'` to the `script-src` directive in CSP.
**File**: `src/appMode/webviewAppModeHtml.ts`

#### Issue 2: Apply report not rendering (JS syntax error)
**Symptom**: Apply report text was not showing, console had JS errors.
**Root Cause**: Template string `'\n'` was being output as literal newlines inside the JavaScript string, breaking syntax.
**Fix**: Escaped the newlines properly as `'\\n'` in the template literal.
**File**: `src/appMode/webviewAppModeHtml.ts`

#### Issue 3: Only width/height/transform being saved
**Symptom**: Background image and other CSS properties weren't being persisted to code.
**Root Cause**: `PendingEdit.style` TypeScript type was hardcoded to only allow `{ width?: string; height?: string; transform?: string }`.
**Fix**: Changed type to `Record<string, string>` and updated apply logic to iterate all properties.
**File**: `src/extension.ts`

#### Issue 4: Text edits failing on i18n elements
**Symptom**: Apply report showed "no change (node not found)" for elements using `{t('loginPage.features...')}`.
**Root Cause**: The source code doesn't contain literal text, it contains translation function calls.
**Fix**: Implemented i18n detection that extracts the translation key and updates the JSON translation file instead.
**Files**: `src/codeModifier/CodeModifier.ts`, `src/extension.ts`

#### Issue 5: Multiple edits corrupting file
**Symptom**: Applying multiple edits to the same file caused random edits to be applied to wrong locations, restoring deleted content, and general corruption.
**Root Cause**: Each edit read the file, modified it, and saved it. After edit 1 changed line numbers, edits 2-N had stale line numbers.
**Fix**: Group edits by file and sort by line number DESCENDING (bottom-to-top), so earlier edits don't shift later ones.
**File**: `src/extension.ts`

#### Issue 6: Delete button not responding
**Symptom**: Clicking the 🗑️ delete button did nothing.
**Root Cause**: The document click handler was intercepting the click before it reached the delete button handler.
**Fix**: Added `live-ui-editor-delete-btn` to `isEditorUiEl()` and added early return in `onClick` when target is the delete button.
**File**: `src/appMode/injectedClientScript.ts`

### Features Implemented

#### Delete Element
- Added 🗑️ button that appears at top-right of selection box in Edit mode
- Clicking removes the selected JSX element from source code
- Uses ts-morph to find and remove the element, including surrounding whitespace
- Immediate action (not staged like style/text edits)
- Disabled for multi-select (safety)
- Undoable via Ctrl+Z in the source file

#### i18n Text Editing
- Detects `{t('key')}` patterns in JSX content
- Extracts the translation key (e.g., `loginPage.features.items.title`)
- Finds translation file (searches `src/locales/en.json` first)
- Updates the nested value in the JSON file
- Reports i18n updates in the apply report

#### Bottom-to-Top Edit Ordering
- Edits to the same file are sorted by line number descending
- Prevents line number corruption from sequential edits
- Each file is processed independently

### What's Still Not Working

1. **i18n text edits occasionally fail** — Some elements still report "node not found" even with ±2 line search; may need better column matching or element context scoring.
2. **Delete confirmation** — Currently no confirmation dialog before deleting; user must undo via Ctrl+Z in source file.
3. **Multi-select delete** — Intentionally disabled for safety, but could be useful with proper confirmation.

### Files Modified This Session

- `src/appMode/webviewAppModeHtml.ts` — CSP fix, JS syntax fix
- `src/appMode/injectedClientScript.ts` — Delete button UI, click handler, isEditorUiEl fix
- `src/codeModifier/CodeModifier.ts` — i18n support, deleteElement method, deleteJsxElement function, ±2 line search
- `src/extension.ts` — PendingEdit.style type fix, bottom-to-top edit ordering, deleteElement command handler, i18n apply reporting