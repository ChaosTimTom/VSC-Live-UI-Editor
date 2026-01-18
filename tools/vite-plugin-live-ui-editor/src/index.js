import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

function base64UrlEncode(str) {
  // Node-safe base64url
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function normalizeFileId(id) {
  return String(id || '').replace(/\\/g, '/');
}

function makeElementId({ file, line, column, n }) {
  const payload = JSON.stringify({ f: normalizeFileId(file), l: line, c: column, n });
  return `lui:${base64UrlEncode(payload)}`;
}

function hasDataLui(openingEl) {
  return openingEl.attributes.some(
    (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === 'data-lui'
  );
}

export default function liveUiEditorPlugin(options = {}) {
  const {
    include = /\.(jsx|tsx)$/i,
    exclude = /node_modules/i,
  } = options;

  return {
    name: 'live-ui-editor:data-lui',
    enforce: 'pre',
    transform(code, id) {
      if (!id || exclude.test(id) || !include.test(id)) return null;

      let ast;
      try {
        ast = parse(code, {
          sourceType: 'module',
          sourceFilename: id,
          plugins: ['jsx', 'typescript'],
        });
      } catch {
        return null;
      }

      let changed = false;
      let counter = 0;

      traverse(ast, {
        JSXOpeningElement(path) {
          const node = path.node;
          if (!node.loc) return;
          if (hasDataLui(node)) return;

          // Keep it deterministic per-file.
          counter += 1;

          const line = node.loc.start.line; // 1-based
          const column = node.loc.start.column + 1; // babel is 0-based
          const elementId = makeElementId({ file: id, line, column, n: counter });

          node.attributes.unshift(
            t.jsxAttribute(t.jsxIdentifier('data-lui'), t.stringLiteral(elementId))
          );
          changed = true;
        },
      });

      if (!changed) return null;

      const out = generate(ast, {
        retainLines: true,
        decoratorsBeforeExport: true,
      }, code);

      return {
        code: out.code,
        map: out.map || null,
      };
    },
  };
}
