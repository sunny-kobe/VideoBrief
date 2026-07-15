import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, sep } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { assertProjectId, readBrief } from '@/src/shortVideoProjectServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SourcePreviewRouteProps {
  params: Promise<{ projectId: string; sourceId: string }>;
}

function previewPath(projectId: string, sourceId: string, contentHash: string) {
  const cacheDirectory = resolve('output/source-previews', projectId);
  mkdirSync(cacheDirectory, { recursive: true });
  const cacheKey = /^[a-f0-9]{64}$/.test(contentHash) ? contentHash : 'current';
  return join(cacheDirectory, `${sourceId}-${cacheKey}.wav`);
}

function ensureWavPreview(projectId: string, sourceId: string) {
  const project = readBrief(assertProjectId(projectId));
  const source = project.sources.find((item) => item.id === sourceId);
  if (!source || source.sourceType !== 'audio') throw new Error('音频素材不存在。');

  const projectAssetRoot = resolve('public/project-assets', projectId);
  const inputPath = resolve(source.assetPath);
  if (!inputPath.startsWith(`${projectAssetRoot}${sep}`) || !existsSync(inputPath)) {
    throw new Error('音频素材路径无效。');
  }

  const outputPath = previewPath(projectId, sourceId, source.contentHash);
  if (existsSync(outputPath) && statSync(outputPath).size > 0) return outputPath;

  const ffmpegBinary = join(
    process.cwd(),
    'node_modules',
    'ffmpeg-static',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  );
  if (!existsSync(ffmpegBinary)) throw new Error('本地 FFmpeg 不可用。');
  const result = spawnSync(
    ffmpegBinary,
    ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outputPath],
    { encoding: 'utf8' },
  );
  if (result.status !== 0 || !existsSync(outputPath) || statSync(outputPath).size === 0) {
    throw new Error('音频预览转码失败。');
  }
  return outputPath;
}

export async function GET(request: NextRequest, { params }: SourcePreviewRouteProps) {
  try {
    const { projectId, sourceId } = await params;
    const path = ensureWavPreview(projectId, sourceId);
    const bytes = readFileSync(path);
    const range = request.headers.get('range');
    const baseHeaders = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'Content-Type': 'audio/wav',
    };

    if (!range) {
      return new NextResponse(new Uint8Array(bytes), {
        headers: { ...baseHeaders, 'Content-Length': String(bytes.length) },
      });
    }

    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new NextResponse(null, { status: 416 });
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : bytes.length - 1;
    const end = Math.min(requestedEnd, bytes.length - 1);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
      return new NextResponse(null, { status: 416 });
    }
    const chunk = bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '音频预览失败' },
      { status: 404 },
    );
  }
}
