import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outputDir = resolve('output/playwright/cross-topic-dogfood-capture');
const planPaths = process.argv.slice(2)
  .filter((arg) => arg.startsWith('--plan='))
  .map((arg) => resolve(arg.slice('--plan='.length)));
if (!planPaths.length) throw new Error('At least one --plan=<capture-plan.json> is required.');
for (const path of planPaths) {
  if (!existsSync(path)) throw new Error(`Capture plan not found: ${path}`);
}
mkdirSync(outputDir, { recursive: true });

function secondsSince(startedAt) {
  return (Date.now() - startedAt) / 1000;
}

async function smoothScrollTo(page, locator, milliseconds = 1000) {
  await locator.waitFor({ state: 'visible', timeout: 20_000 });
  const targetY = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.max(0, window.scrollY + rect.top - 140);
  });
  const startY = await page.evaluate(() => window.scrollY);
  const steps = Math.max(1, Math.round(milliseconds / 50));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const eased = 1 - ((1 - progress) ** 3);
    await page.evaluate(({ y }) => window.scrollTo(0, y), {
      y: startY + ((targetY - startY) * eased),
    });
    await page.waitForTimeout(50);
  }
}

function locatorForStep(page, step) {
  if (step.action === 'scrollToRole') {
    return page.getByRole(step.role, {
      name: step.name,
      exact: step.exact !== false,
      ...(Number.isFinite(Number(step.level)) ? { level: Number(step.level) } : {}),
    }).first();
  }
  if (step.action === 'scrollToText') {
    return page.getByText(step.text, { exact: step.exact === true }).first();
  }
  return null;
}

async function runStep(page, step, captureStartedAt) {
  if (step.action === 'scrollTop') {
    await page.evaluate(() => window.scrollTo(0, 0));
  } else if (step.action !== 'hold') {
    const locator = locatorForStep(page, step);
    if (!locator) throw new Error(`Unsupported capture action: ${step.action}`);
    await smoothScrollTo(page, locator, Number(step.scrollMs) || 1000);
  }
  const start = secondsSince(captureStartedAt);
  await page.waitForTimeout(Number(step.holdMs) || 8000);
  return {
    label: String(step.label ?? step.name ?? step.text ?? step.action),
    start,
    end: secondsSince(captureStartedAt),
  };
}

async function recordWalkthrough(browser, plan, planPath) {
  const rawDir = resolve(outputDir, `${plan.name}-raw`);
  const assetDir = resolve('public/project-assets', plan.projectId);
  const viewport = {
    width: Number(plan.viewport?.width) || 1280,
    height: Number(plan.viewport?.height) || 720,
  };
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(assetDir, { recursive: true });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: plan.colorScheme === 'dark' ? 'dark' : 'light',
    recordVideo: { dir: rawDir, size: viewport },
  });
  const captureStartedAt = Date.now();
  const page = await context.newPage();
  await page.goto(plan.url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({
    content: 'html { scroll-behavior: auto !important; } * { animation: none !important; transition: none !important; }',
  });
  const segments = [];
  for (const step of plan.steps ?? []) {
    segments.push(await runStep(page, step, captureStartedAt));
  }
  const video = page.video();
  await context.close();
  const rawPath = await video.path();
  const stablePath = resolve(outputDir, `${plan.name}.webm`);
  renameSync(rawPath, stablePath);
  const assetPath = resolve(assetDir, basename(stablePath));
  copyFileSync(stablePath, assetPath);
  const receiptPath = resolve(outputDir, `${plan.name}.capture.json`);
  const receipt = {
    schemaVersion: 1,
    projectId: plan.projectId,
    name: plan.name,
    url: plan.url,
    viewport,
    planPath,
    stablePath,
    assetPath,
    durationEstimate: secondsSince(captureStartedAt),
    segments,
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { ...receipt, receiptPath };
}

const plans = planPaths.flatMap((path) => {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const entries = Array.isArray(value.captures) ? value.captures : [value];
  return entries.map((plan) => ({ plan, planPath: path }));
});
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const captures = [];
try {
  for (const { plan, planPath } of plans) {
    captures.push(await recordWalkthrough(browser, plan, planPath));
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ captures }, null, 2));
