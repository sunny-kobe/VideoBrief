import { NextRequest, NextResponse } from 'next/server';
import {
  cancelRenderQueueJob,
  DEFAULT_RENDER_QUEUE_PATH,
  enqueueRenderQueueJob,
  latestRenderQueueJobForProject,
  updateRenderQueueJob,
} from '@/src/renderQueue';
import { ensureRenderQueueWorker } from '@/src/renderQueueWorkerClient';
import { signalProcessTree } from '@/src/renderProcessRegistry';
import {
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
  writeBrief,
  writeRenderJob,
} from '@/src/shortVideoProjectServer';
import { ShortVideoProject } from '@/src/shortVideoBrief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mirrorQueueJob(projectId: string) {
  const job = latestRenderQueueJobForProject(DEFAULT_RENDER_QUEUE_PATH, projectId);
  if (!job) return null;
  const project = readBrief(projectId);
  writeRenderJob(projectPaths(project).renderJobPath, job);
  return job;
}

function reconcileCompletedAcceptance(projectId: string) {
  const project = readBrief(projectId);
  const paths = projectPaths(project);
  const status = renderStatus(readRenderManifest(paths.manifestPath), projectId);
  const current = latestRenderQueueJobForProject(DEFAULT_RENDER_QUEUE_PATH, projectId);
  if (current?.state === 'awaiting_review' && status.state === 'ready') {
    updateRenderQueueJob(DEFAULT_RENDER_QUEUE_PATH, current.jobId, {
      state: 'completed',
      stage: 'completed',
      completedAt: new Date().toISOString(),
      error: '',
    });
  }
  return { project, paths, status };
}

export function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) throw new Error('projectId is required');
    const { status } = reconcileCompletedAcceptance(projectId);
    const job = latestRenderQueueJobForProject(DEFAULT_RENDER_QUEUE_PATH, projectId);
    if (job && ['queued', 'running', 'cancelling'].includes(job.state)) {
      ensureRenderQueueWorker(DEFAULT_RENDER_QUEUE_PATH);
    }
    return NextResponse.json({
      job: mirrorQueueJob(projectId),
      renderStatus: status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'render status failed' },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
      brief?: ShortVideoProject;
      mode?: 'start' | 'resume';
    };
    const projectId = body.projectId ?? body.brief?.id;
    if (!projectId) throw new Error('projectId is required');

    const active = latestRenderQueueJobForProject(DEFAULT_RENDER_QUEUE_PATH, projectId);
    if (active && ['queued', 'running', 'cancelling'].includes(active.state)) {
      const canonical = readBrief(projectId);
      if (body.brief && JSON.stringify(body.brief) !== JSON.stringify(canonical)) {
        return NextResponse.json(
          { error: '项目已有渲染任务，不能在执行期间改写 canonical project。', renderJob: active },
          { status: 409 },
        );
      }
      ensureRenderQueueWorker(DEFAULT_RENDER_QUEUE_PATH);
      return NextResponse.json({
        brief: canonical,
        renderStatus: renderStatus(readRenderManifest(projectPaths(canonical).manifestPath), projectId),
        renderJob: mirrorQueueJob(projectId),
      }, { status: 202 });
    }

    const previousJob = active;
    if (body.mode === 'resume' && previousJob && !['failed', 'cancelled'].includes(previousJob.state)) {
      return NextResponse.json(
        { error: '只有失败或已取消的任务可以继续渲染。' },
        { status: 409 },
      );
    }
    if (body.brief) writeBrief(projectId, body.brief);
    const brief = readBrief(projectId);
    const paths = projectPaths(brief);
    const queued = enqueueRenderQueueJob(DEFAULT_RENDER_QUEUE_PATH, {
      projectId,
      briefPath: paths.briefPath,
    }, {
      resumedFromJobId: body.mode === 'resume' ? previousJob?.jobId : undefined,
    });
    writeRenderJob(paths.renderJobPath, queued.job);
    ensureRenderQueueWorker(DEFAULT_RENDER_QUEUE_PATH);

    return NextResponse.json({
      brief,
      renderStatus: renderStatus(readRenderManifest(paths.manifestPath), projectId),
      renderJob: queued.job,
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'render enqueue failed' },
      { status: 500 },
    );
  }
}

export function DELETE(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) throw new Error('projectId is required');
    readBrief(projectId);
    const current = latestRenderQueueJobForProject(DEFAULT_RENDER_QUEUE_PATH, projectId);
    if (!current || !['queued', 'running', 'cancelling'].includes(current.state)) {
      return NextResponse.json({ error: '当前没有可取消的渲染任务。' }, { status: 409 });
    }
    const next = cancelRenderQueueJob(DEFAULT_RENDER_QUEUE_PATH, current.jobId);
    if (!next) return NextResponse.json({ error: '渲染任务已结束。' }, { status: 409 });
    if (next.processId && next.state === 'cancelling') {
      signalProcessTree(next.processId, 'SIGTERM');
    }
    ensureRenderQueueWorker(DEFAULT_RENDER_QUEUE_PATH);
    return NextResponse.json({ job: mirrorQueueJob(projectId) }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'cancel render failed' },
      { status: 400 },
    );
  }
}
