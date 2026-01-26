# Troubleshooting (Common problems + fixes)

This page is written as: **symptom → what to check → what to do next**.

## “No folder open” / nothing is detected

### What this means

Live UI Editor can’t detect targets unless VS Code has a folder open.

### What to check

1. Is the Explorer showing your project files?
2. Did you open a folder (not just a single file)?

### Fix

1. Click **File** → **Open Folder…**
2. Select your project folder
3. Re-run **Live UI: Open**

---

## App won’t load / blank screen

### What to check

1. Copy the URL you are trying to load.
2. Open it in your normal browser.

### Fix

- If it doesn’t load in your browser, App Mode won’t be able to load it either. Start the dev server again.
- If it redirects (login, auth), try a direct page that renders UI after login.
- In App Mode, confirm your dev server is running and the port matches what Live UI Editor is using.

---

## I can select things, but “Apply to Code” doesn’t work (or writes to the wrong place)

### What this usually means

Element → source mapping is not stable.

### Fix (recommended)

1. In the App Mode sidebar, click **Enable Stable IDs**
2. Restart your dev server
3. Re-open App Mode and try **Apply to Code** again

If you see an **Apply Anyway** option, it means Live UI Editor isn’t fully confident the mapping is correct.

---

## Selection outline is “off” / doesn’t follow correctly when scrolling

### What to check

- Does the page have nested scroll containers (scroll areas inside scroll areas)?

### Fix

- Try selecting again after scrolling, inside the scrollable area.
- Update the extension if you’re not on the latest version.

---

## Double-click text editing doesn’t start

### Fix

1. Click once to select the element first.
2. Then double-click the text.
3. If the text is deeply nested:
	- Hold `Alt` to force a leaf/closest element selection
	- Use breadcrumbs / select parent to pick the right node

---

## Drag/resize is “fighting” responsive layout

### Fix

- In App Mode, set **Layout Apply** to **Off** (preview-only) or **Safe** (margin-based).
- Prefer **Style Target: Tailwind** or **CSS file** for heavily responsive apps.

---

## Where are logs?

1. Open VS Code’s Output panel: **View** → **Output**
2. In the dropdown on the right, select **Live UI Editor**

That channel includes mapping/apply diagnostics and errors.
