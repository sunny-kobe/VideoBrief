import { processProjectSource } from '../src/sourceProcessingServer';

function flag(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? '';
}

const projectId = flag('project');
const sourceId = flag('source');
if (!projectId || !sourceId) throw new Error('Usage: process-project-source --project=<id> --source=<id>');

await processProjectSource(projectId, sourceId);
