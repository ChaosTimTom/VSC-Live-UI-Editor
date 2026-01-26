# Static HTML Mode (Beginner-friendly)

Static HTML Mode is the simplest workflow.

You choose one `.html` file, Live UI Editor shows it in a preview, and your edits are written back into that same `.html` file.

## Use Static HTML Mode when…

- You have a plain HTML page (landing page, prototype, email-like layout, etc.)
- You do *not* want to run a dev server
- You want changes written directly into the HTML file

## Step 1 — Open Static HTML Mode

1. Open the Command Palette: `Ctrl+Shift+P`
2. Run: **Live UI: Open**
3. Choose: **Static HTML / No dev server**
4. Choose one option:
   - **Start (pick an HTML file)** (recommended)
   - **Use current file** (if you already opened an HTML file tab)
   - **Try a sample** (if you don’t have HTML yet)

### What you should see

- A preview panel opens showing your HTML page.

## Step 2 — Click to select elements

1. Click an element in the preview.
2. Look for a selection outline and/or breadcrumbs.

Live UI Editor uses hit-testing so you can still click elements even with the overlay enabled.

### Selection helpers (when clicks feel “hard”)

- **Group vs Element** selection modes
- **Select parent** (move your selection up the DOM)
- **Breadcrumbs** (lets you pick exactly which container you meant)

### Modifier keys

- Hold `Shift` to prefer a larger/group selection
- Hold `Alt` to prefer the closest/leaf element

## Step 3 — Edit text

1. Double-click text in the preview
2. Type your new text
3. Press `Enter` to commit

Text editing keys:

- `Shift+Enter`: newline
- `Escape`: cancel

### What you should see

- The preview updates.
- Your `.html` file changes in VS Code.

## Step 4 — Move and resize (layout edits)

1. Drag the selection outline to move.
2. Drag handles to resize.

Keyboard nudging:

- Arrow keys: move by 1px
- `Shift` + arrow keys: move by 10px

### How layout edits are written

Static HTML Mode writes layout edits directly into the HTML file (usually as style updates).

## Common problems

### “Nothing happens when I edit”

- Make sure you selected an element (look for an outline/breadcrumbs)
- Try selecting a parent container (some text is nested)

### “I can’t select the thing I want”

- Hold `Alt` for the smallest/closest element
- Hold `Shift` for a larger/group selection
- Use breadcrumbs to pick the exact element
