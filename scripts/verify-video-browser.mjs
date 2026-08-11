import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { parseCliArgs } from './lib/cli-args.mjs';
import {
  validateBrowserChecks,
  validateSemanticAcceptanceRecord,
} from './lib/acceptance-validation.mjs';

const browserProcessStartedAt = new Date();

const { args } = parseCliArgs(process.argv.slice(2));

const manifestPath = resolve(
  args.get('manifest') ?? 'output/videos/codex-app-explainer-work/render-manifest.json',
);
if (!existsSync(manifestPath)) throw new Error(`Render manifest not found: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.proof?.passed) throw new Error('Technical proof must pass before browser acceptance.');
const semanticValidation = validateSemanticAcceptanceRecord(manifest.acceptance?.semantic);
if (!semanticValidation.passed) {
  throw new Error(`Measured semantic review must pass before browser acceptance:\n- ${semanticValidation.issues.join('\n- ')}`);
}
const videoPath = resolve(manifest.artifacts?.publicRender ?? manifest.artifacts?.outputVideo ?? '');
const videoSha256 = createHash('sha256').update(readFileSync(videoPath)).digest('hex');
if (manifest.acceptance.videoSha256 !== videoSha256) {
  throw new Error('Rendered video bytes changed after semantic review.');
}

const baseUrl = String(args.get('base-url') ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const renditionQuery = manifest.rendition?.id
  ? `&rendition=${encodeURIComponent(manifest.rendition.id)}`
  : '';
const url = `${baseUrl}/short-video?project=${encodeURIComponent(manifest.projectId)}&acceptance=1${renditionQuery}`;
const chromePath = String(
  args.get('chrome') ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
);
if (!existsSync(chromePath)) throw new Error(`Google Chrome not found: ${chromePath}`);
const screenshotBase = resolve(
  args.get('screenshot')
    ?? `output/playwright/${manifest.projectId}-${manifest.rendition?.id ?? 'primary'}-browser-acceptance.png`,
);
mkdirSync(dirname(screenshotBase), { recursive: true });

const issues = [];
const checks = [];
let browserName = 'Google Chrome';
let browser;

function screenshotPath(name) {
  return screenshotBase.endsWith('.png')
    ? screenshotBase.replace(/\.png$/, `-${name}.png`)
    : `${screenshotBase}-${name}.png`;
}

async function runViewportCheck({ name, viewport, fullPlayback, playbackRate }) {
  const consoleErrors = [];
  const screenshot = screenshotPath(name);
  let page;
  let playback = {
    readyState: null,
    duration: null,
    playedSeconds: null,
    ended: false,
    muted: false,
    volume: 0.05,
    mediaError: '',
  };
  try {
    page = await browser.newPage({ viewport });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const video = page.locator('video');
    await video.waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForFunction(() => {
      const element = document.querySelector('video');
      return element instanceof HTMLVideoElement
        && element.readyState >= 3
        && Number.isFinite(element.duration);
    }, null, { timeout: 30_000 });
    const maxWaitMs = Math.ceil(Number(manifest.render.duration) * 1000 / playbackRate) + 15_000;
    await page.evaluate(({ rate }) => {
      const element = document.querySelector('video');
      if (!(element instanceof HTMLVideoElement)) throw new Error('Video element is missing.');
      element.loop = false;
      element.muted = false;
      element.volume = 0.05;
      element.playbackRate = rate;
      element.currentTime = 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'videobrief-acceptance-play';
      button.textContent = 'Play acceptance video';
      button.style.position = 'fixed';
      button.style.left = '8px';
      button.style.bottom = '8px';
      button.style.zIndex = '2147483647';
      button.addEventListener('click', () => {
        element.play().catch((error) => {
          button.dataset.playError = error instanceof Error ? error.message : String(error);
        });
      }, { once: true });
      document.body.append(button);
    }, { rate: playbackRate });
    const playButton = page.locator('#videobrief-acceptance-play');
    await playButton.click();
    await page.waitForFunction(() => {
      const element = document.querySelector('video');
      const button = document.querySelector('#videobrief-acceptance-play');
      return element instanceof HTMLVideoElement
        && (element.currentTime >= 0.25 || element.ended || button?.getAttribute('data-play-error'));
    }, null, { timeout: 10_000 });
    if (fullPlayback) {
      await page.waitForFunction(() => {
        const element = document.querySelector('video');
        return element instanceof HTMLVideoElement && element.ended;
      }, null, { timeout: maxWaitMs });
    } else {
      await page.waitForTimeout(1_200);
      await video.evaluate((element) => element.pause());
    }
    playback = await page.evaluate(() => {
      const element = document.querySelector('video');
      const button = document.querySelector('#videobrief-acceptance-play');
      if (!(element instanceof HTMLVideoElement)) throw new Error('Video element is missing.');
      const playError = button?.getAttribute('data-play-error') ?? '';
      button?.remove();
      return {
        readyState: element.readyState,
        duration: element.duration,
        playedSeconds: element.ended ? element.duration : element.currentTime,
        ended: element.ended,
        muted: element.muted,
        volume: element.volume,
        mediaError: playError || element.error?.message || '',
      };
    });
    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (error) {
    playback.mediaError = error instanceof Error ? error.message : String(error);
  } finally {
    await page?.close();
  }
  return {
    name,
    viewport,
    ...playback,
    fullPlayback,
    playbackRate,
    consoleErrors,
    screenshot: existsSync(screenshot) ? screenshot : '',
  };
}

try {
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: args.has('headed') ? false : true,
  });
  browserName = `Google Chrome ${browser.version()}`;
  checks.push(...await Promise.all([
    runViewportCheck({
      name: 'desktop',
      viewport: { width: 1440, height: 900 },
      fullPlayback: true,
      playbackRate: 1,
    }),
    runViewportCheck({
      name: 'mobile',
      viewport: { width: 390, height: 844 },
      fullPlayback: true,
      playbackRate: 1,
    }),
  ]));
} catch (error) {
  issues.push(error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
}

issues.push(...validateBrowserChecks(checks, Number(manifest.render.duration)).issues);
const primary = checks.find((check) => check.fullPlayback) ?? checks[0] ?? {
  viewport: null,
  readyState: null,
  duration: null,
  playedSeconds: null,
  ended: false,
  consoleErrors: [],
  mediaError: '',
  screenshot: '',
};
const consoleErrors = checks.flatMap((check) => check.consoleErrors);

const latest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const latestVideoSha256 = createHash('sha256').update(readFileSync(videoPath)).digest('hex');
if (
  latest.projectFingerprint !== manifest.projectFingerprint
  || latest.renderedAt !== manifest.renderedAt
  || latestVideoSha256 !== videoSha256
) {
  throw new Error('Render changed during browser acceptance; result was not recorded.');
}
const next = {
  ...latest,
  acceptance: {
    ...latest.acceptance,
    videoSha256,
    browser: {
      status: issues.length === 0 ? 'passed' : 'failed',
      checkedAt: new Date().toISOString(),
      processStartedAt: browserProcessStartedAt.toISOString(),
      processWallMs: Date.now() - browserProcessStartedAt.getTime(),
      url,
      browser: browserName,
      viewport: primary.viewport,
      readyState: primary.readyState,
      duration: primary.duration,
      playedSeconds: primary.playedSeconds,
      ended: primary.ended,
      consoleErrors,
      mediaError: primary.mediaError,
      screenshot: primary.screenshot,
      checks,
      issues,
    },
  },
};
const temporaryPath = `${manifestPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`);
renameSync(temporaryPath, manifestPath);

console.log(JSON.stringify({
  projectId: manifest.projectId,
  browser: next.acceptance.browser,
}, null, 2));
if (issues.length > 0) process.exit(1);
