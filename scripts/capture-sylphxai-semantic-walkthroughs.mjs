import { copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const outputDir = resolve('output/playwright/sylphxai-semantic-capture');
const assetDir = resolve('public/project-assets/2026-07-19-sylphxai-pdf-reader-mcp');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

mkdirSync(outputDir, { recursive: true });
mkdirSync(assetDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

const wait = (page, milliseconds) => page.waitForTimeout(milliseconds);

async function smoothScrollTo(page, locator, milliseconds = 1200) {
  await locator.waitFor({ state: 'visible' });
  const targetY = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, window.scrollY + rect.top - 150);
  });
  const startY = await page.evaluate(() => window.scrollY);
  const steps = Math.max(1, Math.round(milliseconds / 50));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const eased = 1 - ((1 - progress) ** 3);
    await page.evaluate(
      ({ y }) => window.scrollTo(0, y),
      { y: startY + ((targetY - startY) * eased) },
    );
    await wait(page, 50);
  }
}

async function recordWalkthrough({ name, url, run }) {
  const rawDir = resolve(outputDir, `${name}-raw`);
  mkdirSync(rawDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    recordVideo: {
      dir: rawDir,
      size: { width: 1280, height: 720 },
    },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({
    content: 'html { scroll-behavior: auto !important; } * { animation: none !important; }',
  });
  await run(page);
  const video = page.video();
  await context.close();
  const rawPath = await video.path();
  const stableWebm = resolve(outputDir, `${name}.webm`);
  renameSync(rawPath, stableWebm);
  const assetWebm = resolve(assetDir, basename(stableWebm));
  copyFileSync(stableWebm, assetWebm);
  return { stableWebm, assetWebm };
}

const captures = [];

captures.push(await recordWalkthrough({
  name: 'sylphxai-official-repo-semantic-walkthrough',
  url: 'https://github.com/SylphxAI/pdf-reader-mcp',
  run: async (page) => {
    await wait(page, 2_000);
    await smoothScrollTo(page, page.getByRole('heading', { name: 'The problem' }).first());
    await wait(page, 8_500);
    await smoothScrollTo(page, page.getByText('Search, then verify the source region:', { exact: true }).first());
    await wait(page, 8_500);
    await smoothScrollTo(page, page.getByRole('heading', { name: 'Quick Start' }).first());
    await wait(page, 10_000);
  },
}));

captures.push(await recordWalkthrough({
  name: 'sylphxai-official-docs-semantic-walkthrough',
  url: 'https://sylphxai.github.io/pdf-reader-mcp/',
  run: async (page) => {
    await wait(page, 9_000);
    await smoothScrollTo(page, page.getByRole('heading', { name: 'Agent Document Twin' }).first());
    await wait(page, 8_500);
    await smoothScrollTo(page, page.getByRole('heading', { name: 'Scanned PDF OCR Path' }).first());
    await wait(page, 8_500);
    await smoothScrollTo(page, page.getByRole('heading', { name: 'Trust Report' }).first());
    await wait(page, 7_000);
    await smoothScrollTo(page, page.getByRole('heading', { name: 'Benchmark-Gated Releases' }).first());
    await wait(page, 8_000);
  },
}));

await browser.close();
console.log(JSON.stringify({ captures }, null, 2));
