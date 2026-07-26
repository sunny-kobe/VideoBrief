import { runProductionWorkflowUntilGate } from '../src/productionWorkflowServer';

function flag(name: string, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const projectId = flag('project') || process.argv.slice(2).find((argument) => !argument.startsWith('--')) || '';
if (!projectId) {
  throw new Error('Usage: npm run project:workflow -- --project=<project-id>');
}

const timeoutSeconds = Number(flag('timeout-seconds', '1800'));
const result = await runProductionWorkflowUntilGate(projectId, {
  instruction: flag('instruction'),
  timeoutMs: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1_000 : 30 * 60_000,
  onProgress: (message) => console.log(`[videobrief-workflow] ${message}`),
});

console.log(JSON.stringify({
  projectId,
  state: result.state,
  automaticActions: result.automaticActions,
  next: result.next,
}, null, 2));
