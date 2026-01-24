# Live UI Editor — Selection & Tracking Rebuild Roadmap

Goal: replace the current selection + tracking system with a deterministic, consistent model that (1) always selects the intended element/group, and (2) always tracks it accurately under scroll, nested scroll, resize, DOM mutations, responsive reflow, and transforms.

This document is written as a PR-by-PR implementation roadmap. Each PR has:
- Scope (what changes)
- Acceptance criteria (how we know it works)
- Files touched (so it’s easy to review)
- Progress log (so we can keep this updated as we go)

---

## 0) Current State (What We Have Now)

Primary implementation: webview-ui/src/App.tsx

### Selection (today)
- Click handler: resolves target via `closest('[data-source-file][data-source-line]')`.
- Group selection: heuristics via `.target` or `[data-live-ui-group-root="1"]`.
- Selection identity: stored as `selectedEl: HTMLElement | null` + `selectedLocatorRef`.

### Tracking (today)
- Overlay: react-moveable bound to `selectedEl`.
- Re-measure: `moveableRef.current?.updateRect()` triggered by a mix of scroll listeners and rAF throttling.
- Drift/misalignment occurs in multiple scenarios (not only scroll): differing coordinate spaces, nested scrollers, reflow, transforms, overlay hit-testing edge cases.

### Known failure modes
- Incorrect element chosen under cursor (overlay UI interference, nested elements, group/leaf ambiguity).
- Group selection inconsistent (breadcrumbs vs what moves/resizes).
- Tracking drift/misalignment after any scroll/reflow/resize.
- Drag/resize jump or “doesn’t track element as it moves”.

---

## Target Architecture (What We Need)

### A) Deterministic hit-testing
- Overlay must never “steal” selection events.
- Selection must be stable and predictable from pointer position.

### B) First-class selection model
Selection is an object, not just an HTMLElement.

Required fields:
- `leafEl`: the most specific clicked element (user intent)
- `mappedEl`: nearest source-mapped element (`[data-source-file][data-source-line]`) for persistence
- `selectedEl`: the element we operate on (element mode = mapped/leaf; group mode = group root)
- `groupRootEl`: computed group root when in group mode
- `locator`: `{file,line,column?}` extracted from mapped element
- `breadcrumbs`: stable trail for UI

### C) Overlay tracking that always aligns
- Overlay is rendered in a viewport-fixed layer (`position: fixed; inset: 0`)
- Position comes from `selectedEl.getBoundingClientRect()` (single source of truth)
- Updates are scheduled via rAF and triggered by:
  - scroll (capture) on relevant scroll parents
  - window resize
  - ResizeObserver on selected element
  - MutationObserver for DOM replacement/invalidation

### D) Drag/resize that never jumps
- Pointer-based transform application using overlay handles.
- Persist only on pointer-up (preview during pointer-move).

---

# PR Roadmap

## PR 1 — Add Rebuild Scaffold + Debug Overlay
**Scope**
- Add editor runtime folder and types.
- Add a debug overlay toggle (UI switch) that displays:
  - leaf/mapped/selected elements
  - locator
  - current rect
  - update triggers counters
- No behavior changes yet.

**Acceptance criteria**
- Build passes (`npm run build:webview`, `npm run typecheck`).
- Debug overlay can be toggled and shows data without breaking selection.

**Files**
- Add: webview-ui/src/editor/types.ts
- Add: webview-ui/src/editor/debugOverlay.tsx
- Update: webview-ui/src/App.tsx

**Progress log**
- [x] Implemented
- Notes: Added `DebugOverlay` + editor types; wired toggle into `App.tsx`.

---

## PR 2 — Deterministic Hit-Testing (Remove Overlay Interference)
**Scope**
- Introduce HitTester:
  - uses `document.elementsFromPoint(x,y)`
  - filters to elements inside the canvas content
  - resolves to leaf + mapped element
- Overlay becomes `pointer-events: none` except explicit handles.
- Remove Moveable click-through hacks.

**Acceptance criteria**
- Clicking on any visible element selects what’s under the cursor (stable).
- Double-click text editing is never blocked by overlay.

**Files**
- Add: webview-ui/src/editor/hitTest.ts
- Update: webview-ui/src/App.tsx

**Progress log**
- [x] Implemented
- Notes: Added `hitTestAtPoint()` and removed Moveable click-through hacks.

---

## PR 3 — Fixed Overlay Tracker (Accurate in All Layout/Scroll Scenarios)
**Scope**
- Implement OverlayTracker:
  - viewport-fixed overlay layer
  - selection box positioned from `getBoundingClientRect()`
  - rAF scheduler
  - attach scroll listeners to relevant scroll parents (capture)
  - ResizeObserver + MutationObserver
- Keep Moveable temporarily only if needed (selection visuals driven by tracker).

**Acceptance criteria**
- Selection box remains aligned after:
  - webview panel scroll
  - canvas scroll
  - nested scroll container scroll
  - window resize
  - DOM mutations that don’t delete the selected node
- If selected node is replaced, selection rebinds via locator or clears safely.

**Files**
- Add: webview-ui/src/editor/overlayTracker.ts
- Add: webview-ui/src/editor/scrollParents.ts
- Update: webview-ui/src/App.tsx

**Progress log**
- [x] Implemented
- Notes: Added viewport-fixed overlay driven by `getBoundingClientRect()` + rAF scheduler + scroll/resize/observer triggers.

---

## PR 4 — Replace Moveable With Custom Drag/Resize (Pointer-Based)
**Scope**
- Implement drag/resize handles as part of overlay:
  - drag surface
  - 8 resize handles
  - pointer capture
  - apply translate/width/height updates
  - persist on pointer-up via existing `updateStyle` messages
- Remove react-moveable from App usage (dependency can remain for now).

**Acceptance criteria**
- Drag has no jump (even after scroll).
- Resize always applies to selected element.
- Persisted updates match what the user sees.

**Files**
- Add: webview-ui/src/editor/transformApplier.ts
- Update: webview-ui/src/App.tsx

**Progress log**
- [x] Implemented
- Notes: Added pointer-based drag handle + 8 resize handles; persists via existing `updateStyle` messaging.

---

## PR 5 — First-Class Group Selection Model
**Scope**
- Make group selection explicit:
  - compute group root deterministically
  - store both leaf + groupRoot
  - breadcrumbs driven from selection model, not ad-hoc
- Optional: support “group bounds” overlay (union rect) if group root is not visually bounding.

**Acceptance criteria**
- In group mode, the selected box matches what moves/resizes.
- Breadcrumbs always match the actual selection target.

**Files**
- Add: webview-ui/src/editor/selectionModel.ts
- Update: webview-ui/src/App.tsx

**Progress log**
- [x] Implemented (initial)
- Notes: Group selection now always resolves to a source-mapped element via `findGroupRootMapped()`. Breadcrumb model can be further refined.

---

## PR 6 — Reliability Suite (Manual Checklist + Optional Automated Smoke)
**Scope**
- Add a short manual checklist to HELP.md.
- Optional: add a minimal “demo document” for consistent reproduction.

**Acceptance criteria**
- Checklist passes on a sample HTML.

**Files**
- Update: HELP.md
- (Optional) Add: samples/selection-smoke.html

**Progress log**
- [ ] Implemented
- Notes:

---

# Always-Pass Manual Checklist
Run these before marking the rebuild complete:
1) Select element → scroll canvas → overlay aligned.
2) Select element inside nested scroller → scroll nested scroller → overlay aligned.
3) Resize the VS Code panel → overlay aligned.
4) Trigger reflow (toggle a section) → overlay aligned.
5) Drag right after scroll → no jump.
6) Group mode: click child → correct group root selected → drag/resize affects group root.

---

# Running Progress Notes
(Add dated entries here as we go)

- 2026-01-24: Roadmap created.
- 2026-01-24: Implemented PR1–PR4 in workspace (overlay + hit testing + pointer drag/resize). Updated dblclick editing to always persist against a source-mapped element.
