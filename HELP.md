# Live UI Editor — Help

## Getting Started (App Mode)

1. Open your app folder (React/Vite/Next.js).
2. Start your app dev server (so it’s reachable in a browser).
3. In VS Code, run **Live UI: Open (App Mode)**.
4. Click elements in the preview to select them.
5. Make edits, then **Apply to Code**.

## UI Wizard (Chat)

UI Wizard is a VS Code Chat participant (`@ui-wizard`) that can edit the currently selected element.

1. In App Mode, stay in **Edit** mode and click an element.
2. Open VS Code Chat (View → Chat).
3. Try:

- `@ui-wizard commands`
- `@ui-wizard width 240`
- `@ui-wizard move right 20`

### Targeting (Stable IDs)
- If **Identity: Stable**, edits are safest.
- If not stable, click **Enable Stable IDs** and follow the prompt.

### Style Target
- **Auto**: picks the best strategy.
- **Tailwind**: edits `className` tokens where possible.
- **CSS file**: writes/updates classes in a CSS file.
- **Inline**: writes inline styles.

### Layout mode
- **Off**: preview-only drag/resize.
- **Safe**: drag persists as margin adjustments (more responsive-friendly).
- **Full**: drag/resize writes `width`/`height`/`transform`.

### Backend helper
- If your app needs a separate API/auth server, use **Start Backend**.

## Troubleshooting

### App Mode opens but is blank
- In the Extension Development Host window:
  - Run **Developer: Toggle Developer Tools** → Console.
  - Look for CSP or script loading errors.

### The preview iframe is blank / won’t load
- Ensure your dev server is running and reachable in a browser.
- If you’re using a non-local URL, confirm you accepted the safety prompt.

### Click-to-select doesn’t work
- Try switching modes (**Switch to Edit/Browse**) and click again.
- Confirm the preview is actually your app (not an error page).

### “Identity: Unmapped / Fallback” and apply is blocked
- Click **Enable Stable IDs**.
- If needed, click **Fix targeting**.

### Changes don’t apply to code
- Check **Style Target** and use **Pick CSS** if in CSS file mode.
- Confirm the edited files are inside the workspace/app root.

## Support / Feedback

- Discord: https://discord.gg/QHnHhCjWDQ
