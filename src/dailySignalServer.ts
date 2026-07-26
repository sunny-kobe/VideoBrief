import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { load } from 'cheerio';
import { chromium } from 'playwright-core';
import {
  buildTopicPreflight,
  rankSignalSources,
  signalSlug,
  type DailySignalCandidate,
  type DailySignalKind,
  type DailySignalRun,
  type DailySignalSource,
} from './dailySignalCore';
import type { WorkflowHumanDecision } from './shortVideoBrief';
import { createProject, importProjectSource, readBrief } from './shortVideoProjectServer';

interface DailySignalConfig {
  schemaVersion: 1;
  maxCandidates: number;
  githubQueries: string[];
  githubRepositories: string[];
  rssFeeds: Array<{ label: string; url: string; kind: DailySignalKind }>;
  hackerNews: { enabled: boolean; limit: number };
}

interface ResolvedPage {
  title: string;
  description: string;
  text: string;
  mediaUrls: string[];
}

interface GitHubReadme {
  url: string;
  text: string;
  mediaUrls: string[];
}

const repoRoot = process.cwd();
const signalsRoot = resolve(repoRoot, 'content/daily-signals');
const runsRoot = resolve(signalsRoot, 'runs');
const configPath = resolve(signalsRoot, 'sources.json');
const approvalsPath = resolve(signalsRoot, 'approvals.json');
const userAgent = 'VideoBrief/0.0.0 (+local zero-cost signal workflow)';
const aiTopicPattern = /\b(ai|agent|agents|llm|model|mcp|codex|claude|openai|anthropic|automation|developer|coding|workflow|video)\b/i;

function atomicJson(path: string, value: unknown) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function readConfig(): DailySignalConfig {
  return JSON.parse(readFileSync(configPath, 'utf8')) as DailySignalConfig;
}

function readApprovals() {
  if (!existsSync(approvalsPath)) return [] as Array<{ runId: string; candidate: DailySignalCandidate }>;
  return JSON.parse(readFileSync(approvalsPath, 'utf8')) as Array<{ runId: string; candidate: DailySignalCandidate }>;
}

function writeApproval(runId: string, candidate: DailySignalCandidate) {
  const approvals = readApprovals().filter((item) => !(item.runId === runId && item.candidate.id === candidate.id));
  approvals.push({ runId, candidate });
  atomicJson(approvalsPath, approvals);
}

function runPath(runId: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/.test(runId)) throw new Error('无效的信号批次 ID。');
  return resolve(runsRoot, `${runId}.json`);
}

function writeRun(run: DailySignalRun) {
  atomicJson(runPath(run.id), run);
  atomicJson(resolve(signalsRoot, 'latest.json'), run);
  return run;
}

export function readDailySignalRun(runId: string) {
  const path = runPath(runId);
  if (!existsSync(path)) throw new Error('找不到该信号批次。');
  return JSON.parse(readFileSync(path, 'utf8')) as DailySignalRun;
}

export function readLatestDailySignalRun() {
  const path = resolve(signalsRoot, 'latest.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as DailySignalRun : null;
}

export function listDailySignalRuns() {
  if (!existsSync(runsRoot)) return [];
  return readdirSync(runsRoot)
    .filter((name) => /^\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?\.json$/.test(name))
    .sort()
    .reverse()
    .map((name) => JSON.parse(readFileSync(resolve(runsRoot, name), 'utf8')) as DailySignalRun);
}

function timeoutSignal(milliseconds = 12_000) {
  return AbortSignal.timeout(milliseconds);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': userAgent },
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { accept: 'text/html,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8', 'user-agent': userAgent },
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return { text: await response.text(), contentType: response.headers.get('content-type') ?? '' };
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function stripSignalMarkup(value: string) {
  if (!value.includes('<')) return cleanText(value);
  return cleanText(load(value).root().text());
}

function mediaIdentity(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`
      .replace(/\.(?:max|width|height)-[^.]+/gi, '')
      .replace(/\.format-[^.]+/gi, '')
      .replace(/\.(?:png|jpe?g|webp)$/i, '');
  } catch {
    return value;
  }
}

function mediaResolutionHint(value: string) {
  const numbers = [...value.matchAll(/(?:width|max|height)-(\d+)(?:x(\d+))?/gi)]
    .flatMap((match) => [Number(match[1] || 0), Number(match[2] || 0)]);
  return numbers.length ? Math.max(...numbers) : 1000;
}

export function dedupeSignalMediaUrls(values: string[]) {
  const groups = new Map<string, string>();
  for (const value of values) {
    const key = mediaIdentity(value);
    const current = groups.get(key);
    if (!current || mediaResolutionHint(value) > mediaResolutionHint(current)) groups.set(key, value);
  }
  return [...groups.values()];
}

function parseFeed(xml: string, feed: DailySignalConfig['rssFeeds'][number]): DailySignalSource[] {
  const $ = load(xml, { xmlMode: true });
  const entries = $('item, entry').toArray().slice(0, 12);
  return entries.flatMap<DailySignalSource>((entry) => {
    const item = $(entry);
    const title = cleanText(item.find('title').first().text());
    const directLink = item.find('link').first().attr('href') || item.find('link').first().text();
    const url = absoluteUrl(directLink, feed.url);
    if (!title || !url) return [];
    const summaryNode = item.find('description, summary, content').first();
    const summary = stripSignalMarkup(summaryNode.text() || summaryNode.html() || '').slice(0, 1000);
    const publishedAt = item.find('pubDate, published, updated').first().text() || new Date().toISOString();
    const mediaUrls = item.find('media\\:content, enclosure').toArray()
      .map((node) => absoluteUrl($(node).attr('url') ?? '', feed.url))
      .filter(Boolean);
    return [{
      kind: feed.kind,
      title,
      url,
      publishedAt: new Date(publishedAt).toISOString(),
      summary,
      author: feed.label,
      mediaUrls,
    }];
  });
}

async function githubSearchSources(query: string, sevenDaysAgo: string) {
  const resolvedQuery = query.replace('{{sevenDaysAgo}}', sevenDaysAgo);
  const data = await fetchJson<{ items?: Array<{
    full_name: string;
    html_url: string;
    description: string | null;
    pushed_at: string;
    stargazers_count?: number;
    forks_count?: number;
    license?: { spdx_id?: string } | null;
    topics?: string[];
    owner?: { login?: string; avatar_url?: string };
  }> }>(`https://api.github.com/search/repositories?q=${encodeURIComponent(resolvedQuery)}&sort=updated&order=desc&per_page=12`);
  return (data.items ?? []).map<DailySignalSource>((item) => ({
    kind: 'github',
    title: item.full_name,
    url: item.html_url,
    publishedAt: item.pushed_at,
    summary: `${item.description ?? `GitHub 项目 ${item.full_name}`}（${item.stargazers_count ?? 0} stars，${item.forks_count ?? 0} forks，许可 ${item.license?.spdx_id || '待确认'}）`,
    author: item.owner?.login ?? 'GitHub',
    mediaUrls: [],
  }));
}

async function githubReleaseSource(repository: string) {
  const release = await fetchJson<{
    name: string | null;
    tag_name: string;
    html_url: string;
    published_at: string;
    body: string | null;
    author?: { login?: string; avatar_url?: string };
  }>(`https://api.github.com/repos/${repository}/releases/latest`);
  return {
    kind: 'github',
    title: `${repository} ${release.name || release.tag_name}`,
    url: release.html_url,
    publishedAt: release.published_at,
    summary: cleanText(release.body ?? '').slice(0, 1200),
    author: release.author?.login ?? repository.split('/')[0],
    mediaUrls: release.author?.avatar_url ? [release.author.avatar_url] : [],
  } satisfies DailySignalSource;
}

async function hackerNewsSources(limit: number) {
  const ids = await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json');
  const stories = await Promise.all(ids.slice(0, Math.max(1, limit)).map(async (id) => {
    try {
      return await fetchJson<{
        id: number;
        title?: string;
        url?: string;
        time?: number;
        by?: string;
        score?: number;
        descendants?: number;
      }>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    } catch {
      return null;
    }
  }));
  return stories.flatMap<DailySignalSource>((story) => {
    if (!story?.title || !aiTopicPattern.test(story.title)) return [];
    return [{
      kind: 'hackernews',
      title: story.title,
      url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
      publishedAt: new Date((story.time ?? 0) * 1000).toISOString(),
      summary: `Hacker News：${story.score ?? 0} 分，${story.descendants ?? 0} 条评论。讨论：https://news.ycombinator.com/item?id=${story.id}`,
      author: story.by ?? 'Hacker News',
      mediaUrls: [],
    }];
  });
}

function runIdForDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function scanDailySignals(options: { now?: Date; replace?: boolean } = {}) {
  const now = options.now ?? new Date();
  const runId = runIdForDate(now);
  if (!options.replace && existsSync(runPath(runId))) return readDailySignalRun(runId);
  const previous = existsSync(runPath(runId)) ? readDailySignalRun(runId) : null;
  const startedAt = new Date().toISOString();
  const run: DailySignalRun = {
    schemaVersion: 1,
    id: runId,
    date: runId,
    createdAt: startedAt,
    completedAt: '',
    status: 'running',
    zeroCost: true,
    errors: [],
    candidates: [],
  };
  writeRun(run);

  const config = readConfig();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const tasks: Array<{ label: string; load: () => Promise<DailySignalSource[]> }> = [
    ...config.githubQueries.map((query) => ({ label: `GitHub search: ${query}`, load: () => githubSearchSources(query, sevenDaysAgo) })),
    ...config.githubRepositories.map((repository) => ({ label: `GitHub release: ${repository}`, load: async () => [await githubReleaseSource(repository)] })),
    ...config.rssFeeds.map((feed) => ({ label: `RSS: ${feed.label}`, load: async () => parseFeed((await fetchText(feed.url)).text, feed) })),
    ...(config.hackerNews.enabled ? [{ label: 'Hacker News', load: () => hackerNewsSources(config.hackerNews.limit) }] : []),
  ];
  const settled = await Promise.all(tasks.map(async (task) => {
    try {
      return await task.load();
    } catch (error) {
      run.errors.push(`${task.label}: ${error instanceof Error ? error.message : '抓取失败'}`);
      return [];
    }
  }));
  const previousById = new Map(previous?.candidates.map((candidate) => [candidate.id, candidate]) ?? []);
  const ranked = rankSignalSources(settled.flat(), { now, limit: config.maxCandidates }).map((candidate) => {
    const old = previousById.get(candidate.id);
    const next = old?.status === 'approved'
      ? { ...candidate, status: old.status, projectId: old.projectId }
      : candidate;
    return { ...next, preflight: buildTopicPreflight(next, run.errors) };
  });
  const rankedIds = new Set(ranked.map((candidate) => candidate.id));
  const approvedLedgerCandidates = readApprovals()
    .filter((item) => item.runId === runId)
    .map((item) => item.candidate);
  const approvedFromPreviousRun = [...(previous?.candidates ?? []), ...approvedLedgerCandidates].filter(
    (candidate) => candidate.status === 'approved' && !rankedIds.has(candidate.id),
  );
  run.candidates = [...ranked, ...new Map(approvedFromPreviousRun.map((candidate) => [candidate.id, candidate])).values()];
  run.status = run.candidates.length >= 3 ? 'completed' : 'failed';
  if (run.candidates.length < 3) run.errors.push(`只生成 ${run.candidates.length} 个候选，低于每日 3 个的验收线。`);
  run.completedAt = new Date().toISOString();
  return writeRun(run);
}

async function resolvePage(url: string): Promise<ResolvedPage> {
  const { text, contentType } = await fetchText(url);
  if (!contentType.includes('html') && !/<html/i.test(text)) {
    return { title: url, description: '', text: text.slice(0, 12_000), mediaUrls: [] };
  }
  const $ = load(text);
  $('script,style,noscript,svg,nav,footer').remove();
  const title = cleanText($('meta[property="og:title"]').attr('content') || $('title').first().text());
  const description = cleanText($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '');
  const body = cleanText($('article').first().text() || $('main').first().text() || $('body').text()).slice(0, 12_000);
  const selectors = [
    'meta[property="og:video"]',
    'video[src]',
    'video source[src]',
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'article img[src]',
    'main img[src]',
  ];
  const mediaUrls = selectors.flatMap((selector) => $(selector).toArray().map((node) => (
    absoluteUrl($(node).attr('content') || $(node).attr('src') || '', url)
  ))).filter(Boolean);
  return { title, description, text: body, mediaUrls: dedupeSignalMediaUrls(mediaUrls).slice(0, 8) };
}

function githubCoordinates(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'github.com') return null;
    const [owner, repository] = url.pathname.split('/').filter(Boolean);
    return owner && repository ? { owner, repository: repository.replace(/\.git$/, '') } : null;
  } catch {
    return null;
  }
}

function markdownMediaUrls(markdown: string, baseUrl: string) {
  const markdownImages = [...markdown.matchAll(/!\[[^\]]*\]\((?:<)?([^\s)>]+)(?:>[^)]*)?\)/g)]
    .map((match) => absoluteUrl(match[1], baseUrl));
  const html = load(markdown);
  const htmlVideos = html('video[src], video source[src]').toArray()
    .map((node) => absoluteUrl(html(node).attr('src') ?? '', baseUrl));
  const htmlImages = html('img[src]').toArray()
    .map((node) => absoluteUrl(html(node).attr('src') ?? '', baseUrl));
  const attachments = [...markdown.matchAll(/https:\/\/github\.com\/user-attachments\/assets\/[a-z0-9-]+/gi)]
    .map((match) => match[0]);
  return dedupeSignalMediaUrls([...htmlVideos, ...attachments, ...markdownImages, ...htmlImages].filter(Boolean));
}

function likelyVideoUrl(value: string) {
  return /\.(?:mp4|webm|mov|m4v)(?:$|[?#])/i.test(value) || /(?:video|stream|player)/i.test(value);
}

function videoFirst(values: string[]) {
  return values.map((value, index) => ({ value, index }))
    .sort((left, right) => Number(likelyVideoUrl(right.value)) - Number(likelyVideoUrl(left.value)) || left.index - right.index)
    .map(({ value }) => value);
}

async function resolveGitHubReadme(url: string): Promise<GitHubReadme | null> {
  const coordinates = githubCoordinates(url);
  if (!coordinates) return null;
  const rawUrl = `https://raw.githubusercontent.com/${coordinates.owner}/${coordinates.repository}/HEAD/README.md`;
  try {
    const { text } = await fetchText(rawUrl);
    return {
      url: rawUrl,
      text,
      mediaUrls: markdownMediaUrls(text, `https://raw.githubusercontent.com/${coordinates.owner}/${coordinates.repository}/HEAD/`),
    };
  } catch {
    return null;
  }
}

function extensionForMedia(url: string, contentType: string) {
  const direct = extname(new URL(url).pathname).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov'].includes(direct)) return direct;
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
  if (contentType.includes('webm')) return '.webm';
  if (contentType.includes('video')) return '.mp4';
  return '';
}

async function downloadMedia(url: string) {
  const response = await fetch(url, { headers: { 'user-agent': userAgent }, signal: timeoutSignal(20_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type') ?? '';
  const extension = extensionForMedia(url, contentType);
  if (!extension) throw new Error(`不支持的媒体类型 ${contentType || 'unknown'}`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > 80 * 1024 * 1024) throw new Error('远程素材超过 80 MB。');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 80 * 1024 * 1024) throw new Error('远程素材为空或超过 80 MB。');
  return { bytes, extension, contentType };
}

async function wikimediaImages(query: string) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '2',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    format: 'json',
    origin: '*',
  });
  const data = await fetchJson<{ query?: { pages?: Record<string, {
    title?: string;
    imageinfo?: Array<{ url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }>;
  }> } }>(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(data.query?.pages ?? {}).flatMap((page) => {
    const image = page.imageinfo?.[0];
    if (!image?.url) return [];
    const metadata = image.extmetadata ?? {};
    const license = cleanText(metadata.LicenseShortName?.value ?? '');
    return [{
      title: page.title ?? basename(new URL(image.url).pathname),
      url: image.url,
      originUrl: image.descriptionurl ?? image.url,
      license,
      artist: cleanText(metadata.Artist?.value ?? ''),
    }];
  });
}

async function captureSourcePage(
  projectId: string,
  candidate: DailySignalCandidate,
  knownOrigins: Set<string>,
  captureScreenshotFallback: boolean,
) {
  const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chromePath)) return [] as string[];
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const imported: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await page.goto(candidate.primaryUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const browserVideoUrls = await page.evaluate(() => Array.from(document.querySelectorAll('video'))
      .flatMap((video) => [video.currentSrc, video.src, ...Array.from(video.querySelectorAll('source')).map((source) => source.src)])
      .filter((value) => value.startsWith('http://') || value.startsWith('https://')));
    for (const [index, videoUrl] of [...new Set(browserVideoUrls)].entries()) {
      if (knownOrigins.has(videoUrl)) continue;
      try {
        const media = await downloadMedia(videoUrl);
        if (!media.contentType.includes('video') && !likelyVideoUrl(videoUrl)) continue;
        const result = importProjectSource(projectId, `browser-video-${index + 1}${media.extension}`, media.bytes, {
          label: `一手页面视频素材 ${index + 1}`,
          originUrl: videoUrl,
          mimeType: media.contentType,
          materialRole: 'official_demo',
          verificationStatus: 'needs_check',
          rightsStatus: 'review_required',
          rightsNote: '从一手页面中的 video 元素发现，仅用于本地素材包预览；公开发布前逐项确认许可和必要引用范围。',
        });
        imported.push(result.source.id);
        knownOrigins.add(videoUrl);
      } catch {
        // Some players expose protected or short-lived stream URLs.
      }
    }
    if (!captureScreenshotFallback) return imported;
    const dimensions = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: window.innerHeight }));
    const positions = [0]
      .map((ratio) => Math.round(Math.max(0, dimensions.height - dimensions.viewport) * ratio))
      .filter((value, index, values) => values.indexOf(value) === index);
    for (const [index, y] of positions.entries()) {
      const originUrl = `${candidate.primaryUrl}#videobrief-capture-${index + 1}`;
      if (knownOrigins.has(originUrl)) continue;
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(250);
      const bytes = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
      const result = importProjectSource(projectId, `source-page-${index + 1}.png`, new Uint8Array(bytes), {
        label: `一手来源页面截图 ${index + 1}`,
        originUrl,
        mimeType: 'image/png',
        materialRole: 'evidence',
        verificationStatus: 'verified',
        rightsStatus: 'review_required',
        rightsNote: 'VideoBrief 对一手来源页面的本地截图，仅用于证据化候选成片；公开发布前复核引用必要性和页面素材权利。',
      });
      imported.push(result.source.id);
      knownOrigins.add(originUrl);
    }
  } finally {
    await browser.close();
  }
  return imported;
}

function sourceCard(candidate: DailySignalCandidate, page: ResolvedPage | null) {
  const sources = candidate.sources.map((source) => `- [${source.title}](${source.url})`).join('\n');
  return [
    `# ${candidate.title}`,
    '',
    '## 候选摘要',
    candidate.summary || page?.description || '待 Codex 进一步核验。',
    '',
    '## 原始来源',
    sources,
    '',
    '## 自动收集说明',
    '本文件只保存候选元数据、短摘要和原始链接。候选入选不代表事实、版权或市场价值已经确认。',
  ].join('\n');
}

function projectIdFor(candidate: DailySignalCandidate) {
  return `${new Date().toISOString().slice(0, 10)}-${signalSlug(candidate.title)}`.slice(0, 64).replace(/-+$/g, '');
}

async function enrichProjectFromCandidate(projectId: string, candidate: DailySignalCandidate) {
  const imported: string[] = [];
  const page = await resolvePage(candidate.primaryUrl).catch(() => null);
  const readme = await resolveGitHubReadme(candidate.primaryUrl);
  let project = readBrief(projectId);
  const knownOrigins = new Set(project.sources.map((source) => source.originUrl).filter(Boolean));

  if (readme?.text && !knownOrigins.has(readme.url)) {
    const result = importProjectSource(projectId, 'github-readme.md', new TextEncoder().encode(readme.text.slice(0, 50_000)), {
      label: `${candidate.title} README`,
      originUrl: readme.url,
      mimeType: 'text/markdown',
      materialRole: 'research',
      verificationStatus: 'verified',
      rightsStatus: 'review_required',
      rightsNote: 'GitHub README 本地研究副本；仓库许可不自动覆盖全部嵌入媒体，发布前逐项复核。',
    });
    imported.push(result.source.id);
    knownOrigins.add(readme.url);
  }

  const topicalMedia = videoFirst(dedupeSignalMediaUrls([
    ...candidate.sources.flatMap((source) => source.mediaUrls),
    ...(page?.mediaUrls ?? []),
    ...(readme?.mediaUrls ?? []),
  ])).filter((url) => !knownOrigins.has(url));
  for (const [mediaIndex, mediaUrl] of topicalMedia.slice(0, 6).entries()) {
    try {
      const media = await downloadMedia(mediaUrl);
      const result = importProjectSource(projectId, `discovered-media-${mediaIndex + 1}${media.extension}`, media.bytes, {
        label: `命题相关真实素材 ${mediaIndex + 1}`,
        originUrl: mediaUrl,
        mimeType: media.contentType,
        materialRole: 'official_demo',
        verificationStatus: 'needs_check',
        rightsStatus: 'review_required',
        rightsNote: '从一手页面或 GitHub README 自动发现，仅用于本地候选成片；发布前逐项确认许可和必要引用范围。',
      });
      imported.push(result.source.id);
      knownOrigins.add(mediaUrl);
    } catch {
      // Keep resolving the remaining source-native assets.
    }
  }

  project = readBrief(projectId);
  let visualCount = project.sources.filter((source) => source.sourceType === 'image' || source.sourceType === 'video').length;
  const hasVideo = project.sources.some((source) => source.sourceType === 'video');
  if (!hasVideo || visualCount < 3) {
    try {
      imported.push(...await captureSourcePage(projectId, candidate, knownOrigins, visualCount < 3));
    } catch {
      // Browser capture is a source-native fallback; retain the remaining free-media fallbacks.
    }
  }

  project = readBrief(projectId);
  visualCount = project.sources.filter((source) => source.sourceType === 'image' || source.sourceType === 'video').length;
  if (visualCount < 3) {
    try {
      const commons = await wikimediaImages(candidate.title);
      for (const [mediaIndex, item] of commons.entries()) {
        if (knownOrigins.has(item.originUrl)) continue;
        try {
          const media = await downloadMedia(item.url);
          const result = importProjectSource(projectId, `commons-fallback-${mediaIndex + 1}${media.extension}`, media.bytes, {
            label: item.title,
            originUrl: item.originUrl,
            mimeType: media.contentType,
            materialRole: 'broll',
            verificationStatus: 'needs_check',
            rightsStatus: item.license ? 'cleared' : 'review_required',
            rightsNote: item.license
              ? `Wikimedia Commons：${item.license}${item.artist ? `；作者 ${item.artist}` : ''}。发布前保留许可要求与署名。`
              : 'Wikimedia Commons 元数据未返回明确许可，发布前复核。',
          });
          imported.push(result.source.id);
        } catch {
          // A fallback asset is optional.
        }
      }
    } catch {
      // Wikimedia failure is a visible coverage gap in the final source list, not an approval blocker.
    }
  }
  return imported;
}

export async function enrichApprovedDailySignal(runId: string, candidateIdValue: string) {
  const run = readDailySignalRun(runId);
  const candidate = run.candidates.find((item) => item.id === candidateIdValue);
  if (!candidate?.projectId || candidate.status !== 'approved') throw new Error('候选尚未批准或缺少项目。');
  return { projectId: candidate.projectId, imported: await enrichProjectFromCandidate(candidate.projectId, candidate) };
}

export async function approveDailySignal(
  runId: string,
  candidateIdValue: string,
  topicApproval: WorkflowHumanDecision,
) {
  const run = readDailySignalRun(runId);
  const index = run.candidates.findIndex((candidate) => candidate.id === candidateIdValue);
  if (index < 0) throw new Error('找不到该候选命题。');
  const candidate = run.candidates[index];
  if (candidate.status === 'approved' && candidate.projectId) return { run, candidate, projectId: candidate.projectId, imported: [] };
  const projectId = projectIdFor(candidate);
  createProject({
    id: projectId,
    title: candidate.title,
    workflowOrigin: {
      kind: 'daily_signal',
      runId,
      candidateId: candidate.id,
      sourceUrl: candidate.primaryUrl,
      score: candidate.score.total,
      summary: candidate.summary,
    },
    topicApproval,
    brief: {
      objective: `用一手来源和真实画面，在 40-60 秒内解释“${candidate.title}”为什么值得中文 AI 实践者关注。`,
      audience: '中文开发者、独立开发者、产品人和 AI 工作流实践者',
      platform: '小红书 / 视频号 / YouTube Shorts',
      aspectRatio: '9:16',
      targetDurationSeconds: 48,
      tone: '克制、清晰、有判断',
      style: '真实产品素材优先，程序化信息层辅助，避免泛库存画面堆叠',
      reference: candidate.sources.map((source) => source.url).join('\n'),
      coreMessage: candidate.summary || candidate.title,
      cta: '查看原始来源，并用一个真实任务验证。',
      prohibitedMaterial: '未经核验的数字、无法追溯的素材、把官方演示描述成用户实测、自动发布',
    },
  });

  const imported: string[] = [];
  let visualImported = 0;
  let page: ResolvedPage | null = null;
  try {
    page = await resolvePage(candidate.primaryUrl);
  } catch {
    page = null;
  }
  const card = sourceCard(candidate, page);
  const cardSource = importProjectSource(projectId, 'signal-card.md', new TextEncoder().encode(card), {
    label: '每日候选信号卡',
    originUrl: candidate.primaryUrl,
    mimeType: 'text/markdown',
    materialRole: 'research',
    verificationStatus: 'needs_check',
    rightsStatus: 'cleared',
    rightsNote: 'VideoBrief 自动生成的原创元数据卡，不复制原文。',
  });
  imported.push(cardSource.source.id);

  if (page?.text) {
    const excerpt = `# ${page.title || candidate.title}\n\n${page.description}\n\n${page.text.slice(0, 8_000)}\n`;
    const pageSource = importProjectSource(projectId, 'primary-source.md', new TextEncoder().encode(excerpt), {
      label: page.title || '原始网页正文摘录',
      originUrl: candidate.primaryUrl,
      mimeType: 'text/markdown',
      materialRole: 'research',
      verificationStatus: candidate.sources[0]?.kind === 'official' || candidate.sources[0]?.kind === 'github' ? 'verified' : 'needs_check',
      rightsStatus: 'review_required',
      rightsNote: '本地研究摘录，仅用于事实核验；公开导出前复核原始网页使用边界。',
    });
    imported.push(pageSource.source.id);
  }

  const topicalMedia = videoFirst(dedupeSignalMediaUrls([...(candidate.sources.flatMap((source) => source.mediaUrls)), ...(page?.mediaUrls ?? [])]));
  for (const [mediaIndex, mediaUrl] of topicalMedia.slice(0, 3).entries()) {
    try {
      const media = await downloadMedia(mediaUrl);
      const result = importProjectSource(projectId, `topic-media-${mediaIndex + 1}${media.extension}`, media.bytes, {
        label: `命题相关网页素材 ${mediaIndex + 1}`,
        originUrl: mediaUrl,
        mimeType: media.contentType,
        materialRole: 'official_demo',
        verificationStatus: 'needs_check',
        rightsStatus: 'review_required',
        rightsNote: '自动发现的第三方网页素材，仅用于本地候选成片；发布前必须确认使用权。',
      });
      imported.push(result.source.id);
      visualImported += 1;
    } catch {
      // A single unusable remote asset must not abort project creation.
    }
  }

  if (visualImported < 2) {
    try {
      const commons = await wikimediaImages(candidate.title);
      for (const [mediaIndex, item] of commons.entries()) {
        try {
          const media = await downloadMedia(item.url);
          const result = importProjectSource(projectId, `commons-${mediaIndex + 1}${media.extension}`, media.bytes, {
            label: item.title,
            originUrl: item.originUrl,
            mimeType: media.contentType,
            materialRole: 'broll',
            verificationStatus: 'needs_check',
            rightsStatus: item.license ? 'cleared' : 'review_required',
            rightsNote: item.license
              ? `Wikimedia Commons：${item.license}${item.artist ? `；作者 ${item.artist}` : ''}。发布前保留许可要求与署名。`
              : 'Wikimedia Commons 元数据未返回明确许可，发布前复核。',
          });
          imported.push(result.source.id);
          visualImported += 1;
        } catch {
          // Continue with other free-media candidates.
        }
      }
    } catch {
      // Wikimedia is a fallback and must not block approval.
    }
  }

  imported.push(...await enrichProjectFromCandidate(projectId, candidate));
  const nextCandidate = { ...candidate, status: 'approved' as const, projectId };
  run.candidates[index] = nextCandidate;
  writeApproval(runId, nextCandidate);
  writeRun(run);
  return { run, candidate: nextCandidate, projectId, imported };
}

export function dailySignalFingerprint(run: DailySignalRun) {
  return createHash('sha256').update(JSON.stringify(run)).digest('hex');
}
