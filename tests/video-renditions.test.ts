import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renditionBundleFingerprint,
  resolveProjectRendition,
  resolveProjectRenditions,
} from '../scripts/lib/video-renditions.mjs';

test('legacy projects resolve to one primary rendition', () => {
  const [rendition] = resolveProjectRenditions({
    brief: { aspectRatio: '9:16' },
    render: { width: 1080, height: 1920 },
    outputs: { outputVideo: 'a.mp4', publicRender: 'public/a.mp4', workDir: 'work/a' },
  });
  assert.deepEqual(rendition, {
    id: 'primary', label: '主版本', primary: true, aspectRatio: '9:16',
    width: 1080, height: 1920, mediaFit: 'contain', mediaBackground: 'solid',
    outputVideo: 'a.mp4', publicRender: 'public/a.mp4', workDir: 'work/a',
  });
});

test('configured renditions keep one explicit primary and distinct outputs', () => {
  const project = {
    renditions: [
      { id: 'vertical', primary: true, aspectRatio: '9:16', width: 1080, height: 1920, mediaFit: 'contain', mediaBackground: 'blurred-fill', outputVideo: 'v.mp4', publicRender: 'public/v.mp4', workDir: 'work/v' },
      { id: 'landscape', aspectRatio: '16:9', width: 1920, height: 1080, mediaFit: 'cover', mediaBackground: 'solid', outputVideo: 'h.mp4', publicRender: 'public/h.mp4', workDir: 'work/h' },
    ],
  };
  assert.equal(resolveProjectRendition(project).id, 'vertical');
  assert.equal(resolveProjectRendition(project, 'landscape').width, 1920);
  assert.equal(resolveProjectRendition(project, 'vertical').mediaFit, 'contain');
  assert.equal(resolveProjectRendition(project, 'landscape').mediaFit, 'cover');
  assert.equal(resolveProjectRendition(project, 'vertical').mediaBackground, 'blurred-fill');
  assert.equal(resolveProjectRendition(project, 'landscape').mediaBackground, 'solid');
});

test('bundle fingerprint is stable across rendition order and changes with either video', () => {
  const first = renditionBundleFingerprint([
    { id: 'vertical', videoSha256: 'v1' }, { id: 'landscape', videoSha256: 'h1' },
  ]);
  const reordered = renditionBundleFingerprint([
    { id: 'landscape', videoSha256: 'h1' }, { id: 'vertical', videoSha256: 'v1' },
  ]);
  assert.equal(first, reordered);
  assert.notEqual(first, renditionBundleFingerprint([
    { id: 'vertical', videoSha256: 'v2' }, { id: 'landscape', videoSha256: 'h1' },
  ]));
});
