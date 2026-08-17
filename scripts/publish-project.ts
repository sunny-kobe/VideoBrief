import {
  checkProgrammaticPublisherAccount,
  executeProgrammaticPublication,
  loginProgrammaticPublisherAccount,
  prepareProgrammaticPublication,
  publicProgrammaticPublicationPlan,
} from '../src/programmaticPublisher';

function flag(name: string, fallback = '') {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  const argument = process.argv.slice(2).find((item) => item === exact || item.startsWith(prefix));
  return argument === exact ? 'true' : argument?.slice(prefix.length) ?? fallback;
}

const action = flag('action', 'publish');
const projectId = flag('project');
const targetId = flag('target');
const platform = flag('platform');
const accountName = flag('account', 'daily-cause');

if (action === 'check') {
  if (!platform) throw new Error('检查登录态必须指定 --platform。');
  const result = await checkProgrammaticPublisherAccount(platform, accountName);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 2);
}

if (action === 'login') {
  if (!platform) throw new Error('登录必须指定 --platform。');
  console.log(JSON.stringify(await loginProgrammaticPublisherAccount(platform, accountName), null, 2));
  process.exit(0);
}

if (!projectId || !targetId) {
  throw new Error('用法：npm run project:publish -- --project=<project-id> --target=<target-id> [--account=daily-cause] [--schedule="2026-08-17 19:30"] [--dry-run]');
}

const categoryId = Number(flag('category-id', process.env.VIDEOBRIEF_BILIBILI_TID || '201'));
const plan = prepareProgrammaticPublication({
  projectId,
  targetId,
  accountName,
  schedule: flag('schedule'),
  bilibiliCategoryId: categoryId,
  headed: flag('headed') === 'true',
});

if (flag('dry-run') === 'true') {
  console.log(JSON.stringify({ dryRun: true, plan: publicProgrammaticPublicationPlan(plan) }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify(await executeProgrammaticPublication(plan), null, 2));
