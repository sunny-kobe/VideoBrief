import { approveDailySignal } from '../src/dailySignalServer';

function flag(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? '';
}

const runId = process.argv[2];
const candidateId = process.argv[3];
const decidedBy = flag('decided-by');
const note = flag('note');
if (!runId || !candidateId || !decidedBy || !note) {
  throw new Error('用法：npm run signals:approve -- <run-id> <candidate-id> --decided-by=<人工批准者> --note=<至少12字的批准说明>');
}
const result = await approveDailySignal(runId, candidateId, { decidedBy, note });
console.log(JSON.stringify({ projectId: result.projectId, importedSourceIds: result.imported }, null, 2));
