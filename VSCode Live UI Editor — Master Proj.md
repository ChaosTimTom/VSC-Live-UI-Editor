VSCode Live UI Editor — Master Project Brief (Copilot-Optimized)
Purpose

Build a VS Code extension that renders a live React UI inside a Webview and enables bidirectional visual editing:

Click UI → jump to source code

Modify UI visually → safely update source code

Modify code → hot-reload UI

Use AI to issue natural-language commands against the selected UI element

This project must be implemented incrementally, one phase at a time.
Do not attempt to combine phases.

---

## Status (as of 2026-01-17)

### Phases (from this brief)

- [x] Phase 1 — Webview scaffolding + React/Vite bundle renders in VS Code
- [x] Phase 2 — Click-to-code (DOM → source file/line)
- [x] Phase 3 — Visual editing (select / drag / resize) + message passing
- [x] Phase 4 — Persist visual edits back to source (HTML + JSX/TSX)
- [x] Phase 5 — `@ui-wizard` chat participant for natural-language UI edits

### Major capabilities implemented (beyond the original Phase prompts)

- Selection UX: single selection overlay, keyboard nudge, snapping guides
- Persistence scope expanded:
  - HTML updates via `cheerio` (inline `style="..."`)
  - JSX/TSX updates via `ts-morph` (merge/insert `style={{ ... }}`)
- Multi-turn `@ui-wizard` tooling:
  - Preview vs apply vs clear preview
  - Undo (snapshot-based)
  - Bulk apply with correct targeting semantics (buttons vs readable text)
  - “Copy current style” from selected element (computed style payload)
  - Structural editing: add elements relative to selection, wrap with a box (+ optional divider)
  - Style-aware insertion:
    - “add a button next to this one” clones the selected button’s inline style
    - “add a header/box/divider like this” clones typography/box/divider styling from selection

### Not yet implemented / known gaps vs the original brief

- [x] **Hot-reload on arbitrary code edits**: the extension watches the loaded source document and refreshes the webview automatically (debounced while typing, immediate on save).
- [x] **`data-source-column`**: injector now adds `data-source-file` + `data-source-line` + `data-source-column`, and click-to-code can jump to the column when present.
- [x] **Robust injector**: now uses proper parsers to inject accurate locations for multi-line tags:
  - HTML: parse5 with source locations
  - JSX/TSX: ts-morph AST traversal
  (A build-time transform is still an optional future hardening step if you later render compiled output.)

---

HOW TO USE THIS BRIEF (IMPORTANT)

Paste Project Context first.

Execute one phase at a time.

After each phase:

Ensure it builds

Ensure it runs

Only then continue

If something is ambiguous, ask for clarification instead of guessing.

📂 PROJECT CONTEXT (PASTE FIRST)
Project Name

vscode-live-ui-editor

High-Level Architecture

The system consists of three isolated layers:

Extension Host (Node / TypeScript)

Owns workspace access

Owns AST manipulation

Owns AI integration

Owns file writes

Webview UI (Browser / React)

Visual renderer

Element selection

Drag / resize UI

Emits structured messages only

Bridge Layer

Message-based communication

No shared state

No direct imports across boundary

Technical Stack (MANDATORY)
Extension Host

TypeScript

Node.js

VS Code Extension API

Webview UI

React

Vite (bundling only)

No server-side rendering

No external CDN dependencies

Code Analysis & Mutation

ts-morph (preferred for TS/JSX)

cheerio (fallback for plain HTML)

Messaging

VS Code Webview Messaging API

Typed message contracts

AI Integration

VS Code Chat API

vscode.chat

vscode.lm

Core Concepts (DO NOT SKIP)
The Bridge

A strict message protocol between:

Extension Host ⇄ Webview

Messages must be:

JSON

Explicitly typed

Command-based

The Injector

A mechanism that injects source-location metadata into rendered DOM nodes so UI elements can be mapped back to source code.

Attributes:

data-source-file

data-source-line

data-source-column (optional, future-proof)

The Agent

A custom VS Code Chat Participant that:

Knows the currently selected UI element

Modifies code safely

Never writes files directly without validation

🏗️ PHASE 1 — Scaffolding & Rendering
Objective

Render a React application inside a VS Code Webview.

Constraints

No AST logic

No AI

No UI editing

Just rendering

Copilot Prompt — Phase 1

Initialize a new VS Code extension using TypeScript.

Project structure:

vscode-live-ui-editor/
├─ src/extension.ts
├─ webview-ui/
│  ├─ src/
│  ├─ index.html
│  └─ vite.config.ts
└─ package.json


Requirements:

Register a command: liveUI.open

When executed:

Create a WebviewPanel

Load bundled React assets from webview-ui/dist

Configure Content Security Policy correctly for:

Scripts

Styles

Images

Add build scripts:

npm run build:webview → builds React

npm run build:extension → compiles extension

npm run build → runs both in sequence

The Webview should render a visible React placeholder UI.

🔗 PHASE 2 — Source Mapping (Click → Code)
Objective

Click a rendered UI element and jump to its source code.

Copilot Prompt — Phase 2

Implement Click-to-Code functionality.

Extension Host:

Create a simple file loader that reads a workspace HTML or React file.

For MVP, assume:

Single file

No build pipeline

Injector:

Implement a function that:

Accepts a file as string

Injects data-source-file and data-source-line attributes

Applies attributes to every HTML / JSX element

Use a simple approach first (regex or DOM parser).

Webview (React):

Add a global click listener.

When an element is clicked:

Read injected data attributes

Post message to extension:

{
  command: "elementClicked",
  file: string,
  line: number
}


Extension Host:

Listen for this message.

Open the file using vscode.window.showTextDocument

Scroll and reveal the target line.

🎨 PHASE 3 — Visual Editing (Drag / Resize)
Objective

Visually resize elements and emit change instructions.

Copilot Prompt — Phase 3

Add visual editing capabilities in the Webview.

Webview:

Install interact.js or react-moveable

When an element is selected:

Draw a visible selection overlay

Enable resize handles

On resize end:

Compute new dimensions (px)

Emit message:

{
  command: "updateStyle",
  file: string,
  line: number,
  style: {
    width?: string,
    height?: string
  }
}


Extension Host:

Receive the message

Log payload only (no file writes yet)

🧠 PHASE 4 — AST Editing (Sync UI → Code)
Objective

Safely persist visual edits into source files.

Copilot Prompt — Phase 4

Implement safe code modification logic.

Extension Host:

Create a CodeModifier service.

Implement:

updateStyle(
  filePath: string,
  lineNumber: number,
  newStyles: Record<string, string>
)


Logic:

Load file

Parse using ts-morph (JSX/TSX)

Locate the nearest JSXElement at the given line

If style prop exists:

Merge styles

Else:

Create style={{ ... }}

Constraints:

Inline styles only

No Tailwind / className logic

Save file using VS Code Workspace APIs.
Let VS Code refresh the Webview naturally.

🤖 PHASE 5 — AI Agent (Natural Language UI Control)
Objective

Allow natural language commands to modify selected UI elements.

Copilot Prompt — Phase 5

Create a custom VS Code Chat Participant.

Registration:

Name: @ui-wizard

Extension State:

Track currentSelection

File path

Code range

Raw JSX snippet

Chat Flow:

When user invokes @ui-wizard:

Retrieve currentSelection

Construct LLM prompt:

You are a senior UI engineer.
Modify the following JSX code according to the user's request.
Return ONLY valid JSX.


Send request via vscode.lm.sendChatRequest

Validate response

Apply changes using WorkspaceEdit

Constraints:

No direct writes

Replace only the selected code range

⚠️ CRITICAL NOTE — THE HARD PART
The Injector Problem

Mapping rendered DOM back to source is non-trivial.

Current state:

- A simple line-based injector is used (adds `data-source-file` + `data-source-line` on opening tags).
- This works for many cases but is not guaranteed for multi-line JSX/HTML tags or transformed/compiled inputs.

If the simple injector fails:

Switch to a Babel plugin that injects source metadata during build time
(e.g. babel-plugin-source-locator pattern).

This is the correct long-term solution.

Also consider adding:

- `data-source-column` for more precise click targeting
- A workspace watcher so the webview refreshes when the source file is edited outside the Live UI actions

FINAL RULES FOR COPILOT

Do not skip phases

Do not invent features

Do not over-optimize early

Ask when uncertain

Favor clarity over cleverness

---

## Notes on deviations from the Phase prompts

- Phase 3 prompt originally said "Log payload only"; the project now persists changes (Phase 4+ behavior) because that became necessary for the Live Editor workflow.
- The brief is still useful as a requirements checklist, but implementation has progressed beyond it.