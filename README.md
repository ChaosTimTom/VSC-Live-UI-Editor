<p align="center">
  <img src="images/icon.png" alt="Live UI Editor" width="128" height="128">
</p>

<h1 align="center">Live UI Editor</h1>

<p align="center">
  <strong>Visual React/Vite/Next.js editing inside VS Code — click-to-code, live preview, and safe source updates.</strong>
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

<!-- Add your demo GIF here -->
<!-- <p align="center">
  <img src="images/demo.gif" alt="Live UI Editor Demo" width="800">
</p> -->

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎯 Click to Code
Click any element in your running app and instantly jump to its source location in your editor.

</td>
<td width="50%">

### 🖱️ Drag & Resize
Move and resize elements visually.

You can control how layout changes are persisted:

- **Layout: Off** — drag/resize is preview-only (won't be written to code)
- **Layout: Safe** — drag moves are saved as margin adjustments (responsive-friendly)
- **Layout: Full** — drag/resize is saved as width/height/transform

</td>
</tr>
<tr>
<td width="50%">

### ✏️ Inline Text Editing
Double-click any text to edit it inline. Supports i18n — automatically updates your translation JSON files.

</td>
<td width="50%">

### 🗑️ Delete Elements
Remove JSX elements from source with a single click. Fully undoable with `Ctrl+Z`.

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

### 📱 Mobile/Responsive Workflow
Preview common device sizes and enable safe-area + warning overlays to catch responsive issues early.

</td>
</tr>
</table>

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
2. **Press** `Ctrl+Shift+P` → type **"Live UI: Open (App Mode)"**
3. **Start editing** — click, drag, resize, or double-click text

That's it! Your changes are staged and ready to apply.

Need help, want to share wins, or have ideas/feedback?
Join the Discord: https://discord.gg/QHnHhCjWDQ

---

## 🧠 First-Time Setup (Idiot-Proof)

App Mode needs a running dev server it can iframe.

### 1) Start / connect to your dev server

Run **"Live UI: Open (App Mode)"** and the extension will:

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

Help:

- `@ui-wizard commands`
- `@ui-wizard commands for layout`
- `@ui-wizard commands for bulk`

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
| **Multi-select** | `Shift+Click` or `Shift+Drag` |
| **Select leaf element** | `Alt+Click` |
| **Move element** | `Drag` selection |
| **Resize element** | `Drag` corner handle |
| **Layout mode** | Sidebar dropdown: **Layout: Off / Safe / Full** |
| **Edit text** | `Double-click` |
| **Delete element** | Click `🗑️` button |
| **Start backend** | Click **Start Backend** |
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
| Project | Vite + React |

### Framework Support

| Framework | Status |
|-----------|--------|
| Vite + React | ✅ Full support |
| Vite + React + TS | ✅ Full support |
| Create React App | ⚠️ Limited (no proxy) |
| Next.js | 🧪 Experimental |
| Vue/Svelte | 🚧 Planned |

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
  <strong>Made with ❤️ by <a href="https://github.com/ChaosTimTom">ChaosTimTom</a></strong>
  <br>
  <sub>Visual editing for developers who want to see their changes instantly.</sub>
</p>

<p align="center">
  <a href="https://github.com/ChaosTimTom/VSC-Live-UI-Editor/stargazers">
    <img src="https://img.shields.io/github/stars/ChaosTimTom/VSC-Live-UI-Editor?style=social" alt="GitHub stars">
  </a>
</p>
