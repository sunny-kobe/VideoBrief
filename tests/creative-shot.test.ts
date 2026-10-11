import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  buildCreativeShotInput, creativeShotDependency, creativeShotFingerprint, getCreativeShotReceiptStatus,
  parseCreativeShotArgs, prepareCreativeShot, resolvePreviewFrames, safeWorkspacePath,
} from '../scripts/lib/creative-shot.mjs';

function project() {
  return {
    id: 'sample', title: '微波炉', brief: { objective: '解释热量怎样向内部传导' },
    render: { width: 1920, height: 1080, fps: 30 },
    sources: [
      { id: 'source-1', label: '公开资料', originUrl: 'https://example.com/source', rightsStatus: 'review_required', analysis: { extractedText: '不要发送长分析' } },
      { id: 'unrelated', label: '无关来源' },
    ],
    scenes: [{
      id: 'scene-1', enabled: true, title: '热量向中心传导', narration: '表面先热，热量再向中心走。',
      visualRequirement: '用温差和移动路径呈现外层到中心的传导',
      sourceId: 'source-1', sourceStart: 2, sourceEnd: 8, mediaPlaybackRate: 1,
      sourceReferences: [{ sourceId: 'source-1', locatorType: 'line', lineStart: 2, lineEnd: 5 }],
      selectedCandidateId: 'clip-1', candidates: [{ id: 'clip-1', sourceId: 'source-1', sourceStart: 2, sourceEnd: 8, mediaType: 'video' }],
    }],
  };
}

test('单幕创作简报准确投影旁白、目标规格和锁定窗口，排除无关长资料', () => {
  const input = buildCreativeShotInput(project(), 'scene-1');
  assert.equal(input.scene.narration, '表面先热，热量再向中心走。');
  assert.deepEqual(input.spec, { width: 1920, height: 1080, fps: 30, durationSeconds: 6, durationInFrames: 180 });
  assert.deepEqual(input.lockedWindow, { sourceId: 'source-1', sourceStart: 2, sourceEnd: 8, mediaPlaybackRate: 1 });
  assert.equal(input.referencedSources.length, 1);
  assert.equal('analysis' in input.referencedSources[0], false);
  const custom = buildCreativeShotInput(project(), 'scene-1', 7.05);
  assert.equal(custom.spec.durationInFrames, 212);
  assert.equal(custom.lockedWindow.sourceEnd, 8);
  assert.throws(() => buildCreativeShotInput(project(), 'missing'), /场景/);
});

test('预览始中末帧和附加帧合法，不允许超出帧数或小数帧', () => {
  assert.deepEqual(resolvePreviewFrames(180, [30, 179]), [0, 30, 90, 179]);
  assert.deepEqual(resolvePreviewFrames(1), [0]);
  assert.throws(() => resolvePreviewFrames(180, [180]), /帧/);
  assert.throws(() => resolvePreviewFrames(180, [3.5]), /帧/);
});

test('工作包只写output，保留canonical字节且拒绝同take输入覆盖', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-creative-test-'));
  try {
    mkdirSync(join(root, 'content'), { recursive: true });
    const briefPath = join(root, 'content/project.json');
    const original = JSON.stringify(project());
    writeFileSync(briefPath, original);
    const result = prepareCreativeShot({ workspaceRoot: root, briefPath, sceneId: 'scene-1', workDir: 'output/shots', take: 'take-01' });
    assert.equal(readFileSync(briefPath, 'utf8'), original);
    assert.match(readFileSync(join(result.takeDir, 'shot-brief.md'), 'utf8'), /表面先热/);
    const receipt = JSON.parse(readFileSync(join(result.takeDir, 'prepared-receipt.json'), 'utf8'));
    assert.equal(receipt.status, 'prepared');
    assert.equal(receipt.inputFingerprint, creativeShotFingerprint(result.input));
    const changed = project();
    changed.scenes[0].narration = '新的旁白';
    writeFileSync(briefPath, JSON.stringify(changed));
    assert.throws(() => prepareCreativeShot({ workspaceRoot: root, briefPath, sceneId: 'scene-1', workDir: 'output/shots', take: 'take-01' }), /新.*take|过期/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('同take继承prepare时长，显式改时长拒绝，新take使用原窗口', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-creative-test-'));
  try {
    mkdirSync(join(root, 'content'), { recursive: true });
    const briefPath = join(root, 'content/project.json');
    writeFileSync(briefPath, JSON.stringify(project()));
    const options = { workspaceRoot: root, briefPath, sceneId: 'scene-1', workDir: 'output/shots', take: 'take-01' };
    const prepared = prepareCreativeShot({ ...options, durationSeconds: 8 });
    assert.equal(prepared.input.spec.durationInFrames, 240);
    const inherited = prepareCreativeShot(options);
    assert.equal(inherited.input.spec.durationSeconds, 8);
    assert.equal(inherited.effectiveDurationOverride, 8);
    assert.throws(() => prepareCreativeShot({ ...options, durationSeconds: 9 }), /新.*take|过期/);
    const newTake = prepareCreativeShot({ ...options, take: 'take-02' });
    assert.equal(newTake.input.spec.durationSeconds, 6);
    assert.equal(newTake.effectiveDurationOverride, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('路径越界、输出目录和符号链接越界被拒绝', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-creative-test-'));
  const outside = mkdtempSync(join(tmpdir(), 'videobrief-creative-outside-'));
  try {
    mkdirSync(join(root, 'output'));
    writeFileSync(join(outside, 'entry.tsx'), 'export {};');
    symlinkSync(outside, join(root, 'output/escape'));
    mkdirSync(join(root, 'content'));
    symlinkSync(join(root, 'content'), join(root, 'output/inside-escape'));
    symlinkSync(join(outside, 'not-created'), join(root, 'output/broken'));
    assert.throws(() => safeWorkspacePath(root, '../entry.tsx'), /工作区/);
    assert.throws(() => safeWorkspacePath(root, 'content/new', { output: true }), /output/);
    assert.throws(() => safeWorkspacePath(root, 'output/escape/entry.tsx', { mustExist: true }), /符号链接|工作区/);
    assert.throws(() => safeWorkspacePath(root, 'output/escape/new/clip.mp4', { output: true }), /符号链接|工作区/);
    assert.throws(() => safeWorkspacePath(root, 'output/inside-escape/clip.mp4', { output: true }), /output/);
    assert.throws(() => safeWorkspacePath(root, 'output/broken/clip.mp4', { output: true }), /符号链接/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('Webpack目录依赖可校验边界，但不能被当作文件读取或允许越界', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-creative-test-'));
  const outside = mkdtempSync(join(tmpdir(), 'videobrief-creative-outside-'));
  try {
    mkdirSync(join(root, 'node_modules'));
    assert.doesNotThrow(() => safeWorkspacePath(root, 'node_modules', { mustExist: true, kind: 'any' }));
    assert.throws(() => safeWorkspacePath(root, 'node_modules', { mustExist: true }), /文件/);
    symlinkSync(outside, join(root, 'outside-modules'));
    assert.throws(() => safeWorkspacePath(root, 'outside-modules', { mustExist: true, kind: 'any' }), /符号链接|工作区/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('Webpack解析器父目录元信息可忽略，实际外部文件和目录仍拒绝', () => {
  const root = mkdtempSync(join(tmpdir(), 'videobrief-creative-test-'));
  const outside = mkdtempSync(join(tmpdir(), 'videobrief-creative-outside-'));
  try {
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'entry.tsx'), 'export {};');
    writeFileSync(join(outside, 'outside.tsx'), 'export {};');
    assert.equal(creativeShotDependency(root, dirname(root)), null);
    assert.equal(creativeShotDependency(root, join(root, 'node_modules')), null);
    assert.equal(creativeShotDependency(root, join(root, 'entry.tsx'))?.path, 'entry.tsx');
    assert.throws(() => creativeShotDependency(root, join(outside, 'outside.tsx')), /工作区/);
    assert.throws(() => creativeShotDependency(root, outside), /工作区/);
    symlinkSync(dirname(root), join(root, 'escape-parent'));
    assert.throws(() => creativeShotDependency(root, join(root, 'escape-parent')), /符号链接|工作区/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('输入、入口或预览产物变化令凭证过期，技术检查不会冒称语义通过', () => {
  const input = buildCreativeShotInput(project(), 'scene-1');
  const receipt = { status: 'awaiting_visual_review', inputFingerprint: creativeShotFingerprint(input), entrySha256: 'entry-a', artifacts: [{ path: 'frame.png', sha256: 'frame-a' }] };
  assert.equal(getCreativeShotReceiptStatus(receipt, input, 'entry-a', { 'frame.png': 'frame-a' }).status, 'awaiting_visual_review');
  const changed = project();
  changed.scenes[0].visualRequirement = '改为新的机制';
  assert.equal(getCreativeShotReceiptStatus(receipt, buildCreativeShotInput(changed, 'scene-1'), 'entry-a', { 'frame.png': 'frame-a' }).status, 'stale');
  assert.equal(getCreativeShotReceiptStatus(receipt, input, 'entry-b', { 'frame.png': 'frame-a' }).status, 'stale');
  assert.equal(getCreativeShotReceiptStatus(receipt, input, 'entry-a', { 'frame.png': 'frame-b' }).status, 'stale');
  const withDependency = { ...receipt, authoredDependencies: [{ path: 'mechanism.tsx', sha256: 'mechanism-a' }] };
  assert.equal(getCreativeShotReceiptStatus(withDependency, input, 'entry-a', { 'frame.png': 'frame-a' }, { 'mechanism.tsx': 'mechanism-b' }).status, 'stale');
  const unrelated = { ...project(), updatedAt: 'new timestamp', market_status: 'validated' };
  assert.equal(getCreativeShotReceiptStatus(receipt, buildCreativeShotInput(unrelated, 'scene-1'), 'entry-a', { 'frame.png': 'frame-a' }).status, 'awaiting_visual_review');
});

test('命令拒绝未知参数、错误动作和非法take、时长或帧列表', () => {
  assert.equal(parseCreativeShotArgs(['prepare', '--brief=a.json', '--scene=one', '--take=take-01']).take, 'take-01');
  assert.throws(() => parseCreativeShotArgs(['preview', '--unknown=yes']), /未知/);
  assert.throws(() => parseCreativeShotArgs(['publish']), /动作/);
  assert.throws(() => parseCreativeShotArgs(['prepare', '--brief=a', '--scene=b', '--take=../bad']), /take/);
  assert.throws(() => parseCreativeShotArgs(['prepare', '--brief=a', '--scene=b', '--duration=0']), /duration/);
  assert.throws(() => parseCreativeShotArgs(['preview', '--brief=a', '--scene=b', '--entry=e', '--composition=C', '--frames=3.5']), /frames/);
});
