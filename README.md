<p align="center">
  <img src="images/icon.png" alt="Live UI Editor" width="128" height="128">
</p>

<h1 align="center">Live UI Editor</h1>

<p align="center">
  <strong>Edit your UI visually — right inside VS Code.<br>Click to select, drag to move, inspect styles, and apply changes to source code instantly.</strong>
</p>

<p align="center">
  <a href="https://discord.gg/QHnHhCjWDQ"><strong>Join the Discord</strong></a>
  <br>
  <sub>Get help, share wins, and drop ideas/feedback.</sub>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor">
    <img src="https://img.shields.io/visual-studio-marketplace/v/TheImmersiveSaga.vscode-live-ui-editor?style=for-the-badge&logo=visual-studio-code&logoColor=white&label=VS%20Code&color=007ACC" alt="VS Code Marketplace Version">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor">
    <img src="https://img.shields.io/visual-studio-marketplace/i/TheImmersiveSaga.vscode-live-ui-editor?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=28a745" alt="Installs">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor">
    <img src="https://img.shields.io/visual-studio-marketplace/r/TheImmersiveSaga.vscode-live-ui-editor?style=for-the-badge&logo=visual-studio-code&logoColor=white&color=ff9800" alt="Rating">
  </a>
  <a href="https://discord.gg/QHnHhCjWDQ">
    <img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Discord">
  </a>
  <a href="https://github.com/ChaosTimTom/VSC-Live-UI-Editor/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/ChaosTimTom/VSC-Live-UI-Editor?style=for-the-badge&color=blue" alt="License">
  </a>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-documentation">Docs</a> •
  <a href="#-contributing">Contributing</a> •
  <a href="#-links">Links</a>
</p>

---

<!-- 🎬 DEMO: Replace with your GIF or video once recorded -->
<p align="center">
  <img src="images/demo.gif" alt="Live UI Editor — click, drag, edit, apply to code" width="800">
  <br>
  <sub>Click any element → edit styles, text, or layout → changes apply to your source code</sub>
</p>

<!-- Optional: link a YouTube video for people who want a longer walkthrough -->
<!-- <p align="center">
  <a href="https://youtu.be/YOUR_VIDEO_ID">
    <img src="https://img.shields.io/badge/Watch%20Demo-YouTube-red?style=for-the-badge&logo=youtube" alt="Watch Demo">
  </a>
</p> -->

---

## 🧩 Works With

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular">
  <img src="https://img.shields.io/badge/Vue-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white" alt="Vue">
  <img src="https://img.shields.io/badge/Svelte-FF3E00?style=for-the-badge&logo=svelte&logoColor=white" alt="Svelte">
  <img src="https://img.shields.io/badge/Astro-BC52EE?style=for-the-badge&logo=astro&logoColor=white" alt="Astro">
  <img src="https://img.shields.io/badge/Nuxt-00DC82?style=for-the-badge&logo=nuxtdotjs&logoColor=white" alt="Nuxt">
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind">
  <img src="https://img.shields.io/badge/Static_HTML-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML">
</p>

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎯 Click to Code
Click any element in your running app and instantly jump to its source location in your editor.

<!-- Screenshot: images/feature-click-to-code.png -->

</td>
<td width="50%">

### 🖱️ Drag & Resize
Move and resize elements visually.

<!-- Screenshot: images/feature-drag-resize.png -->

You can control how layout changes are persisted:

- **Layout: Off** — drag/resize is preview-only (won't be written to code)
- **Layout: Safe** — drag moves are saved as margin adjustments (responsive-friendly)
- **Layout: Full** — drag/resize is saved as width/height/transform

</td>
</tr>
<tr>
<td width="50%">

### ✏️ Inline Text Editing
Double-click to edit text inline.

- **App Mode**: supports i18n-aware updates for common `t('key')` patterns when translation files are present.
- **Static HTML mode**: edits plain HTML text.

<!-- Screenshot: images/feature-text-editing.png -->

</td>
<td width="50%">

### 🗑️ Element CRUD
Insert, duplicate, wrap, and delete elements with toolbar buttons or keyboard shortcuts (`Ctrl+D`, `Ctrl+G`, `Delete`). Multi-select with `Ctrl+Shift+Click` for bulk operations. Fully undoable.

<!-- Screenshot: images/feature-crud.png -->

</td>
</tr>
<tr>
<td width="50%">

### 🔄 Live Preview
See changes instantly in the embedded browser. Toggle between Edit and Browse modes.

</td>
<td width="50%">

### 📦 Safe Staging
All changes are previewed before saving. Apply or discard pending edits with one click.

</td>
</tr>
<tr>
<td width="50%">

### 🎛️ Universal Style Targets
Apply style edits in a way that matches your project:

- **Auto** (recommended): prefers **Tailwind** when detected, otherwise writes a **CSS class rule**.
- **Inline**: escape hatch when you need it (with warnings for layout-risky changes).

</td>
<td width="50%">

### 📱 Responsive Bar
Switch the preview viewport between six breakpoints (Mobile S/M/L, Tablet, Laptop, Desktop) to test responsive layouts.

</td>
</tr>
<tr>
<td width="50%">

### 🔍 Inspector + CSS Cascade
View and edit every computed CSS property inline. The Cascade panel shows which rules apply, their specificity, and what's overridden.

<!-- Screenshot: images/feature-inspector.png -->

</td>
<td width="50%">

### 🌳 Element Tree + Diff Preview
Browse and search the full DOM tree. Open the diff panel to see a before/after comparison of every HTML change.

<!-- Screenshot: images/feature-tree-diff.png -->

</td>
</tr>
<tr>
<td colspan="2">

### 🎨 Page Redesign (Figma-like)
Ask `@ui-wizard` to redesign an **entire page** — no element selection needed. Describe the look you want in plain language and watch CSS stream into the live viewport in real-time. Review the result, then approve to bake it into your source file or reject to revert.

```
@ui-wizard redesign this page as a modern SaaS landing page
@ui-wizard give it a dark theme with glassmorphic cards
@ui-wizard restyle the entire layout as a portfolio
```

</td>
</tr>
</table>

---

## 🧭 Two Editing Modes

Live UI Editor supports two ways of working:

### 1) Static HTML mode (no dev server)

- Open an `.html` file and edit it visually.
- Best for simple sites, prototypes, or when you don’t have a dev server.

### 2) App Mode (dev server)

- Connects to a local dev server (Vite/Next/etc.) and lets you edit your real running app UI.
- Changes are staged as **Pending** and you choose when to **Apply to Code**.

The extension’s **Welcome / Quick Start** screen helps you choose the right mode.

---

## 🚀 Quick Start

### Installation

**From VS Code Marketplace:**

1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for **"Live UI Editor"**
4. Click **Install**

**Or install via command line:**
```bash
code --install-extension TheImmersiveSaga.vscode-live-ui-editor
```

### First Launch

1. **Open** your React/Vite project in VS Code
2. **Press** `Ctrl+Shift+P` → type **"Live UI: Open"**
3. In the Welcome screen, choose:
  - **Static HTML / No dev server**, or
  - **App Mode (dev server)**
4. **Start editing** — click, drag, resize, or double-click text

That's it! Your changes are staged and ready to apply.

Need help, want to share wins, or have ideas/feedback?
Join the Discord: https://discord.gg/QHnHhCjWDQ

---

## 🧠 First-Time Setup (Idiot-Proof)

Most people should run **Live UI: Open** and follow the Welcome screen.

App Mode needs a running dev server it can iframe.

### 1) Start / connect to your dev server

Run **"Live UI: Open"** (or **"Live UI: Open (App Mode)"**) and the extension will:

- Try to **auto-detect** a running dev server on common ports.
- If none is found, it offers:
  - **Start dev server (recommended)** (in the integrated terminal)
  - **Use existing URL** (paste your dev server URL)
  - **External window** (starts dev server detached on Windows)

Notes:
- App Mode forces your dev server to bind to `127.0.0.1` (for consistent iframe/CSP behavior).
- Vite is started with `--host 127.0.0.1 --port <port> --strictPort`.
- Next.js is started with `--hostname 127.0.0.1 --port <port>`.
- If you paste a non-local URL, App Mode will require a safety confirmation.
- App Mode will refuse to apply edits to files outside your workspace/app root.

If your app also needs a separate backend/API server (for navigation, auth, data, etc.), use the **Start Backend** button in the App Mode sidebar.

- It can run a detected script like `dev:api` / `dev:backend` / `server`, or you can enter a custom command.
- It remembers your choice per app root for one-click starts.

### 2) Use Edit vs Browse mode

- **Edit mode**: hover highlight, click selects, drag/resize, double-click text.
- **Browse mode**: normal app interaction.

If UI Wizard says there is no selection, make sure you’re in **Edit** and click an element.

### 2.5) UI Wizard (Chat)

Live UI Editor includes a Chat participant named **UI Wizard** (`ui-wizard`) that can edit the currently selected element using plain language.

How to use it:

1. In App Mode, make sure you’re in **Edit** and click an element (so it becomes the current selection).
2. Open VS Code Chat (View → Chat).
3. Type `@ui-wizard` and describe the change.

Examples:

- `@ui-wizard width 240`
- `@ui-wizard height 48`
- `@ui-wizard move right 20`
- `@ui-wizard x 40 y 12`

It also supports:

- Style suggestions with preview/apply (`suggest`, `preview`, `apply`, `undo`)
- Bulk apply to groups (`apply 1 to all buttons`)
- Structural edits (`add a header`, `wrap this in a box`)
- Image helpers (`use an image as the background`)

Help:

- `@ui-wizard commands`
- `@ui-wizard commands for layout`
- `@ui-wizard commands for bulk`
- `@ui-wizard commands for structure`
- `@ui-wizard commands for images`
**Page redesign** (no element selection needed):

- `@ui-wizard redesign this page as a modern marketing site`
- `@ui-wizard give this a dark theme`
- `@ui-wizard restyle the entire layout as a blog`

CSS streams into the viewport in real-time. After reviewing, say `apply` to save or `cancel` to revert.
### 3) Fix “Identity: Unmapped” (highly recommended)

If the sidebar shows **Identity: Unmapped**, selection is working, but the editor can’t map that element back to source code.

Click **Enable Stable IDs**.

What it changes in your app:

- Writes `live-ui-editor.babel-plugin.js` into your app root (dev-only Babel plugin).
- Vite:
  - Patches `vite.config.*` to ensure `@vitejs/plugin-react` is used.
  - Adds the Babel plugin to the React plugin config.
  - Installs `@vitejs/plugin-react` if it’s missing.
- Next.js:
  - Adds/patches `.babelrc` (or `babel.config.js`) to include `next/babel` + the plugin.
  - Important: this can make Next dev use Babel instead of SWC.

Then restart your dev server.

### 4) Pick how styles are written (Auto/Tailwind/CSS/Inline)

Use the **Style Target** dropdown in the App Mode sidebar:

- **Auto**: chooses the best available adapter and shows the reason.
- **Tailwind**: writes Tailwind utility tokens into `className` (when className is a simple string).
- **CSS file**: adds a stable class and upserts a `.lui-xxxx { ... }` rule into a chosen CSS file.
- **Inline**: writes `style={...}` in JSX/HTML (can override responsive CSS; the extension will warn you).

### 5) (Optional) Tauri apps in App Mode

If your app is Tauri-targeted (has `src-tauri/tauri.conf.json`), App Mode can auto-enable **Tauri Shim**.

- The shim is a browser stub so the app can load and you can navigate UI.
- Native features won’t fully work (it’s intentionally a compatibility layer, not a full Tauri runtime).

You can toggle it via the **Tauri Shim** checkbox in the App Mode sidebar.

---

## 🎮 Controls

| Action | Shortcut |
|--------|----------|
| **Select element** | `Click` |
| **Jump to source** | `Ctrl+Click` |
| **Multi-select toggle** | `Ctrl+Shift+Click` |
| **Select all siblings** | `Ctrl+A` |
| **Select leaf element** | `Alt+Click` |
| **Select group** | `Shift+Click` |
| **Move element** | `Drag` selection |
| **Resize element** | `Drag` corner handle |
| **Nudge 1 px / 10 px** | Arrow keys / `Shift+Arrow` |
| **Edit text** | `Double-click` |
| **Duplicate element** | `Ctrl+D` |
| **Wrap in container** | `Ctrl+G` |
| **Delete element** | `Delete` / `Backspace` |
| **Undo / Redo** | `Ctrl+Z` / `Ctrl+Shift+Z` |
| **Deselect** | `Escape` |
| **Apply changes** | Click **Apply to Code** |
| **Discard changes** | Click **Discard** |

---

## 🔧 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                         VS Code                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   Your Source   │◄───│         Live UI Editor          │ │
│  │    Files        │    │  ┌───────────────────────────┐  │ │
│  │  (JSX/TSX)      │    │  │   Your Vite App (iframe)  │  │ │
│  └─────────────────┘    │  │                           │  │ │
│          │              │  │   [Visual editing here]   │  │ │
│          ▼              │  │                           │  │ │
│  ┌─────────────────┐    │  └───────────────────────────┘  │ │
│  │   AST Parser    │    │              │                   │ │
│  │   (ts-morph)    │    │              ▼                   │ │
│  └─────────────────┘    │     Pending edits staged         │ │
│                         │     Click "Apply to Code"        │ │
│                         └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

1. **Proxy Server** — Routes your dev server through VS Code (App Mode runs your real app)
2. **Injected Script** — Adds selection, dragging, and editing UI to your app
3. **React Fiber Inspection** — Maps DOM elements back to source code locations
4. **AST Modification** — Uses ts-morph to surgically edit your source files

---

## 📖 Documentation

For full beginner-friendly help (including the Welcome screen flow, Static HTML mode, App Mode, UI Wizard, and troubleshooting), see [HELP.md](HELP.md).

### Editing Modes

| Mode | Description |
|------|-------------|
| **Edit** | Visual editing enabled — click to select, drag to move |
| **Browse** | Normal app interaction — click events pass through |

Toggle with the **Switch to Browse/Edit** button in the sidebar.

### Layout Apply

By default, layout changes (drag/resize) are **preview only**.

- **Layout: Off** (default): preview only (won't save to code)
- **Layout: Safe**: drag saves as margin adjustments (more responsive-friendly)
- **Layout: Full**: drag/resize writes `width`, `height`, `transform` to source

Control it via the **Layout mode** dropdown in the App Mode sidebar.

### Stable IDs (Recommended)

For reliable element targeting, enable Stable IDs:

1. Click **Enable Stable IDs** in the sidebar
2. The extension injects `data-lui` attributes via a Babel plugin
3. Restart your dev server

This ensures elements are uniquely identifiable even after HMR updates.

### i18n Support

The extension auto-detects `{t('translation.key')}` patterns:

- Text edits update your `src/locales/*.json` files
- The JSX source stays unchanged
- Supports nested keys like `common.buttons.save`

---

## 📋 Requirements

| Requirement | Version |
|-------------|---------|
| VS Code | 1.85.0+ |
| Node.js | 18+ |

### Framework Detection

The extension auto-detects your framework from `package.json`:

| Framework | Status |
|-----------|--------|
| Vite + React | ✅ Full support |
| Vite + React + TS | ✅ Full support |
| Next.js | ✅ Supported (App & Pages router) |
| Create React App | ⚠️ Limited (no proxy) |
| Astro | ✅ Detected |
| SvelteKit | ✅ Detected |
| Angular | ✅ Detected |
| Vue CLI | ✅ Detected |
| Nuxt | ✅ Detected |
| Gatsby | ✅ Detected |
| Remix | ✅ Detected |
| Static HTML | ✅ Full support (no framework needed) |

---

## 🐛 Troubleshooting

For fastest help (and to share ideas/wins): https://discord.gg/QHnHhCjWDQ

<details>
<summary><strong>Buttons not responding in App Mode</strong></summary>

Reload the VS Code window (`Ctrl+Shift+P` → "Reload Window") and restart App Mode.

</details>

<details>
<summary><strong>Changes applied to wrong element</strong></summary>

Enable **Stable IDs** for reliable targeting. Without them, elements are matched by heuristics which can fail after HMR updates.

</details>

<details>
<summary><strong>Identity says “Unmapped”</strong></summary>

Click **Enable Stable IDs** and restart your dev server. Without Stable IDs (or React debug source), App Mode can’t reliably map DOM → source.

</details>

<details>
<summary><strong>Tauri app says “not running in Tauri environment”</strong></summary>

Enable **Tauri Shim** in the App Mode toolbar. This stubs the minimal Tauri surface needed for many Tauri-targeted web UIs to load in a browser.

</details>

<details>
<summary><strong>Dev server won't start</strong></summary>

1. Ensure your `package.json` has a `dev` script
2. Check that port 5173 is available
3. Try starting the server manually first, then use App Mode

</details>

<details>
<summary><strong>i18n text edit failed</strong></summary>

- Translation files must be in `src/locales/*.json`
- The translation key must exist in the JSON file
- Check Output panel: **View → Output → Live UI Editor**

</details>

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/VSC-Live-UI-Editor.git`
3. **Install** dependencies: `npm install && cd webview-ui && npm install`
4. **Build**: `npm run build`
5. **Test** in VS Code: Press `F5` to launch Extension Development Host
6. **Submit** a pull request

### Development Scripts

```bash
npm run build          # Build extension + webview
npm run watch:extension # Watch mode for extension
npm run build:webview   # Build webview UI only
```

### Maintainers

- Release checklist: see [RELEASING.md](RELEASING.md)
- Version history: see [CHANGELOG.md](CHANGELOG.md)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🔗 Links

- **Marketplace**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor)
- **Discord**: https://discord.gg/QHnHhCjWDQ
- **Repository**: [GitHub](https://github.com/ChaosTimTom/VSC-Live-UI-Editor)
- **Issues**: [Report a bug](https://github.com/ChaosTimTom/VSC-Live-UI-Editor/issues)
- **Discussions**: [Ask questions](https://github.com/ChaosTimTom/VSC-Live-UI-Editor/discussions)

---

<p align="center">
  <strong>If Live UI Editor saves you time, consider leaving a ⭐ on <a href="https://github.com/ChaosTimTom/VSC-Live-UI-Editor">GitHub</a> and a review on the <a href="https://marketplace.visualstudio.com/items?itemName=TheImmersiveSaga.vscode-live-ui-editor&ssr=false#review-details">Marketplace</a>.</strong>
  <br>
  It helps others find the extension and keeps development going.
</p>

<p align="center">
  <strong>Made with ❤️ by <a href="https://github.com/ChaosTimTom">ChaosTimTom</a></strong>
  <br>
  <sub>Visual editing for developers who want to see their changes instantly.</sub>
</p>

<p align="center">
  <a href="https://github.com/ChaosTimTom/VSC-Live-UI-Editor/stargazers">
    <img src="https://img.shields.io/github/stars/ChaosTimTom/VSC-Live-UI-Editor?style=social" alt="GitHub stars">
  </a>
</p>
