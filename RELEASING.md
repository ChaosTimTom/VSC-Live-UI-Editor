# Releasing Live UI Editor (VS Code Marketplace)

This is the maintainer checklist for packaging and publishing.

## Prereqs

- You are a member of the VS Code Marketplace publisher: `TheImmersiveSaga`.
- You have a VS Code Marketplace Personal Access Token (PAT) with publishing rights.
  - Recommended: set it as an environment variable: `VSCE_PAT`.

## Release steps

1. Update version + notes
   - Bump `version` in `package.json` (use semver).
   - Add an entry to `CHANGELOG.md`.

2. Build
   - `npm install`
   - `npm --prefix webview-ui install`
   - `npm run build`

3. Package a VSIX (sanity check)
   - `npm run package:vsix`
   - Confirm it outputs a `*.vsix` and installs cleanly in VS Code.

4. Publish
   - `npm run publish:vsce -- <semver>`
     - Example: `npm run publish:vsce -- patch`
   - If `VSCE_PAT` is set, `@vscode/vsce` will pick it up automatically.

5. Verify

- Marketplace listing shows the new version.
- README renders correctly (images, links, formatting).

## Common issues

- "Missing publisher" or "Not authorized": ensure you’re signed into the right publisher and `VSCE_PAT` has permission.
- Packaging includes extra files: update `.vscodeignore`.
- Marketplace README looks wrong: set `"markdown": "github"` in `package.json` (already set).
