import { scanDailySignals } from '../src/dailySignalServer';

const replace = process.argv.includes('--replace');
const run = await scanDailySignals({ replace });
console.log(JSON.stringify({
  runId: run.id,
  status: run.status,
  candidates: run.candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, score: candidate.score.total })),
  errors: run.errors,
}, null, 2));
if (run.status !== 'completed') process.exitCode = 1;

