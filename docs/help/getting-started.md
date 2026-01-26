# Getting Started (Click-by-click)

This guide is written for people who are new to VS Code.

By the end, you will:

- Open a folder correctly (this matters)
- Open Live UI Editor
- Choose what to edit from the **Detected main** + **Other detected targets** lists
- Make a small change and verify it updates your code

## What Live UI Editor does (in plain English)

Live UI Editor shows a preview of your UI *inside VS Code*. You can click elements and visually change things like:

- Text
- Color
- Spacing (padding/margin)
- Typography

Then Live UI Editor tries to write those changes back into your real project files.

There are two workflows:

- **Static HTML Mode**: edit a single `.html` file (no dev server required).
- **App Mode**: connect to a running dev server (Vite / Next.js / etc.), then stage edits and click **Apply to Code**.

If you’re not sure which one to use, start with **Static HTML Mode**.

---

## Step 1 — Open a folder (not just a file)

Live UI Editor needs a *folder* open so it can find your project files.

1. In VS Code, click **File** → **Open Folder…**
2. Choose your project folder
3. Click **Select Folder**

### What you should see

- The **Explorer** panel (left side) shows folders/files.
- The window title shows the folder name.

### If you don’t see the Explorer panel

- Click the Explorer icon on the left sidebar (it looks like two files), or
- Press `Ctrl+Shift+E`

---

## Step 2 — Open Live UI Editor

1. Open the Command Palette:
   - Press `Ctrl+Shift+P`
2. Type: `Live UI`
3. Click **Live UI: Open**

### What you should see

- A new tab opens with the Live UI Editor Welcome / Quick Start screen.

---

## Step 3 — Pick what to edit (Detected main + other targets)

On the Welcome screen you’ll see something like:

- **Detected main**: the extension’s best guess of what you probably want
- **Other detected targets**: other valid choices (apps, previews, HTML entrypoints)

Pick the one you want.

### Quick rule of thumb

- If you see an **HTML entrypoint** you recognize (like `index.html`), choose that for a quick win.
- If you see an **App/dev server** choice, that’s for App Mode.

---

## Step 4A — Static HTML Mode (recommended first try)

Use this if you have an `.html` file.

1. Choose an HTML entrypoint target
2. Wait for the preview to load
3. Click an element in the preview
4. Make one small change (for example: change text, or adjust padding)

### What you should see

- The preview updates.
- Your `.html` file changes in VS Code (often shown by a dot on the file tab).

### How to confirm it updated code

Open the `.html` file and look for changes like:

- Updated text inside an element
- Updated `style="..."` attributes

---

## Step 4B — App Mode (dev server)

Use this if your project is React/Vite/Next/etc.

App Mode requires your app to be running.

1. Open the Terminal: click **Terminal** → **New Terminal**
2. If needed, install dependencies: `npm install`
3. Start the dev server (commonly): `npm run dev`
4. Wait for a local URL to appear in the terminal (often `http://localhost:3000` or `http://localhost:5173`)
5. In Live UI Editor, choose the detected App/dev server target
6. Make edits, then click **Apply to Code** to write changes into source files

### What you should see

- The preview shows your real app.
- Clicking elements selects/highlights them.
- After **Apply to Code**, files like `.jsx` / `.tsx` update.

---

## What gets written to code?

Live UI Editor can write back different kinds of changes:

- **Text edits**: double-click text and type. (Works best when the element can be mapped to source.)
- **Style edits**: color/spacing/typography changes are written using the chosen **Style Target** strategy.
- **Layout edits**:
  - Static HTML Mode writes layout directly into the HTML.
  - App Mode layout can be **Off / Safe / Full** (see App Mode page).

---

## Tips that avoid most issues

- In **App Mode**, your dev server must be running and reachable.
- If Apply-to-Code seems flaky, enable **Stable IDs** (App Mode sidebar).
- If you’re unsure what to run, use **Copy Copilot prompt** on the Welcome screen.

## If you’re stuck

If the Welcome screen shows “No folder open” or detection is empty:

1. Repeat Step 1 (open a folder)
2. Confirm the folder contains your project files
3. For App Mode, start your dev server and keep it running

Then open the Troubleshooting page.
