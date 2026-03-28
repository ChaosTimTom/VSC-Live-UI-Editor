# Social Media Posts — Live UI Editor v0.3.0

Ready-to-post drafts. Attach your demo GIF/video to each one.

---

## Reddit: r/vscode

**Title:** I built a visual UI editor that lives inside VS Code — click to select, drag to move, edit styles, and apply to source code

**Body:**

Hey everyone — I've been building a free VS Code extension called **Live UI Editor** and just shipped v0.3.0.

**What it does:**
- Click any element in your running app to select it
- Drag to move, resize with handles, double-click to edit text
- Edit CSS properties inline with the Property Inspector
- View the full DOM tree, CSS cascade, and a before/after diff
- Changes are staged — you review and apply them to your actual source files
- Works with React, Next.js, Vite, Angular, Vue, Svelte, Astro, Nuxt, Tailwind, and plain HTML

**What's new in v0.3.0:**
- Property Inspector, Element Tree, CSS Cascade panel, Diff Preview
- Responsive Bar (6 viewport presets)
- Element CRUD (insert, duplicate, wrap, delete) with undo/redo
- Multi-select for bulk operations
- Workspace session persistence
- `@ui-wizard` chat participant for natural language edits

It's completely free and open source (MIT).

🔗 **Marketplace:** https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor
🔗 **GitHub:** https://github.com/ChaosTimTom/VSC-Live-UI-Editor
🔗 **Discord:** https://discord.gg/QHnHhCjWDQ

Would love feedback. What would make this more useful for your workflow?

---

## Reddit: r/webdev

**Title:** I made a free VS Code extension that lets you visually edit your React/Next/Vue/Angular app — changes go back to your source code

**Body:**

I've been working on a VS Code extension called **Live UI Editor** that gives you Figma-like visual editing for your real running app, right inside VS Code.

**The workflow:**
1. Start your dev server (Vite, Next, etc.)
2. Open Live UI Editor — it iframes your app
3. Click any element to select → drag to move → double-click text to edit → adjust CSS in the inspector
4. Hit "Apply to Code" — changes are written to your actual JSX/TSX/HTML files

It uses React Fiber inspection to map DOM elements back to source, and ts-morph to surgically edit your code.

**Supports:** React, Next.js, Vite, Angular, Vue, Svelte, Astro, Nuxt, Gatsby, Remix, Tailwind, static HTML.

Completely free, MIT licensed. Just hit 500 installs and working on making it better.

Marketplace: https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor

What do you think? Drop feedback here or on the Discord: https://discord.gg/QHnHhCjWDQ

---

## Reddit: r/reactjs

**Title:** Live UI Editor — a free VS Code extension for visually editing your React app with changes written back to source

**Body:**

Built a VS Code extension for React devs who want to see and edit their UI visually without leaving the editor.

**How it works with React:**
- Connects to your Vite/Next dev server via iframe
- Uses React Fiber to map DOM → source file + line number
- Click to select, drag/resize, edit text inline, adjust every CSS property
- Changes are staged and applied to your JSX/TSX via AST (ts-morph)
- Tailwind-aware: when detected, writes utility classes instead of inline styles
- Supports i18n: edits to `t('key')` text update your locale JSON files

**v0.3.0 just shipped** with Property Inspector, Element Tree, CSS Cascade panel, Diff Preview, Responsive Bar, CRUD operations (duplicate/wrap/delete), undo/redo, and multi-select.

Free + MIT: https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor

---

## Twitter / X

**Post 1 (launch):**

🚀 Live UI Editor v0.3.0 is live

A free VS Code extension that lets you visually edit your React/Next/Vue/Angular app — and writes the changes back to your source code.

Click → drag → edit → apply to code.

New: property inspector, element tree, CSS cascade, diff preview, responsive bar, undo/redo.

🔗 https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor

#vscode #react #webdev #frontend #opensource

**Post 2 (feature highlight):**

What if you could drag elements in your running React app and the code updates itself?

Live UI Editor for VS Code does exactly that.
Free. Open source. Works with React, Next.js, Vite, Vue, Angular, Svelte, Astro + Tailwind.

#buildinpublic #webdev #vscode

**Post 3 (demo clip):**

[attach demo video/gif]

Click to select. Drag to move. Double-click to edit text. Apply to code.

Visual UI editing inside VS Code — no Figma export, no copy-paste.

Free extension → [link]

---

## Hacker News (Show HN)

**Title:** Show HN: Live UI Editor – Visual UI editing inside VS Code with source code sync

**Body:**

I built a VS Code extension that lets you visually edit your running web app and writes the changes back to your source files.

The core workflow: your dev server runs normally (Vite, Next.js, etc.), the extension iframes it, and you get click-to-select, drag-to-move, inline text editing, and a full CSS property inspector. When you hit "Apply to Code," it uses ts-morph to surgically update your JSX/TSX/HTML.

It uses React Fiber inspection for DOM-to-source mapping, supports Tailwind (writes utility classes), handles i18n, and has a chat participant (@ui-wizard) for natural language edits.

v0.3.0 just shipped with a property inspector, element tree, CSS cascade panel, diff preview, responsive viewport presets, element CRUD, undo/redo, and multi-select.

Free, MIT licensed, ~500 installs so far.

Marketplace: https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor
Source: https://github.com/ChaosTimTom/VSC-Live-UI-Editor

---

## Product Hunt (Tagline + Description)

**Tagline:** Visual UI editing inside VS Code — edit your running app and sync changes to source code

**Description:**

Live UI Editor is a free VS Code extension that turns your editor into a visual design tool for your real running app.

**How it works:**
- Your dev server runs normally (React, Next.js, Vite, Vue, Angular, Svelte, Astro)
- The extension iframes your app inside VS Code
- Click to select, drag to move, resize, double-click to edit text
- Edit any CSS property in the Property Inspector
- Review changes in the Diff Preview
- Apply to Code — changes are written to your actual source files

No Figma handoff. No copy-paste. Edit visually and the code updates.

**Key features:**
- Property Inspector (every computed CSS property)
- Element Tree (searchable DOM tree)
- CSS Cascade panel (specificity, overrides)
- Responsive Bar (6 viewport presets)
- Tailwind-aware (writes utility classes)
- Undo/redo, multi-select, element CRUD
- @ui-wizard chat participant for AI-assisted edits

Free and open source (MIT).

🔗 VS Code Marketplace
🔗 GitHub
🔗 Discord Community
