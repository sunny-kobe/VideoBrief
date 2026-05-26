/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ResearchNote } from '../types';

/**
 * Generates a clean structured Markdown file text for the target ResearchNote
 */
export function generateMarkdownNote(note: ResearchNote): string {
  let md = `# ${note.title}\n\n`;
  
  md += `## 📺 视频元信息\n`;
  md += `- **源链接**: ${note.videoUrl}\n`;
  md += `- **频道**: ${note.channelName}\n`;
  md += `- **时长**: ${note.duration}\n`;
  md += `- **转译方向**: ${note.languageDirection}\n\n`;
  
  md += `## 🎯 一句话结论\n> ${note.conclusion}\n\n`;
  
  md += `## 📝 三行核心摘要\n`;
  note.coreSummaries.forEach((summary, index) => {
    md += `${index + 1}. **${summary.label}**: ${summary.description}\n`;
  });
  md += `\n`;
  
  md += `## 👥 适合目标读者群体\n`;
  note.audiences.forEach((aud) => {
    md += `- ${aud}\n`;
  });
  md += `\n`;
  
  md += `## 🚫 原片局限缺陷\n`;
  note.limitations.forEach((lim) => {
    md += `- ${lim}\n`;
  });
  md += `\n`;
  
  md += `## 📅 分章节详细笔记\n\n`;
  md += `| 时间戳 | 章节段落主题 | 深度透析观点 |\n`;
  md += `| :---: | :--- | :--- |\n`;
  note.chapters.forEach((ch) => {
    md += `| **${ch.timestamp}** | ${ch.title} | ${ch.content} |\n`;
  });
  md += `\n`;
  
  md += `## 💡 深度关键观点\n`;
  note.insights.forEach((ins) => {
    md += `### 📌 ${ins.title}\n${ins.description}\n\n`;
  });
  
  md += `## 📖 重要概念名词解释\n`;
  note.concepts.forEach((concept) => {
    md += `### 🏷️ ${concept.concept}\n${concept.explanation}\n\n`;
  });
  
  md += `## 🚀 可执行行动方针清单\n`;
  note.actions.forEach((act) => {
    const priorityEmoji = act.priority === 'high' ? '🔴' : act.priority === 'medium' ? '🟡' : '🟢';
    md += `- [ ] ${priorityEmoji} **${act.task}**\n  _${act.context}_\n`;
  });
  md += `\n`;
  
  md += `## ❓ 值得延伸追问的问题\n`;
  note.questions.forEach((q) => {
    md += `- ${q}\n`;
  });
  md += `\n`;
  
  md += `--- \n_免责声明: ${note.disclaimer}_\n`;
  
  return md;
}
