# App Mode (dev server) — Step-by-step

App Mode connects Live UI Editor to your *running application* (usually a local dev server) and lets you edit the real UI.

In App Mode, edits are staged as **Pending** first. They are only written back into your files when you click **Apply to Code**.

## Before you start (requirements)

You need:

- A project that can run locally (Vite/React, Next.js, etc.)
- Node.js installed
- A dev server URL that works in a normal browser (usually `http://127.0.0.1:<port>`)

If you don’t have a running app/dev server, use Static HTML Mode instead.

---

## Step 1 — Start your dev server

1. Open VS Code’s terminal: **Terminal** → **New Terminal**
2. Install dependencies (only needed once): `npm install`
3. Start the dev server (common): `npm run dev`
4. Wait for a message that includes a local URL

### What you should see

- The terminal prints a URL like `http://localhost:5173` or `http://localhost:3000`.

### Quick check

Copy that URL into your normal browser. If it loads, App Mode is much more likely to work.

---

## Step 2 — Open App Mode in Live UI Editor

1. Open the Command Palette: `Ctrl+Shift+P`
2. Run: **Live UI: Open**
3. Choose: **App Mode (dev server)**
4. Choose how to connect:
   - **Start dev server (integrated terminal)** (if you want the extension to run it)
   - **Start dev server (external)** (if you already started it)
   - **Use existing URL** (paste your URL)
5. Click **Start App Mode**

### What you should see

- A preview loads your app.
- You can click UI elements and see an overlay/selection.

---

## Step 3 — Edit mode vs Browse mode

App Mode has two “interaction modes”:

- **Edit mode**: selection overlays, drag/resize, click-to-code.
- **Browse mode**: your app behaves normally (good for login flows, menus, navigation).

Use the sidebar button to switch.

---

## Step 4 — Make an edit and apply it to code

1. Switch to **Edit mode**
2. Click an element
3. Make a small change (text or style)
4. Look for **Pending: N**
5. Click **Apply to Code**

### What you should see

- Pending count goes back down after applying.
- One or more source files change (often `.jsx` / `.tsx`).

If you click **Discard**, pending edits are removed and nothing is written.

---

## Stable IDs (recommended when Apply-to-Code feels unreliable)

If Apply-to-Code seems to change the wrong place (or can’t find the element), enable Stable IDs.

1. In the App Mode sidebar, click **Enable Stable IDs**
2. Follow the prompts
3. Restart your dev server (important)

What Stable IDs does:

- Writes a dev-only Babel plugin file into your app
- Patches your framework config (Vite/Next) so elements get stable `data-lui` identities
- Makes element → source mapping much more reliable

---

## Style Target (how style edits get written)

This controls *where* style changes go:

- **Auto**: best-effort choice
- **Tailwind**: edits utility classes where possible
- **CSS file**: writes class rules into a chosen CSS file
- **Inline**: writes inline style props

If you’re unsure, start with **Auto**.

---

## Layout Apply (drag/resize) — choose the safe option first

- **Off (safest)**: preview-only; nothing written for layout moves
- **Safe**: persists drag moves as margin adjustments (more responsive-friendly)
- **Full**: persists width/height/transform (advanced)

If you’re just getting started, use **Off** or **Safe**.

---

## Remote SSH / Dev Containers / WSL (if you’re using them)

If VS Code is connected to a remote environment:

- The Live UI Editor panel runs locally.
- Your dev server runs remotely.

App Mode routes the embedded preview through a proxy that works with port-forwarding.

If hot reload (HMR) doesn’t reconnect:

- Confirm the dev server port is forwarded/reachable.
- Prefer default dev-server configs (same-origin websocket URLs usually work best).

---

## Backend helper (optional)

If your app also needs a backend/API server (auth, data, etc.), App Mode can help start it via **Start Backend**.
