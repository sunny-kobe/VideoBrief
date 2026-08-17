import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium, type BrowserContext, type Page } from 'playwright-core';

import { assertAudienceFacingPlatformDescription } from '../src/platformCopy';
import type { PublicationTarget, ShortVideoProject } from '../src/shortVideoBrief';
import { readBrief, updateCanonicalProject } from '../src/shortVideoProjectServer';
import { normalizePublisherPlatform, type ProgrammaticPublisherPlatform } from '../src/programmaticPublisher';

const publisherHome = resolve(
  process.env.VIDEOBRIEF_SOCIAL_AUTO_UPLOAD_HOME
    || 'output/publish-pilot-20260808/tool/social-auto-upload',
);
const youtubeStudioUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function flag(name: string, fallback = '') {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  const argument = process.argv.slice(2).find((item) => item === exact || item.startsWith(prefix));
  return argument === exact ? 'true' : argument?.slice(prefix.length) ?? fallback;
}

function targetForPlatform(project: ShortVideoProject, platform: ProgrammaticPublisherPlatform) {
  const target = (project.workflow.publicationTargets ?? []).find((item) => (
    normalizePublisherPlatform(item.platform || item.id) === platform
  ));
  if (!target) throw new Error(`${project.id} 没有 ${platform} 发布目标。`);
  if (!target.externalId) throw new Error(`${project.id} 的 ${platform} 目标缺少平台稿件 ID。`);
  return target;
}

function playwrightStorageState(platform: ProgrammaticPublisherPlatform, accountName: string) {
  return resolve(publisherHome, 'cookies', `${platform}_${accountName}.json`);
}

function bilibiliStorageState(accountName: string) {
  const path = playwrightStorageState('bilibili', accountName);
  const value = JSON.parse(readFileSync(path, 'utf8')) as {
    cookie_info: {
      cookies: Array<{
        name: string;
        value: string;
        expires: number;
        http_only: number;
        secure: number;
        same_site: string;
      }>;
    };
  };
  return {
    cookies: value.cookie_info.cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: '.bilibili.com',
      path: '/',
      expires: cookie.expires,
      httpOnly: cookie.http_only === 1,
      secure: cookie.secure === 1,
      sameSite: (cookie.same_site === 'none'
        ? 'None'
        : cookie.same_site === 'strict' ? 'Strict' : 'Lax') as 'None' | 'Strict' | 'Lax',
    })),
    origins: [],
  };
}

async function fillContentEditable(page: Page, selector: string, value: string) {
  const editor = page.locator(selector).first();
  await editor.waitFor({ state: 'visible', timeout: 45_000 });
  await editor.fill(value);
  await page.waitForTimeout(300);
}

async function updateYoutube(
  project: ShortVideoProject,
  target: PublicationTarget,
  accountName: string,
) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({
    storageState: playwrightStorageState('youtube', accountName),
    userAgent: youtubeStudioUserAgent,
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(
      `https://studio.youtube.com/video/${encodeURIComponent(target.externalId)}/edit?approve_browser_access=true`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 },
    );
    const description = page.locator('#description-textarea #textbox').first();
    await description.waitFor({ state: 'visible', timeout: 45_000 });
    await fillContentEditable(page, '#description-textarea #textbox', project.platformCopy.description);
    const save = page.getByText('保存', { exact: true }).first();
    await save.click();
    await page.waitForFunction(() => {
      const button = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((element) => (element.textContent ?? '').trim() === '保存');
      return button?.hasAttribute('disabled') || button?.getAttribute('aria-disabled') === 'true';
    }, undefined, { timeout: 45_000 });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await description.waitFor({ state: 'visible', timeout: 45_000 });
    const effectiveDescription = (await description.innerText()).trim();
    if (effectiveDescription !== project.platformCopy.description.trim()) {
      throw new Error('YouTube 保存后回读的简介与 canonical 文案不一致。');
    }
    return effectiveDescription;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function updateBilibili(
  project: ShortVideoProject,
  target: PublicationTarget,
  accountName: string,
) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ storageState: bilibiliStorageState(accountName) });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(
      `https://member.bilibili.com/platform/upload/video/frame?type=edit&bvid=${encodeURIComponent(target.externalId)}`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 },
    );
    const editor = page.locator('.ql-editor').first();
    await editor.waitFor({ state: 'visible', timeout: 45_000 });
    await editor.evaluate((element, description) => {
      const quill = (element.closest('.ql-container') as HTMLElement & {
        __quill?: { setText: (value: string, source: string) => void };
      } | null)?.__quill;
      if (!quill) throw new Error('找不到 B站简介 Quill 实例。');
      quill.setText(description, 'user');
    }, project.platformCopy.description);
    const titleInput = page.locator('input[placeholder="请输入稿件标题"]').first();
    await titleInput.fill(`${project.platformCopy.title}临时`);
    await page.route('**/x/vu/web/edit**', async (route) => {
      const request = route.request();
      const postData = request.postData() ?? '';
      let rewritten: string;
      try {
        const payload = JSON.parse(postData) as Record<string, unknown>;
        payload.title = project.platformCopy.title;
        payload.desc = project.platformCopy.description;
        rewritten = JSON.stringify(payload);
      } catch {
        const payload = new URLSearchParams(postData);
        payload.set('title', project.platformCopy.title);
        payload.set('desc', project.platformCopy.description);
        rewritten = payload.toString();
      }
      await route.continue({ postData: rewritten });
    });
    const editResponsePromise = page.waitForResponse((response) => (
      response.url().includes('/x/vu/web/edit') && response.request().method() === 'POST'
    ), { timeout: 45_000 });
    await page.locator('.submit-add').click();
    const confirms = page.getByText('确认', { exact: true });
    for (let index = 0; index < await confirms.count(); index += 1) {
      const confirm = confirms.nth(index);
      if (await confirm.isVisible()) {
        await confirm.click();
        break;
      }
    }
    const editResponse = await editResponsePromise;
    const editResult = await editResponse.json() as { code?: number; message?: string };
    if (editResponse.status() >= 400 || editResult.code !== 0) {
      throw new Error(`B站编辑接口拒绝修改：HTTP ${editResponse.status()} ${editResult.message ?? ''}`.trim());
    }
    await page.waitForTimeout(3_000);
    await page.goto(
      `https://member.bilibili.com/platform/upload/video/frame?type=edit&bvid=${encodeURIComponent(target.externalId)}`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 },
    );
    await editor.waitFor({ state: 'visible', timeout: 45_000 });
    const effectiveDescription = (await editor.evaluate((element) => {
      const quill = (element.closest('.ql-container') as HTMLElement & {
        __quill?: { getText: () => string };
      } | null)?.__quill;
      return quill?.getText() ?? '';
    })).replace(/\n{3,}/g, '\n\n').trim();
    if (effectiveDescription !== project.platformCopy.description.trim()) {
      throw new Error('B站编辑接口已接受修改，但编辑页尚未返回新文案。');
    }
    return effectiveDescription;
  } finally {
    await context.close();
    await browser.close();
  }
}

function recordEffectiveCopy(
  projectId: string,
  targetId: string,
  effectiveDescription: string,
  accountName: string,
) {
  const capturedAt = new Date().toISOString();
  updateCanonicalProject(projectId, (project) => {
    const target = (project.workflow.publicationTargets ?? []).find((item) => item.id === targetId);
    if (!target) throw new Error(`找不到发布目标 ${targetId}。`);
    target.copySnapshot = {
      ...(target.copySnapshot ?? {
        title: project.platformCopy.title,
        description: project.platformCopy.description,
        hashtags: [...project.platformCopy.hashtags],
        generatedByAi: ['edge-tts', 'gemini-tts', 'macos-say'].includes(project.render.voiceEngine),
        effectiveTitle: project.platformCopy.title,
        effectiveDescription: '',
        capturedAt,
        source: project.outputs.platformCopy,
      }),
      effectiveDescription,
      capturedAt,
      source: '平台已发布作品编辑页回读',
    };
    target.lastRunAt = capturedAt;
    target.accountName ||= accountName;
    target.note = [target.note, `${capturedAt} 已通过程序化编辑页更新并回读平台说明。`]
      .filter(Boolean)
      .join('\n');
    return project;
  }, { markRenderStale: false });
  return capturedAt;
}

const projectId = flag('project');
const platform = normalizePublisherPlatform(flag('platform'));
const accountName = flag('account', 'daily-cause');
if (!projectId) throw new Error('必须指定 --project。');
if (!['bilibili', 'youtube'].includes(platform)) {
  throw new Error(`当前已发布文案编辑器尚未支持 ${platform}。`);
}

const project = readBrief(projectId);
assertAudienceFacingPlatformDescription(project.platformCopy.description);
const target = targetForPlatform(project, platform);
const effectiveDescription = platform === 'bilibili'
  ? await updateBilibili(project, target, accountName)
  : await updateYoutube(project, target, accountName);
const capturedAt = recordEffectiveCopy(project.id, target.id, effectiveDescription, accountName);
console.log(JSON.stringify({
  projectId: project.id,
  platform,
  externalId: target.externalId,
  capturedAt,
  effectiveDescription,
}, null, 2));
