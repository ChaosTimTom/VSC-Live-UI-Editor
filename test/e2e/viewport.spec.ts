import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__messages = [];
    (window as any).acquireVsCodeApi = () => ({
      getState: () => ({}), setState() {},
      postMessage(message: any) {
        (window as any).__messages.push(message);
        if (message.command === 'loadWorkspaceConfig') {
          setTimeout(() => window.postMessage({ command: 'workspaceConfig', config: { responsiveWidth: 1024 } }, '*'), 0);
          setTimeout(() => window.postMessage({ command: 'quickStartInfo', info: {
            hasWorkspace: true, recommendedMode: 'html',
            report: { apps: [], previewTargets: [], htmlCandidates: Array.from({ length: 12 }, (_, i) => ({
              fileId: `releases/SoundBoard-1.0.0-beta.${i + 10}-Windows-desktop/resources/app/gui/index.html`,
              label: `releases/SoundBoard-1.0.0-beta.${i + 10}-Windows-desktop/resources/app/gui/index.html`,
            })) },
          } }, '*'), 0);
        }
      },
    });
  });
});

test('welcome fills a narrow editor despite a saved Laptop preset', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 700 });
  await page.goto('/');
  const welcome = page.locator('[data-live-ui-welcome]');
  await expect(welcome).toBeVisible();
  const bounds = await welcome.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(640);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeInViewport();
});

test('a wide page fits the editor and its CSS cannot resize or hide the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/');
  await page.evaluate(() => window.postMessage({ command: 'setDocument', file: 'wide.html', html:
    '<!doctype html><html><head><style>:root{--page-color:rgb(255, 0, 0)} body{margin:0;min-width:1800px;overflow:hidden} button{display:none} #wide{width:1800px;height:1300px;background:var(--page-color)}</style></head><body><div id="wide" data-source-file="wide.html" data-source-line="1">Wide page</div></body></html>' }, '*'));
  const wide = page.locator('#wide');
  await expect(wide).toBeVisible();
  await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
  await expect(wide).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  await expect.poll(async () => (await wide.boundingBox())!.width).toBeLessThanOrEqual(801);
  const viewport = page.locator('[data-live-ui-viewport]');
  expect(await viewport.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.setViewportSize({ width: 500, height: 700 });
  await expect.poll(async () => (await wide.boundingBox())!.width).toBeLessThanOrEqual(501);
  await page.screenshot({ path: '.cache/viewport-fit.png' });
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await page.evaluate(() => window.postMessage({ command: 'setDocument', file: 'narrow.html', html: '<div id="narrow">Normal responsive page</div>' }, '*'));
  await expect.poll(() => page.locator('[data-live-ui-paper]').evaluate(el => Number(getComputedStyle(el).zoom))).toBe(1);
});

test('100% preview can scroll both axes and zoomed elements still select and move accurately', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/');
  await page.evaluate(() => window.postMessage({ command: 'setDocument', file: 'wide.html', html:
    '<style>body{margin:0}.target{width:1600px;height:1400px;background:#223344} #box{width:200px;height:100px;background:#abcdef}</style><div class="target"><div id="box" data-source-file="wide.html" data-source-line="1">Drag me</div></div>' }, '*'));
  await page.getByLabel('Preview zoom').selectOption('1');
  const viewport = page.locator('[data-live-ui-viewport]');
  expect(await viewport.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await viewport.evaluate(el => { el.scrollLeft = 700; el.scrollTop = 300; });
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await viewport.evaluate(el => { el.scrollLeft = 0; el.scrollTop = 0; });
  await page.getByLabel('Preview zoom').selectOption('0.5');
  await page.getByRole('button', { name: 'Selection mode: element', exact: true }).click();
  const box = page.locator('#box');
  await box.click();
  await expect.poll(() => page.evaluate(() => (window as any).__messages.some((m: any) => m.command === 'elementSelected'))).toBe(true);
  await page.keyboard.press('ArrowRight');
  await expect(box).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 1, 0)');
  const grip = page.getByTitle('Drag', { exact: true });
  const drag = (await grip.boundingBox())!;
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(drag.x + drag.width / 2 + 40, drag.y + drag.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect(box).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 81, 40)');
  const handle = page.locator('[data-live-ui-resize="se"]');
  const corner = (await handle.boundingBox())!;
  await page.mouse.move(corner.x + 5, corner.y + 5);
  await page.mouse.down();
  await page.mouse.move(corner.x + 25, corner.y + 15, { steps: 5 });
  await page.mouse.up();
  await expect(box).toHaveCSS('width', '240px');
  await expect(box).toHaveCSS('height', '120px');
});

test('Space-drag pans a large page without changing its source geometry', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto('/');
  await page.evaluate(() => window.postMessage({ command: 'setDocument', file: 'wide.html', html:
    '<style>body{margin:0} #wide{width:1800px;height:2000px;background:#234}</style><div id="wide" data-source-file="wide.html" data-source-line="1">Pan me</div>' }, '*'));
  await page.getByLabel('Preview zoom').selectOption('1');
  const viewport = page.locator('[data-live-ui-viewport]');
  const bounds = (await viewport.boundingBox())!;
  await page.mouse.move(bounds.x + 300, bounds.y + 120);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(bounds.x + 150, bounds.y + 60, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  expect(await viewport.evaluate(el => el.scrollTop)).toBeGreaterThan(30);
  await expect(page.locator('#wide')).toHaveCSS('transform', 'none');
});
