# Releasing Live UI Editor (VS Code Marketplace)

This is the maintainer checklist for packaging and publishing.

## Prereqs

- You are a member of the VS Code Marketplace publisher: `TheImmersiveSaga`.
- You have a VS Code Marketplace Personal Access Token (PAT) with publishing rights.
  - Recommended: set it as an environment variable: `VSCE_PAT`.
- Node.js 24+ for development, tests, and packaging.
- GitHub Actions publishing requires the `VSCE_PAT` repository/environment secret and the `marketplace` environment. Keep credentials out of source control.

## Release steps

1. Update version + notes
   - Bump `version` in `package.json` (use semver).
   - Add an entry to `CHANGELOG.md`.

2. Install reproducibly
   - `npm ci`
   - `npm --prefix webview-ui ci`

3. Package a VSIX (sanity check)
   - `npm run package:vsix`
   - Packaging automatically runs both TypeScript checks, all tests, and both builds.
   - `npm audit --audit-level=high` and `npm --prefix webview-ui audit --audit-level=high`
   - Confirm it outputs a `*.vsix` and installs cleanly in VS Code.
   - Inspect package contents: development sources, caches, tests, and credentials must be excluded.

4. Publish
   - Publish the exact validated artifact: `npx --no-install vsce publish --packagePath vscode-live-ui-editor-<version>.vsix`
   - Alternatively, `npm run publish:vsce` validates and rebuilds before publishing.
   - If `VSCE_PAT` is set, `@vscode/vsce` will pick it up automatically.
   - For GitHub Actions, push a `v<version>` tag matching `package.json`, or run **Publish extension** manually. The workflow validates and packages before publishing.

5. Verify

- Marketplace listing shows the new version.
- README renders correctly (images, links, formatting).
- Install the published VSIX in an isolated extension directory and verify activation and contributed commands.
- Test Static HTML load/edit, App Mode connection, failed-edit retry, and redesign preview/review/apply/cancel on a disposable project.

The release workflow file is not sufficient by itself: configure its Marketplace secret before relying on unattended publishing. Global Azure DevOps PAT retirement is scheduled for December 1, 2026; plan a move to the Marketplace's documented identity-based publishing workflow before that date.

## Common issues

- "Missing publisher" or "Not authorized": ensure you’re signed into the right publisher and `VSCE_PAT` has permission.
- Packaging includes extra files: update `.vscodeignore`.
- Marketplace README looks wrong: set `"markdown": "github"` in `package.json` (already set).
