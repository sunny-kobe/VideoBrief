import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseDouyinWorkList,
  parseTencentPostList,
  parseXiaohongshuNotes,
  parseYoutubeStudioRows,
} from '../src/publicationLedger';

const observedAt = '2026-08-16T10:00:00.000Z';

test('parses Douyin work metrics without losing zero values', () => {
  const [result] = parseDouyinWorkList({
    aweme_list: [{
      item_id: 'douyin-01', item_title: '测试标题', desc: '测试标题 #标签',
      statistics: { play_count: 31, digg_count: 0, comment_count: 0, share_count: 0, collect_count: 0 },
    }],
  }, observedAt);
  assert.equal(result.externalId, 'douyin-01');
  assert.equal(result.snapshot.viewCount, 31);
  assert.equal(result.snapshot.likeCount, 0);
  assert.equal(result.effectiveDescription, '测试标题 #标签');
});

test('parses Xiaohongshu note metrics and effective truncated title', () => {
  const [result] = parseXiaohongshuNotes({
    data: { notes: [{
      id: 'xhs-01', display_title: '平台截断标题', view_count: 178, likes: 6,
      comments_count: 0, shared_count: 0, collected_count: 3,
    }] },
  }, observedAt);
  assert.equal(result.effectiveTitle, '平台截断标题');
  assert.equal(result.snapshot.favoriteCount, 3);
});

test('parses Tencent published-state metrics while preserving absent public URL semantics', () => {
  const [result] = parseTencentPostList({
    data: { list: [{
      exportId: 'export/tencent-01', status: 1, readCount: 83, likeCount: 0,
      commentCount: 0, forwardCount: 0, favCount: 0, followCount: 0,
      fullPlayRate: 0.25, avgPlayTimeSec: 8.5, fastFlipRate: 0.4,
      desc: { description: '完整标题\n#标签\n正文' },
    }] },
  }, observedAt);
  assert.equal(result.effectiveTitle, '完整标题');
  assert.equal(result.snapshot.viewCount, 83);
  assert.equal(result.snapshot.completionRate, 25);
  assert.match(result.snapshot.note, /status=1/);
});

test('parses YouTube Studio views/comments and keeps unavailable likes null', () => {
  const [result] = parseYoutubeStudioRows([{
    text: '1:17\n测试标题\n测试简介\n—\n公开\n2026年8月16日\n发布日期\n0\n0',
    links: [
      { href: 'https://studio.youtube.com/video/youtube-01/edit', text: '1:17' },
      { href: 'https://studio.youtube.com/video/youtube-01/edit', text: '测试标题' },
      { href: 'https://studio.youtube.com/video/youtube-01/comments', text: '0' },
    ],
  }], observedAt);
  assert.equal(result.externalId, 'youtube-01');
  assert.equal(result.effectiveTitle, '测试标题');
  assert.equal(result.snapshot.viewCount, 0);
  assert.equal(result.snapshot.commentCount, 0);
  assert.equal(result.snapshot.likeCount, null);
});
