import { approveDailySignal } from '../src/dailySignalServer';

const runId = process.argv[2];
const candidateId = process.argv[3];
if (!runId || !candidateId) throw new Error('用法：npm run signals:approve -- <run-id> <candidate-id>');
const result = await approveDailySignal(runId, candidateId);
console.log(JSON.stringify({ projectId: result.projectId, importedSourceIds: result.imported }, null, 2));

