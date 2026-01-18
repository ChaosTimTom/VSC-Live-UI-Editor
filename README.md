# Live UI Editor for VS Code

A visual UI editor extension for VS Code that lets you **edit your React/Vite app visually** and save changes directly to source code.

![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue)
![React](https://img.shields.io/badge/React-Supported-61dafb)
![Vite](https://img.shields.io/badge/Vite-Supported-646cff)

## ✨ Features

- **App Mode**: Run your real Vite/React app inside VS Code and edit it visually
- **Click-to-Code**: Click any element to jump to its source code location
- **Visual Editing**: Drag, resize, and style elements with live preview
- **Apply to Code**: Preview changes first, then apply them to your source files
- **Delete Elements**: Remove JSX elements from source with a single click
- **i18n Support**: Automatically detects and updates translation files for i18n text
- **Multi-Select**: Select multiple elements with Shift+Click or Shift+Drag
- **Safe Editing**: All changes are staged and previewed before writing to disk

---

## 📦 Installation

### Option 1: Install from VSIX (Recommended)

1. Go to [Releases](https://github.com/ChaosTimTom/VSC-Live-UI-Editor/releases)
2. Download the latest `.vsix` file
3. In VS Code, press `Ctrl+Shift+P` → type "Install from VSIX"
4. Select the downloaded `.vsix` file
5. Reload VS Code

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/ChaosTimTom/VSC-Live-UI-Editor.git
cd VSC-Live-UI-Editor

# Install dependencies
npm install
cd webview-ui && npm install && cd ..

# Build the extension
npm run build

# Package as VSIX (optional)
npx vsce package
```

Then install the generated `.vsix` file via VS Code.

---

## 🚀 Quick Start

### 1. Open Your Project

Open your React/Vite project folder in VS Code.

### 2. Start App Mode

1. Press `Ctrl+Shift+P` to open the Command Palette
2. Type **"Live UI Editor: Start App Mode"** and press Enter
3. The extension will:
   - Detect your Vite project
   - Start the dev server (or attach to an existing one)
   - Open your app in a VS Code webview panel

### 3. Edit Visually

Once App Mode is running, you can start editing:

| Action | How To |
|--------|--------|
| **Select element** | Click on any element |
| **Jump to code** | `Ctrl+Click` (or `Cmd+Click` on Mac) |
| **Multi-select** | `Shift+Click` to toggle, or `Shift+Drag` to draw selection box |
| **Select exact element** | `Alt+Click` (selects the precise leaf element) |
| **Move element** | Drag the selected element |
| **Resize element** | Drag the orange handle at bottom-right corner |
| **Delete element** | Click the 🗑️ button above selection |
| **Edit text** | Double-click text content to edit inline |

---

## 🎛️ App Mode Controls

The top bar in App Mode provides these controls:

| Control | Description |
|---------|-------------|
| **Mode: Edit / Browse** | Toggle between editing mode and normal browsing |
| **Switch to Browse/Edit** | Button to toggle mode |
| **Pending: N** | Shows number of staged (unsaved) changes |
| **Apply to Code** | Write all pending changes to source files |
| **Discard** | Discard all pending changes |
| **Identity: Stable/Fallback** | Shows if element targeting is reliable |
| **Enable Stable IDs** | Injects stable identifiers for reliable targeting |
| **Layout Apply** | Checkbox to enable/disable saving drag/resize changes |

---

## 📝 Detailed Usage

### Editing Styles

1. Select an element by clicking it
2. Make changes:
   - **Drag** to move (writes `transform` to source)
   - **Resize** using the corner handle (writes `width`/`height`)
   - **Use UI Wizard** (chat) for complex style changes
3. Changes appear in **Pending** count
4. Click **Apply to Code** to save

### Editing Text

1. Double-click text content
2. Edit the text inline
3. Press Enter or click away to confirm
4. Click **Apply to Code** to save

**i18n Note**: If the text uses `{t('translation.key')}`, the extension will automatically update your translation JSON file instead of the JSX.

### Deleting Elements

1. Select an element
2. Click the 🗑️ (trash) button above the selection
3. The element is immediately removed from source code
4. Use `Ctrl+Z` in the source file to undo if needed

### Layout Apply Toggle

By default, **Layout Apply is OFF** to prevent accidental layout changes.

- **OFF**: Drag/resize previews work, but won't be saved to code
- **ON**: Drag/resize changes are saved as `width`, `height`, `transform`

Toggle it using the checkbox in the top bar.

---

## ⚡ Enable Stable IDs (Recommended)

For the most reliable editing experience, enable Stable IDs in your project:

### Automatic Setup

1. Click **Enable Stable IDs** button in App Mode
2. The extension will:
   - Add a Babel plugin to your project
   - Inject `data-lui` attributes at build time
   - Restart your dev server

### Manual Setup

Add to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['./live-ui-editor.babel-plugin.js'],
      },
    }),
  ],
});
```

The plugin file is automatically created in your project root when you click "Enable Stable IDs".

---

## 🔧 Requirements

- **VS Code** 1.85.0 or higher
- **Node.js** 18+ 
- A **Vite + React** project (other frameworks have limited support)

### Supported Project Types

| Framework | Support Level |
|-----------|--------------|
| Vite + React | ✅ Full |
| Vite + React + TypeScript | ✅ Full |
| Create React App | ⚠️ Partial (no HMR injection) |
| Next.js | ⚠️ Experimental |
| Plain HTML/CSS | ⚠️ Limited |

---

## 🐛 Troubleshooting

### "App Mode UI buttons don't respond"

1. Reload the Extension Development Host window
2. Restart App Mode

### "Apply didn't stick" or "wrong element changed"

- Enable **Stable IDs** for reliable targeting
- Check the **Apply report** for detailed success/failure info
- Some elements may fail if they can't be uniquely identified

### "Layout changes affected other elements"

- This happens when parent containers use flex/grid
- The extension modifies inline styles, which may interact with CSS layout
- Consider using **Layout Apply OFF** and editing CSS classes instead

### "Text edit failed on i18n element"

- The extension looks for translation files in `src/locales/*.json`
- Make sure your translation key exists in the JSON file
- Check the Output panel (View → Output → Live UI Editor) for details

### Dev server won't start

1. Make sure you have a valid `package.json` with a `dev` script
2. Check that port 5173 (default Vite port) is available
3. Try starting the dev server manually first, then use App Mode

---

## 📂 Project Structure

```
live-ui-editor/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── appMode/
│   │   ├── injectedClientScript.ts  # Runs inside the app iframe
│   │   └── webviewAppModeHtml.ts    # App Mode webview wrapper
│   ├── codeModifier/
│   │   └── CodeModifier.ts   # AST-based source code modifications
│   └── chat/
│       └── uiWizard.ts       # Natural language UI editing
├── webview-ui/               # React webview for panels
└── tools/                    # Vite plugin for stable IDs
```

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Built with [ts-morph](https://github.com/dsherret/ts-morph) for AST manipulation
- Uses React fiber internals for element-to-source mapping
- Inspired by browser DevTools and visual design tools

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/ChaosTimTom/VSC-Live-UI-Editor/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ChaosTimTom/VSC-Live-UI-Editor/discussions)

---

**Made with ❤️ for developers who want to edit UI visually without leaving VS Code.**
