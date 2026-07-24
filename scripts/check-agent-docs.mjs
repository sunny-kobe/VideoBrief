import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const agentsPath = resolve(root, 'AGENTS.md');
const packagePath = resolve(root, 'package.json');
const issues = [];

if (!existsSync(agentsPath)) {
  issues.push('缺少 AGENTS.md。');
} else {
  const agents = readFileSync(agentsPath, 'utf8');
  const lineCount = agents.split(/\r?\n/).length;
  if (lineCount > 200) {
    issues.push(`AGENTS.md 当前有 ${lineCount} 行；根指引应保持在 200 行以内。`);
  }

  for (const section of ['## 项目定位', '## 开始前', '## 常用命令', '## 参考文档', '## 验证矩阵']) {
    if (!agents.includes(section)) issues.push(`AGENTS.md 缺少必需章节：${section}。`);
  }

  const localPaths = new Set(
    [...agents.matchAll(/`((?:docs|scripts)\/[^`\s]+)`/g)].map((match) => match[1]),
  );
  for (const localPath of localPaths) {
    if (!existsSync(resolve(root, localPath))) {
      issues.push(`AGENTS.md 引用了不存在的本地路径：${localPath}。`);
    }
  }

  if (existsSync(packagePath)) {
    const scripts = JSON.parse(readFileSync(packagePath, 'utf8')).scripts ?? {};
    const documentedScripts = new Set(
      [...agents.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)].map((match) => match[1]),
    );
    if (/\bnpm test\b/.test(agents)) documentedScripts.add('test');
    for (const script of documentedScripts) {
      if (!scripts[script]) issues.push(`AGENTS.md 引用了不存在的 package 脚本：${script}。`);
    }
  }
}

if (issues.length > 0) {
  console.error(`Agent 文档检查失败：\n- ${issues.join('\n- ')}`);
  process.exit(1);
}

console.log('Agent 文档检查通过。');
