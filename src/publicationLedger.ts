import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { chromium, type Page } from 'playwright-core';

import type {
  PublicationMetricSnapshot,
  PublicationTarget,
  ShortVideoProject,
} from './shortVideoBrief';
import { readBrief, updateCanonicalProject } from './shortVideoProjectServer';
import { normalizePublisherPlatform, type ProgrammaticPublisherPlatform } from './programmaticPublisher';

export interface CollectedPublicationMetric {
  platform: ProgrammaticPublisherPlatform;
  externalId: string;
  effectiveTitle: string;
  effectiveDescription: string;
  snapshot: PublicationMetricSnapshot;
}

export interface PublicationLedgerEntry {
  projectId: string;
  projectTitle: string;
  platform: string;
  targetId: string;
  status: PublicationTarget['status'];
  externalId: string;
  publishedUrl: string;
  publishedAt: string;
  submittedAt: string;
  copySnapshot: PublicationTarget['copySnapshot'];
  latestMetrics: PublicationMetricSnapshot | null;
}

export interface PublicationLedger {
  schemaVersion: 1;
  generatedAt: string;
  entries: PublicationLedgerEntry[];
}

const defaultPublisherHome = resolve('output/publish-pilot-20260808/tool/social-auto-upload');
const defaultLedgerJsonPath = resolve('output/publication-ledger.json');
const defaultLedgerMarkdownPath = resolve('output/publication-ledger.md');
const youtubeStudioUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metricSnapshot(
  source: string,
  observedAt: string,
  values: Partial<PublicationMetricSnapshot>,
): PublicationMetricSnapshot {
  return {
    observedAt,
    source,
    viewCount: null,
    likeCount: null,
    commentCount: null,
    shareCount: null,
    favoriteCount: null,
    coinCount: null,
    danmakuCount: null,
    followerGain: null,
    completionRate: null,
    averageWatchSeconds: null,
    twoSecondBounceRate: null,
    note: '',
    ...values,
  };
}

function targetExternalId(target: PublicationTarget, platform: ProgrammaticPublisherPlatform) {
  if (target.externalId) return target.externalId;
  if (platform === 'bilibili') return target.publishedUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] ?? '';
  if (platform === 'youtube') return target.publishedUrl.match(/(?:youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]+)/)?.[1] ?? '';
  return '';
}

function publisherHome() {
  return resolve(process.env.VIDEOBRIEF_SOCIAL_AUTO_UPLOAD_HOME || defaultPublisherHome);
}

function storageStatePath(platform: ProgrammaticPublisherPlatform, accountName: string) {
  return resolve(publisherHome(), 'cookies', `${platform}_${accountName}.json`);
}

function ensureStorageState(platform: ProgrammaticPublisherPlatform, accountName: string) {
  const path = storageStatePath(platform, accountName);
  if (!existsSync(path)) throw new Error(`${platform} 登录态文件不存在，请先运行 project:publish login。`);
  return path;
}

async function browserContext(
  platform: ProgrammaticPublisherPlatform,
  accountName: string,
  headless: boolean,
  userAgent?: string,
) {
  const browser = await chromium.launch({ channel: 'chrome', headless });
  const context = await browser.newContext({
    storageState: ensureStorageState(platform, accountName),
    ...(userAgent ? { userAgent } : {}),
  });
  return { browser, context };
}

async function gotoWithRetry(page: Page, url: string, attempts = 3) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await page.waitForTimeout(attempt * 1_000);
    }
  }
  throw lastError;
}

async function collectBilibili(
  targets: Array<{ externalId: string }>,
  observedAt: string,
) {
  const results: CollectedPublicationMetric[] = [];
  for (const target of targets) {
    if (!target.externalId) continue;
    const source = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(target.externalId)}`;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`B站数据接口返回 HTTP ${response.status}。`);
    const payload = await response.json() as {
      code?: number;
      data?: { title?: string; desc?: string; stat?: Record<string, unknown> };
    };
    if (payload.code !== 0 || !payload.data?.stat) throw new Error(`B站找不到稿件 ${target.externalId}。`);
    const stat = payload.data.stat;
    results.push({
      platform: 'bilibili',
      externalId: target.externalId,
      effectiveTitle: payload.data.title ?? '',
      effectiveDescription: payload.data.desc ?? '',
      snapshot: metricSnapshot(source, observedAt, {
        viewCount: optionalNumber(stat.view),
        likeCount: optionalNumber(stat.like),
        commentCount: optionalNumber(stat.reply),
        shareCount: optionalNumber(stat.share),
        favoriteCount: optionalNumber(stat.favorite),
        coinCount: optionalNumber(stat.coin),
        danmakuCount: optionalNumber(stat.danmaku),
      }),
    });
  }
  return results;
}

export function parseDouyinWorkList(payload: unknown, observedAt: string): CollectedPublicationMetric[] {
  const list = (payload as { aweme_list?: Array<Record<string, unknown>> })?.aweme_list;
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    const statistics = item.statistics as Record<string, unknown> | undefined;
    const externalId = String(item.item_id ?? item.group_id ?? '');
    return {
      platform: 'douyin' as const,
      externalId,
      effectiveTitle: String(item.item_title ?? ''),
      effectiveDescription: String(item.desc ?? ''),
      snapshot: metricSnapshot('抖音创作者中心作品列表', observedAt, {
        viewCount: optionalNumber(statistics?.play_count),
        likeCount: optionalNumber(statistics?.digg_count),
        commentCount: optionalNumber(statistics?.comment_count),
        shareCount: optionalNumber(statistics?.share_count ?? statistics?.forward_count),
        favoriteCount: optionalNumber(statistics?.collect_count),
      }),
    };
  }).filter((item) => item.externalId);
}

async function collectDouyin(accountName: string, observedAt: string) {
  const { browser, context } = await browserContext('douyin', accountName, false);
  try {
    const page = await context.newPage();
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/work_list') && response.url().includes('count=12'),
      { timeout: 45_000 },
    );
    await page.goto('https://creator.douyin.com/creator-micro/content/manage', {
      waitUntil: 'domcontentloaded', timeout: 90_000,
    });
    const response = await responsePromise;
    return parseDouyinWorkList(await response.json(), observedAt);
  } finally {
    await browser.close();
  }
}

export function parseXiaohongshuNotes(payload: unknown, observedAt: string): CollectedPublicationMetric[] {
  const notes = (payload as { data?: { notes?: Array<Record<string, unknown>> } })?.data?.notes;
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => ({
    platform: 'xiaohongshu' as const,
    externalId: String(note.id ?? ''),
    effectiveTitle: String(note.display_title ?? ''),
    effectiveDescription: String(note.display_title ?? ''),
    snapshot: metricSnapshot('小红书创作服务平台笔记管理', observedAt, {
      viewCount: optionalNumber(note.view_count),
      likeCount: optionalNumber(note.likes),
      commentCount: optionalNumber(note.comments_count),
      shareCount: optionalNumber(note.shared_count),
      favoriteCount: optionalNumber(note.collected_count),
    }),
  })).filter((item) => item.externalId);
}

async function collectXiaohongshu(accountName: string, observedAt: string) {
  const { browser, context } = await browserContext('xiaohongshu', accountName, true);
  try {
    const page = await context.newPage();
    await page.goto('https://creator.xiaohongshu.com/new/home', {
      waitUntil: 'domcontentloaded', timeout: 90_000,
    });
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/creator/note/user/posted'),
      { timeout: 45_000 },
    );
    await page.getByText('笔记管理', { exact: true }).first().click();
    return parseXiaohongshuNotes(await (await responsePromise).json(), observedAt);
  } finally {
    await browser.close();
  }
}

export function parseTencentPostList(payload: unknown, observedAt: string): CollectedPublicationMetric[] {
  const list = (payload as { data?: { list?: Array<Record<string, unknown>> } })?.data?.list;
  if (!Array.isArray(list)) return [];
  return list.map((post) => {
    const description = post.desc as {
      description?: string;
      shortTitle?: Array<{ shortTitle?: string }>;
    } | undefined;
    const effectiveDescription = description?.description ?? '';
    return {
      platform: 'tencent' as const,
      externalId: String(post.exportId ?? post.objectId ?? ''),
      effectiveTitle: effectiveDescription.split('\n')[0]?.trim()
        || description?.shortTitle?.[0]?.shortTitle
        || '',
      effectiveDescription,
      snapshot: metricSnapshot('视频号助手内容管理接口', observedAt, {
        viewCount: optionalNumber(post.readCount),
        likeCount: optionalNumber(post.likeCount),
        commentCount: optionalNumber(post.commentCount),
        shareCount: optionalNumber(post.forwardCount),
        favoriteCount: optionalNumber(post.favCount),
        followerGain: optionalNumber(post.followCount),
        completionRate: optionalNumber(post.fullPlayRate) === null
          ? null
          : Number(post.fullPlayRate) * 100,
        averageWatchSeconds: optionalNumber(post.avgPlayTimeSec),
        twoSecondBounceRate: optionalNumber(post.fastFlipRate) === null
          ? null
          : Number(post.fastFlipRate) * 100,
        note: Number(post.status) === 1
          ? '视频号后台 status=1，作品已发表；平台未提供稳定匿名 Web 公开 URL。'
          : `视频号后台 status=${String(post.status ?? 'unknown')}。`,
      }),
    };
  }).filter((item) => item.externalId);
}

async function collectTencent(accountName: string, observedAt: string) {
  const { browser, context } = await browserContext('tencent', accountName, true);
  try {
    const page = await context.newPage();
    await page.goto('https://channels.weixin.qq.com/platform', {
      waitUntil: 'domcontentloaded', timeout: 90_000,
    });
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/post/post_list'),
      { timeout: 45_000 },
    );
    await page.getByText('内容管理', { exact: true }).first().click();
    return parseTencentPostList(await (await responsePromise).json(), observedAt);
  } finally {
    await browser.close();
  }
}

export function parseYoutubeStudioRows(
  rows: Array<{ text: string; links: Array<{ href: string; text: string }> }>,
  observedAt: string,
): CollectedPublicationMetric[] {
  return rows.flatMap((row) => {
    const editLink = row.links.find((link) => /\/video\/[^/]+\/edit/.test(link.href));
    const externalId = editLink?.href.match(/\/video\/([^/]+)\/edit/)?.[1] ?? '';
    if (!externalId) return [];
    const lines = row.text.split('\n').map((line) => line.trim()).filter(Boolean);
    const numericTail = lines.slice(-2).map((value) => Number(value.replace(/,/g, '')));
    const titleLink = row.links.find((link) => (
      link.href.includes(`/video/${externalId}/edit`)
      && link.text
      && !/^\d+:\d+(?::\d+)?$/.test(link.text)
    ));
    return [{
      platform: 'youtube' as const,
      externalId,
      effectiveTitle: titleLink?.text ?? '',
      effectiveDescription: '',
      snapshot: metricSnapshot('YouTube Studio 内容列表', observedAt, {
        viewCount: Number.isFinite(numericTail[0]) ? numericTail[0] : null,
        likeCount: null,
        commentCount: Number.isFinite(numericTail[1]) ? numericTail[1] : null,
        note: 'YouTube Studio 内容列表不提供点赞数；null 表示本次未取得，不代表 0。',
      }),
    }];
  });
}

async function collectYoutube(accountName: string, observedAt: string) {
  const { browser, context } = await browserContext(
    'youtube', accountName, true, youtubeStudioUserAgent,
  );
  try {
    const page = await context.newPage();
    await gotoWithRetry(page, 'https://studio.youtube.com');
    await page.waitForURL(/studio\.youtube\.com\/channel\/[^/?]+(?:[/?]|$)/, { timeout: 45_000 });
    const channelId = page.url().match(/\/channel\/([^/?]+)/)?.[1];
    if (!channelId) throw new Error('YouTube Studio 未返回频道 ID。');
    await gotoWithRetry(page, `https://studio.youtube.com/channel/${channelId}/videos/upload`);
    await page.locator('ytcp-video-row').first().waitFor({ state: 'attached', timeout: 45_000 });
    const rows = await page.locator('ytcp-video-row').evaluateAll((elements) => elements.map((element) => ({
      text: (element as HTMLElement).innerText,
      links: Array.from(element.querySelectorAll('a')).map((anchor) => ({
        href: (anchor as HTMLAnchorElement).href,
        text: (anchor.textContent ?? '').trim(),
      })),
    })));
    return parseYoutubeStudioRows(rows, observedAt);
  } finally {
    await browser.close();
  }
}

async function collectYoutubePublic(
  targets: Array<{ externalId: string }>,
  observedAt: string,
) {
  const results: CollectedPublicationMetric[] = [];
  for (const target of targets) {
    if (!target.externalId) continue;
    const source = `https://www.youtube.com/watch?v=${encodeURIComponent(target.externalId)}`;
    const [watchResponse, oembedResponse] = await Promise.all([
      fetch(source),
      fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(source)}&format=json`),
    ]);
    if (!watchResponse.ok || !oembedResponse.ok) {
      throw new Error(`YouTube 公开视频 ${target.externalId} 当前不可访问。`);
    }
    const html = await watchResponse.text();
    const metadata = await oembedResponse.json() as { title?: string };
    const viewCount = html.match(/"viewCount":"(\d+)"/)?.[1];
    results.push({
      platform: 'youtube',
      externalId: target.externalId,
      effectiveTitle: metadata.title ?? '',
      effectiveDescription: '',
      snapshot: metricSnapshot('YouTube 公开视频页（Studio 降级）', observedAt, {
        viewCount: viewCount === undefined ? null : Number(viewCount),
        likeCount: null,
        commentCount: null,
        note: 'YouTube Studio 本轮不可达；公开视频已确认，点赞和评论未取得。',
      }),
    });
  }
  return results;
}

function targetsForProjects(projects: ShortVideoProject[]) {
  return projects.flatMap((project) => (project.workflow.publicationTargets ?? []).map((target) => {
    const platform = normalizePublisherPlatform(target.platform || target.id);
    return { project, target, platform, externalId: targetExternalId(target, platform) };
  })).filter((item) => ['published', 'submitted'].includes(item.target.status));
}

function applyCollectedMetrics(projectId: string, results: CollectedPublicationMetric[], observedAt: string) {
  return updateCanonicalProject(projectId, (project) => {
    for (const target of project.workflow.publicationTargets ?? []) {
      const platform = normalizePublisherPlatform(target.platform || target.id);
      const externalId = targetExternalId(target, platform);
      const result = results.find((item) => item.platform === platform && item.externalId === externalId);
      if (!result) continue;
      target.externalId ||= externalId;
      const copy = target.copySnapshot ?? {
        title: project.platformCopy.title,
        description: project.platformCopy.description,
        hashtags: [...project.platformCopy.hashtags],
        generatedByAi: ['edge-tts', 'gemini-tts', 'macos-say'].includes(project.render.voiceEngine),
        effectiveTitle: '',
        effectiveDescription: '',
        capturedAt: target.submittedAt || target.publishedAt || observedAt,
        source: project.outputs.platformCopy,
      };
      target.copySnapshot = {
        ...copy,
        effectiveTitle: result.effectiveTitle || copy.effectiveTitle,
        effectiveDescription: result.effectiveDescription || copy.effectiveDescription,
      };
      target.metricSnapshots.push(result.snapshot);
    }
    return project;
  }, { markRenderStale: false });
}

export async function collectPublicationMetrics(
  projectIds: string[],
  options: { accountName?: string; observedAt?: string } = {},
) {
  const projects = projectIds.map(readBrief);
  const targets = targetsForProjects(projects);
  const accountName = options.accountName ?? 'daily-cause';
  const observedAt = options.observedAt ?? new Date().toISOString();
  const platforms = new Set(targets.map((item) => item.platform));
  const results: CollectedPublicationMetric[] = [];
  const failures: Array<{ platform: ProgrammaticPublisherPlatform; error: string }> = [];
  const collect = async (
    platform: ProgrammaticPublisherPlatform,
    operation: () => Promise<CollectedPublicationMetric[]>,
  ) => {
    try {
      results.push(...await operation());
    } catch (error) {
      failures.push({ platform, error: error instanceof Error ? error.message : String(error) });
    }
  };

  if (platforms.has('bilibili')) {
    await collect('bilibili', () => collectBilibili(
      targets.filter((item) => item.platform === 'bilibili').map((item) => ({ externalId: item.externalId })),
      observedAt,
    ));
  }
  if (platforms.has('douyin')) await collect('douyin', () => collectDouyin(accountName, observedAt));
  if (platforms.has('xiaohongshu')) {
    await collect('xiaohongshu', () => collectXiaohongshu(accountName, observedAt));
  }
  if (platforms.has('tencent')) await collect('tencent', () => collectTencent(accountName, observedAt));
  if (platforms.has('youtube')) {
    await collect('youtube', async () => {
      try {
        return await collectYoutube(accountName, observedAt);
      } catch {
        return collectYoutubePublic(
          targets.filter((item) => item.platform === 'youtube').map((item) => ({ externalId: item.externalId })),
          observedAt,
        );
      }
    });
  }

  const requestedKeys = new Set(targets.map((item) => `${item.platform}:${item.externalId}`));
  const requestedResults = results.filter(
    (result) => requestedKeys.has(`${result.platform}:${result.externalId}`),
  );
  for (const project of projects) applyCollectedMetrics(project.id, requestedResults, observedAt);
  return { observedAt, results: requestedResults, failures };
}

function latestSnapshot(target: PublicationTarget) {
  return target.metricSnapshots.at(-1) ?? null;
}

export function buildPublicationLedger(projectIds: string[], generatedAt = new Date().toISOString()): PublicationLedger {
  const entries = projectIds.flatMap((projectId) => {
    const project = readBrief(projectId);
    return (project.workflow.publicationTargets ?? []).map((target) => ({
      projectId: project.id,
      projectTitle: project.title,
      platform: target.platform,
      targetId: target.id,
      status: target.status,
      externalId: target.externalId,
      publishedUrl: target.publishedUrl,
      publishedAt: target.publishedAt,
      submittedAt: target.submittedAt,
      copySnapshot: target.copySnapshot,
      latestMetrics: latestSnapshot(target),
    }));
  });
  return { schemaVersion: 1, generatedAt, entries };
}

function metricText(value: number | null | undefined, suffix = '') {
  return value === null || value === undefined ? '未取得' : `${value}${suffix}`;
}

function markdownLedger(ledger: PublicationLedger) {
  const lines = [
    '# 多平台发布台账',
    '',
    `生成时间：${ledger.generatedAt}`,
    '',
  ];
  const groups = new Map<string, PublicationLedgerEntry[]>();
  for (const entry of ledger.entries) {
    const group = groups.get(entry.projectId) ?? [];
    group.push(entry);
    groups.set(entry.projectId, group);
  }
  for (const [projectId, entries] of groups) {
    lines.push(`## ${entries[0]?.projectTitle || projectId}`, '', '| 平台 | 状态 | 观看 | 点赞 | 评论 | 收藏 | 分享 | 观测时间 |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const entry of entries) {
      const metrics = entry.latestMetrics;
      lines.push(`| ${entry.platform} | ${entry.status} | ${metricText(metrics?.viewCount)} | ${metricText(metrics?.likeCount)} | ${metricText(metrics?.commentCount)} | ${metricText(metrics?.favoriteCount)} | ${metricText(metrics?.shareCount)} | ${metrics?.observedAt || '未采集'} |`);
    }
    const copy = entries.find((entry) => entry.copySnapshot)?.copySnapshot;
    if (copy) {
      lines.push('', '### 投稿文案', '', `标题：${copy.title}`, '', copy.description, '', `标签：${copy.hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ')}`, '');
    }
    lines.push('### 平台实际展示', '');
    for (const entry of entries) {
      const copySnapshot = entry.copySnapshot;
      lines.push(`- ${entry.platform}：${copySnapshot?.effectiveTitle || '未取得平台展示标题'}${entry.publishedUrl ? `；${entry.publishedUrl}` : '；无稳定匿名公开 URL'}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

export function writePublicationLedger(
  projectIds: string[],
  options: { jsonPath?: string; markdownPath?: string; generatedAt?: string } = {},
) {
  const ledger = buildPublicationLedger(projectIds, options.generatedAt);
  const jsonPath = resolve(options.jsonPath ?? defaultLedgerJsonPath);
  const markdownPath = resolve(options.markdownPath ?? defaultLedgerMarkdownPath);
  mkdirSync(dirname(jsonPath), { recursive: true });
  mkdirSync(dirname(markdownPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(markdownPath, markdownLedger(ledger));
  return { ledger, jsonPath, markdownPath };
}
