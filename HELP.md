# Live UI Editor — Help

This document is meant to be beginner-friendly. It explains every part of the extension and the full flow from “I have a folder open” to “my changes are applied to code”.

If you’re completely new, start with **Welcome / Quick Start** below.

---

## What Live UI Editor Does (In Plain English)

Live UI Editor lets you visually click, drag, resize, and edit text in a live preview, then (when possible) writes those changes back into real files in your workspace.

There are two modes:

1) **Static HTML mode** (no dev server)
   - You open an `.html` file.
   - The extension renders it and lets you visually edit it.
   - Changes are written directly into that HTML file.

2) **App Mode** (dev server)
   - You run your real app (Vite / Next.js / etc.) and the extension loads it in an iframe.
   - You visually edit the running UI.
   - Changes are staged as **Pending** edits, then you click **Apply to Code**.

---

## Quick Start (Recommended)

1. Open the folder for your site/app in VS Code.
2. Press `Ctrl+Shift+P` → run **Live UI: Open**.
3. You will see the **Welcome to Live UI Editor** screen.
4. Choose:
   - **Static HTML / No dev server** (best if you just have an `.html` file)
   - **App Mode (dev server)** (best for React/Vite/Next)
5. Click **Start**.

Tip: The Welcome screen includes a **Help / Troubleshooting** button and a one-click “Copy Copilot prompt” to help non-technical users start the correct dev server.

---

## Welcome / Quick Start Screen (Detailed)

When you run **Live UI: Open**, the extension opens a Live UI panel. If nothing is loaded yet, you’ll see a Welcome screen.

### “Detected” box

This is best-effort guidance. It may show:

- Detected apps (for example: Vite / Next)
- A suggested local URL (for example: `http://127.0.0.1:5173`)
- Whether that URL “looks running”
- Notes (for example: which commands to run)

This is informational only; you still choose what to do.

### Option A: Static HTML / No dev server

Use this if:

- You have a plain website HTML file.
- You don’t have a dev server.
- You want a simple visual editor for HTML.

Buttons:

- **Start (pick an HTML file)**: opens a file picker filtered to `.html`/`.htm`.
- **Pick an HTML file…**: same idea; lets you choose any HTML file.
- **Use current file**: uses the file currently open in your editor (if it’s a local file).
- **Try a sample**: loads the bundled sample file (or prompts you if it can’t find it).

### Option B: App Mode (dev server)

Use this if:

- You’re working in a React/Vite/Next project.
- You can run `npm run dev` (or similar).
- You want to edit your real app UI, not a static snapshot.

Controls:

- **Connect**
  - **Start dev server (integrated terminal)**: runs the dev server in VS Code’s terminal.
  - **Use existing URL**: you paste a URL (usually `http://127.0.0.1:<port>`).
  - **Start dev server (external window)**: starts it outside VS Code (Windows-friendly option).

- **Style mode** (how style edits are written)
  - **Auto (recommended)**: picks the best strategy for your project.
  - **Tailwind**: edits Tailwind utility classes where possible.
  - **CSS Class**: writes/updates a CSS class rule in a CSS file.
  - **Inline**: writes inline styles (fast, but can fight responsive CSS).

- **Layout apply** (what dragging/resizing writes)
  - **Off (safest)**: drag/resize is preview-only.
  - **Safe**: drag moves persist as margin adjustments (more responsive-friendly).
  - **Full (advanced)**: drag/resize writes `width`/`height`/`transform`.

- **Also start backend/API server**
  - If your app needs a separate backend (auth/API/navigation), enabling this helps start it too.

- **Start App Mode**
  - Launches App Mode using your selected settings.

- **Help / Troubleshooting**
  - Opens quick help in the panel and links to this file.

- **Copy Copilot prompt**
  - Copies a “non-technical user” prompt tailored to the repo detection. Paste it into VS Code Copilot Chat.

---

## Static HTML Mode (No Dev Server)

### What it’s for

Static HTML mode is a visual editor for HTML files. It does not run your app, and it doesn’t require any framework.

### How to open an HTML file

- Run **Live UI: Open** → choose **Static HTML / No dev server**.
- Click **Start (pick an HTML file)** (or use the other options).

### How selection works

When you click, Live UI Editor chooses the element under your cursor using deterministic hit-testing (so the overlay doesn’t “steal” clicks).

There are two selection modes:

- **Group**: selects a larger container so grouped UI moves together.
  - You can also force Group for a single click by holding `Shift`.
- **Element**: selects the specific element you clicked.
  - You can force the leaf element (even in Group mode) by holding `Alt`.

Other controls:

- **Select parent**: moves selection up to the parent element.
- **Breadcrumbs**: shows a short trail so you understand what’s selected.

### Moving and resizing

Once an element is selected:

- **Drag** the selection overlay to move.
- **Drag the resize handles** to resize.

Keyboard nudging:

- Arrow keys: nudge by 1px
- `Shift` + arrow keys: nudge by 10px

What gets written to code:

- Static mode currently persists layout edits as style updates (for example `transform`, `width`, `height`) on the selected element.

### Inline text editing

- Double-click an element to edit its text inline.
- `Enter` commits the edit.
- `Shift+Enter` inserts a newline.
- `Escape` cancels and restores the original text.
- Clicking away (blur) also commits.

Important limitation:

- Text editing only persists deterministically when the target is source-mapped (so the extension knows exactly what to edit).

---

## App Mode (Dev Server)

### What it’s for

App Mode loads your real app (usually running locally) into a VS Code webview iframe, injects an editor overlay, and lets you edit the UI without covering the app.

### Requirements

- A project you can run locally (common: Vite + React, Next.js)
- Node.js installed
- A dev server URL that is reachable in a normal browser

### Starting App Mode

Recommended:

1. Run **Live UI: Open**.
2. Choose **App Mode (dev server)**.
3. Choose a **Connect** option.
4. Click **Start App Mode**.

Direct:

- Run **Live UI: Open (App Mode)**.

### Edit vs Browse mode

App Mode has two interaction modes:

- **Edit**: hover/selection overlays, drag/resize, and click-to-code.
- **Browse**: your app behaves normally (clicks go to the app).

Use the sidebar button:

- **Switch to Edit** / **Switch to Browse**

### Pending edits (staging)

In App Mode, changes are staged first. You’ll see:

- **Pending: N** (how many changes are staged)

Then:

- **Apply to Code**: writes all staged edits into source.
- **Discard**: throws away staged edits.

If identity is not stable, you may see:

- **Apply Anyway**: forces apply, but it may be less safe.

### Targeting and identity (Stable IDs)

In the sidebar you’ll see something like:

- **Identity: Stable** (best)
- **Identity: Fallback** (works sometimes)
- **Identity: Unmapped** (cannot reliably map to source)

For best results, click **Enable Stable IDs**.

What that does:

- Adds a dev-only Babel plugin file in your app root.
- Patches your framework config (Vite/Next) so elements get stable `data-lui` identities.
- After you restart the dev server, selection → code edits become much more reliable.

### Style Target (how style changes are written)

Choose how App Mode writes styles:

- **Auto**: uses the best available adapter for the repo.
- **Tailwind**: edits Tailwind utility classes.
- **CSS file**: writes class rules into a chosen CSS file.
  - Use **Pick CSS** to choose the file.
- **Inline**: writes inline style props.

### Layout apply (drag/resize)

Layout apply controls what drag/resize writes to code:

- **Off**: preview only
- **Safe**: drag moves persist as margins
- **Full**: drag/resize writes `width`/`height`/`transform`

### Backend helper

If your repo needs a separate backend server (API/auth/etc.), App Mode provides **Start Backend**.

It can:

- Detect a likely script (`dev:api`, `dev:backend`, `server`, etc.)
- Or run a custom command
- Remember your choice per app root

### Mobile / responsive workflow

App Mode includes viewport presets and overlays to help spot responsive issues.

### Tauri shim (optional)

If your app is a Tauri-targeted UI, enabling **Tauri Shim** stubs the browser APIs so the UI can load/navigate inside App Mode.

---

## UI Wizard (Chat Participant)

UI Wizard is a VS Code Chat participant named `@ui-wizard`. It edits the *currently selected* element.

### The one rule: you must have a selection

If UI Wizard says it has no selection:

1. Open Live UI Editor.
2. If you’re in App Mode, switch to **Edit**.
3. Click the element you want to change.
4. Ask `@ui-wizard`.

### Discover what it can do

Type one of these in VS Code Chat:

- `@ui-wizard commands`
- `@ui-wizard commands for layout`
- `@ui-wizard commands for bulk`
- `@ui-wizard commands for structure`
- `@ui-wizard commands for images`

### Deterministic layout commands (fast and predictable)

- `@ui-wizard width 240`
- `@ui-wizard height 48`
- `@ui-wizard move right 20`
- `@ui-wizard move up 10`
- `@ui-wizard x 40 y 12` (sets translate)

### Suggestions + preview/apply

- `@ui-wizard suggest 3 modern button styles`
- `@ui-wizard preview 1`
- `@ui-wizard apply 1`
- `@ui-wizard clear preview`
- `@ui-wizard undo`

### Bulk apply

- `@ui-wizard apply 1 to all buttons`
- `@ui-wizard apply 2 to all headings`
- `@ui-wizard apply 3 to all links`
- `@ui-wizard apply this/current style to all text areas`

### Structural edits

- `@ui-wizard add a button "Buy now" next to this`
- `@ui-wizard add a header "Pricing" above this`
- `@ui-wizard add a box inside this`
- `@ui-wizard wrap this in a box`

### Images

- `@ui-wizard use an image as the background` (opens a file picker)

---

## Troubleshooting (Common Problems)

### “Nothing happens when I run Live UI: Open”

- Make sure you have a folder open (File → Open Folder).
- Check the Output panel: View → Output → **Live UI Editor**.

### App Mode loads but the iframe is blank

- Confirm your dev server URL loads in a normal browser.
- Try **Developer: Toggle Developer Tools** and check the Console for CSP errors.

### App Mode selection works but “Identity: Unmapped/Fallback”

- Click **Enable Stable IDs**.
- Restart the dev server.
- If it still struggles, click **Fix targeting**.

### Changes don’t apply to code in App Mode

- Confirm you clicked **Apply to Code**.
- Ensure the edited file is inside your workspace/app root (guardrail blocks outside edits).
- If using **CSS file**, click **Pick CSS** and choose the correct stylesheet.

### Static HTML mode: I can’t edit text

- Text editing only persists on source-mapped nodes.
- Try double-clicking a more “real” element (often a parent element like a heading, button, or paragraph).

### Selection/overlay looks off

- Toggle the built-in **Debug** option in the Static HTML toolbar to view rect-update causes.
- If you can reproduce a drift issue, include:
  - which mode you were in
  - whether the element is inside a scroll container
  - whether transforms are involved

---

## Manual Reliability Checklist (For Verifying Selection/Tracking)

This is a quick sanity checklist you can run on any HTML page:

1. Select an element → scroll the canvas → overlay stays aligned.
2. Select an element inside a nested scroller → scroll nested scroller → overlay stays aligned.
3. Resize the VS Code panel → overlay stays aligned.
4. Trigger reflow (toggle/hide/show sections) → overlay stays aligned.
5. Drag immediately after scroll → no jump.
6. In Group mode, click a child → correct container selected → drag/resize affects the container.

---

## Support / Feedback

- Discord: https://discord.gg/QHnHhCjWDQ
