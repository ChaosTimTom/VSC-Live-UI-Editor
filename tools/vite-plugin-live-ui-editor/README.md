# vite-plugin-live-ui-editor (starter)

This is a starter Vite plugin that injects a stable `data-lui` attribute into JSX/TSX elements at build time.

The extension’s App Mode injected client can use `data-lui` to derive `file/line/column` without relying on React `_debugSource`, and the extension can apply edits by matching `data-lui` in the AST.

## When do I need this?

In most cases you don’t.

The VS Code extension has a one-click **Enable Stable IDs** flow in App Mode that writes a dev-only Babel plugin and patches Vite/Next config for you.

This starter plugin exists for cases where:

- you prefer a Vite plugin approach, or
- you want to experiment with Stable IDs without using the extension’s auto-patching.

## Install (in your Vite app)

From your app repo:

- `npm i -D ./path/to/live ui editor/tools/vite-plugin-live-ui-editor`

(or copy this folder into your app and install dependencies).

## Use

In your app’s `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import liveUiEditorPlugin from 'vite-plugin-live-ui-editor';

export default defineConfig({
  plugins: [
    liveUiEditorPlugin(),
    react(),
  ],
});
```

Notes:
- Put `liveUiEditorPlugin()` before the React plugin so it runs early.
- This is intentionally minimal; you’ll likely want to gate it to dev-only.

## ID format

The plugin injects:

- `data-lui="lui:<base64url(JSON)>"`

Where JSON looks like:

- `{ f: <file>, l: <line>, c: <column>, n: <counter> }`

This matches the parsing logic in the injected App Mode client.
