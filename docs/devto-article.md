---
title: I Built a Visual UI Editor Inside VS Code — Here's How It Works
published: false
description: A deep dive into Live UI Editor, a free VS Code extension that lets you visually edit your running React/Next/Vue/Angular app and sync changes back to source code.
tags: vscode, react, webdev, opensource
cover_image: https://raw.githubusercontent.com/ChaosTimTom/VSC-Live-UI-Editor/main/images/logo.png
canonical_url: https://github.com/ChaosTimTom/VSC-Live-UI-Editor
---

# I Built a Visual UI Editor Inside VS Code — Here's How It Works

I've been working on a VS Code extension called **Live UI Editor** for a while now. The idea is simple: **what if you could visually edit your running web app — click, drag, resize, edit text — and have those changes written back to your actual source code?**

No Figma exports. No copy-pasting CSS. You edit visually, and the code updates itself.

It just hit v0.3.0 with a big round of new features, and I wanted to share how it works under the hood and what I've learned building it.

<!-- Replace with your demo GIF -->
<!-- ![Live UI Editor Demo](images/demo.gif) -->

## The Problem

Every frontend developer knows this loop:

1. Write JSX/HTML
2. Save
3. Switch to browser
4. Inspect element
5. Tweak CSS in devtools
6. Copy values back to code
7. Save again
8. Repeat

It's slow. You lose context switching between code and browser. DevTools edits are throwaway — you always have to manually copy them back.

I wanted to collapse that loop into: **click the thing, change the thing, done.**

## How It Works (Architecture)

Here's the high-level architecture:

```
┌─────────────────────────────────────────────────┐
│                    VS Code                       │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │  Your Source  │◄───│    Live UI Editor     │  │
│  │    Files      │    │  ┌─────────────────┐  │  │
│  │  (JSX/TSX)   │    │  │  Your App       │  │  │
│  └──────────────┘    │  │  (in iframe)     │  │  │
│         │            │  └─────────────────┘  │  │
│         ▼            │          │             │  │
│  ┌──────────────┐    │          ▼             │  │
│  │  AST Parser  │    │  Pending edits staged  │  │
│  │  (ts-morph)  │    │  Click "Apply to Code" │  │
│  └──────────────┘    └───────────────────────┘  │
└─────────────────────────────────────────────────┘
```

There are four key pieces:

### 1. Proxy Server

When you open App Mode, the extension starts a local proxy server that routes your dev server (Vite, Next.js, etc.) through VS Code. This lets it inject scripts into the page without modifying your source.

### 2. Injected Client Script

The proxy injects a client script into your app that adds the visual editing layer: hover highlights, selection outlines, drag handles, resize handles, and text editing. This script communicates with the extension via `postMessage`.

### 3. React Fiber Inspection (DOM → Source Mapping)

This is the hardest part. When you click an element, the extension needs to figure out *which line of which file* created that DOM node.

For React apps, it walks the React Fiber tree to find the component that rendered the element, then extracts the source location from React's debug info (`__source` prop or Fiber `_debugSource`).

For more reliable mapping, the extension can inject "Stable IDs" — a Babel plugin that adds `data-lui` attributes during development, giving every element a unique, persistent identifier.

### 4. AST Modification (ts-morph)

When you hit "Apply to Code," the extension doesn't do string manipulation. It parses your file into an AST using ts-morph, finds the exact JSX element, and surgically modifies just the properties that changed. This means:

- It preserves your formatting
- It handles Tailwind classes (adds/removes utility tokens)
- It handles i18n `t('key')` patterns (updates the locale JSON instead of the JSX)
- It can insert, duplicate, wrap, or delete elements

## What's in v0.3.0

This was a big release. Here's what shipped:

### Property Inspector
View and edit every computed CSS property on any selected element. Includes a native color picker and groups properties by category.

### Element Tree
A collapsible, searchable DOM tree panel. Click any node to select it in the preview. Way faster than hunting through the page.

### CSS Cascade Panel
Shows every CSS rule that matches the selected element, with specificity values and visual strikethrough on overridden properties. Basically the "Styles" panel from Chrome DevTools, but inside VS Code.

### Diff Preview
A before/after HTML diff (using an LCS algorithm) so you can see exactly what changed before applying to code. Useful when you've made a bunch of edits and want to review.

### Responsive Bar
Six viewport presets: Mobile S (320px), Mobile M (375px), Mobile L (425px), Tablet (768px), Laptop (1024px), Desktop (1440px). Plus zoom controls and one-click reload. Test responsive layouts without leaving the editor.

### Element CRUD
- **Insert**: add new elements
- **Duplicate**: `Ctrl+D`
- **Wrap in container**: `Ctrl+G`
- **Delete**: `Delete` / `Backspace`
- **Multi-select**: `Ctrl+Shift+Click` to toggle, `Ctrl+A` for all siblings
- All operations support undo/redo (`Ctrl+Z` / `Ctrl+Shift+Z`)

### @ui-wizard Chat Participant
A VS Code Chat participant that can edit the selected element using natural language:
- `@ui-wizard width 240`
- `@ui-wizard make this red`
- `@ui-wizard add a header above this`

## Framework Support

The extension auto-detects your framework from `package.json`:

| Framework | Status |
|-----------|--------|
| Vite + React | ✅ Full support |
| Next.js (App & Pages) | ✅ Full support |
| Angular | ✅ Detected |
| Vue | ✅ Detected |
| SvelteKit | ✅ Detected |
| Astro | ✅ Detected |
| Nuxt | ✅ Detected |
| Gatsby | ✅ Detected |
| Remix | ✅ Detected |
| Static HTML | ✅ Full support |

Tailwind CSS is automatically detected and the style adapter writes utility classes instead of inline styles.

## Lessons Learned

### iframes are painful

Getting a dev server to load reliably inside a VS Code webview iframe is a minefield of CSP headers, CORS policies, and origin mismatches. The proxy server exists entirely to work around these issues.

### React Fiber is an implementation detail

Walking the Fiber tree works great — until React changes the internal structure between versions. Stable IDs (the Babel plugin approach) turned out to be much more reliable as a fallback.

### People want visual editing more than you'd think

I expected this to be a niche tool. But 500 installs later, the most common feedback is "I've been wanting something like this for years." The gap between design tools and code editors is real.

## Try It Out

It's free and open source (MIT licensed).

- **Install from Marketplace:** [Live UI Editor](https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor)
- **GitHub:** [ChaosTimTom/VSC-Live-UI-Editor](https://github.com/ChaosTimTom/VSC-Live-UI-Editor)
- **Discord:** [Join the community](https://discord.gg/QHnHhCjWDQ)

If you try it, I'd love to hear what you think. Drop a comment here, open a GitHub issue, or jump in the Discord.

And if you find it useful, a ⭐ on GitHub or a review on the Marketplace goes a long way.
