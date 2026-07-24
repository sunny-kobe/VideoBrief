import { enrichApprovedDailySignal } from '../src/dailySignalServer';

const runId = process.argv[2];
const candidateId = process.argv[3];
if (!runId || !candidateId) throw new Error('用法：npm run signals:enrich -- <run-id> <candidate-id>');
console.log(JSON.stringify(await enrichApprovedDailySignal(runId, candidateId), null, 2));

