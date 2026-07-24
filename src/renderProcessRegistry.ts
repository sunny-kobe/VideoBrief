import type { ChildProcess } from 'node:child_process';

interface ActiveRenderProcess {
  projectId: string;
  jobId: string;
  child: ChildProcess;
  cancelRequestedAt: string;
}

type RenderRegistryGlobal = typeof globalThis & {
  __videobriefActiveRenderProcesses?: Map<string, ActiveRenderProcess>;
};

const registryGlobal = globalThis as RenderRegistryGlobal;
const activeProcesses = registryGlobal.__videobriefActiveRenderProcesses
  ?? new Map<string, ActiveRenderProcess>();
registryGlobal.__videobriefActiveRenderProcesses = activeProcesses;

export function signalProcessTree(
  pid: number,
  signal: NodeJS.Signals,
  platform = process.platform,
  kill: (pid: number, signal: NodeJS.Signals) => boolean = process.kill,
) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const target = platform === 'win32' ? pid : -pid;
  try {
    kill(target, signal);
    return true;
  } catch {
    if (target === pid) return false;
    try {
      kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

export function registerRenderProcess(projectId: string, jobId: string, child: ChildProcess) {
  if (activeProcesses.has(projectId)) {
    throw new Error(`Render process already registered for ${projectId}.`);
  }
  activeProcesses.set(projectId, { projectId, jobId, child, cancelRequestedAt: '' });
}

export function unregisterRenderProcess(projectId: string, jobId: string) {
  const active = activeProcesses.get(projectId);
  if (!active || active.jobId !== jobId) return false;
  activeProcesses.delete(projectId);
  return true;
}

export function renderCancellationRequested(projectId: string, jobId: string) {
  const active = activeProcesses.get(projectId);
  return active?.jobId === jobId && Boolean(active.cancelRequestedAt);
}

export function requestRenderCancellation(projectId: string, jobId: string) {
  const active = activeProcesses.get(projectId);
  if (!active || active.jobId !== jobId || !active.child.pid) return false;
  if (!active.cancelRequestedAt) active.cancelRequestedAt = new Date().toISOString();
  return signalProcessTree(active.child.pid, 'SIGTERM');
}
