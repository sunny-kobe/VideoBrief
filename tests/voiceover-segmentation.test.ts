import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseSilenceIntervals,
  planVoiceSegments,
  resolveAudibleVoiceWindow,
} from '../scripts/lib/voiceover-segmentation.mjs';

const detectorOutput = `
[silencedetect] silence_start: 0
[silencedetect] silence_end: 0.469167 | silence_duration: 0.469167
[silencedetect] silence_start: 3.11067
[silencedetect] silence_end: 3.97879 | silence_duration: 0.868125
[silencedetect] silence_start: 11.7097
[silencedetect] silence_end: 12.7242 | silence_duration: 1.01458
[silencedetect] silence_start: 20.3251
[silencedetect] silence_end: 21.3679 | silence_duration: 1.04279
[silencedetect] silence_start: 27.9685
[silencedetect] silence_end: 29.1532 | silence_duration: 1.18471
[silencedetect] silence_start: 34.9767
[silencedetect] silence_end: 36.1163 | silence_duration: 1.1395
[silencedetect] silence_start: 43.0469
[silencedetect] silence_end: 44.2146 | silence_duration: 1.16767
[silencedetect] silence_start: 50.5526
[silencedetect] silence_end: 51 | silence_duration: 0.447375
`;

test('plans one voice segment per scene from reliable inter-scene pauses', () => {
  const silences = parseSilenceIntervals(detectorOutput);
  const segments = planVoiceSegments({ silences, audioDuration: 51, segmentCount: 7, protection: 0 });

  assert.equal(segments.length, 7);
  assert.deepEqual(
    segments.map(({ start, end }) => [start, end]),
    [
      [0.469167, 3.11067],
      [3.97879, 11.7097],
      [12.7242, 20.3251],
      [21.3679, 27.9685],
      [29.1532, 34.9767],
      [36.1163, 43.0469],
      [44.2146, 50.5526],
    ],
  );
});

test('rejects ambiguous segmentation instead of guessing scene boundaries', () => {
  const silences = parseSilenceIntervals(detectorOutput).filter((silence) => silence.start !== 34.9767);
  assert.throws(
    () => planVoiceSegments({ silences, audioDuration: 51, segmentCount: 7 }),
    /Expected at least 6 reliable inter-scene silence\(s\), found 5/,
  );
});

test('uses text weights to select scene boundaries from surplus natural pauses', () => {
  const silences = parseSilenceIntervals(detectorOutput);
  silences.splice(2, 0, { start: 8, end: 8.9, duration: 0.9 });
  silences.splice(5, 0, { start: 25, end: 25.9, duration: 0.9 });
  const segments = planVoiceSegments({
    silences,
    audioDuration: 51,
    segmentCount: 7,
    segmentWeights: [4, 12, 12, 12, 12, 12, 12],
    protection: 0,
  });

  assert.equal(segments.length, 7);
  assert.deepEqual(
    segments.map(({ trailingBoundary }) => trailingBoundary?.start ?? null),
    [3.11067, 11.7097, 20.3251, 25, 34.9767, 43.0469, null],
  );
});

test('keeps a valid 0.6 second scene boundary when longer internal pauses also exist', () => {
  const segments = planVoiceSegments({
    silences: [
      { start: 0, end: 0.38, duration: 0.38 },
      { start: 3.379, end: 4.011, duration: 0.632 },
      { start: 5.262, end: 5.864, duration: 0.602 },
      { start: 9.094, end: 10.104, duration: 1.01 },
      { start: 15.442, end: 16.123, duration: 0.681 },
      { start: 19.503, end: 20.5, duration: 0.997 },
      { start: 22.892, end: 23.512, duration: 0.62 },
      { start: 27.903, end: 28.768, duration: 0.865 },
      { start: 33.233, end: 34.285, duration: 1.052 },
      { start: 39.64, end: 40.647, duration: 1.007 },
      { start: 43.122, end: 43.753, duration: 0.631 },
      { start: 47, end: 47.28, duration: 0.28 },
    ],
    audioDuration: 47.28,
    segmentCount: 7,
    segmentWeights: [18, 26, 52, 40, 24, 31, 33],
    protection: 0,
  });

  assert.deepEqual(
    segments.map(({ trailingBoundary }) => trailingBoundary?.start ?? null),
    [3.379, 9.094, 19.503, 27.903, 33.233, 39.64, null],
  );
});

test('surplus pauses still require explicit text weights', () => {
  const silences = parseSilenceIntervals(detectorOutput);
  silences.splice(2, 0, { start: 8, end: 8.9, duration: 0.9 });
  assert.throws(
    () => planVoiceSegments({ silences, audioDuration: 51, segmentCount: 7 }),
    /valid segmentWeights are required/,
  );
});

test('rejects incomplete silence detector output', () => {
  assert.throws(
    () => parseSilenceIntervals('silence_start: 1.2'),
    /1 start\(s\) and 0 end\(s\)/,
  );
});

test('trims only leading and trailing silence while preserving internal pauses', () => {
  assert.deepEqual(resolveAudibleVoiceWindow({
    silences: [
      { start: 0, end: 0.2, duration: 0.2 },
      { start: 1.4, end: 1.8, duration: 0.4 },
      { start: 4.1, end: 5, duration: 0.9 },
    ],
    audioDuration: 5,
    protection: 0.04,
  }), {
    start: 0.16,
    end: 4.14,
    duration: 3.9799999999999995,
    trimmed: true,
  });
});

test('keeps the full voice when no edge silence is detected', () => {
  assert.deepEqual(resolveAudibleVoiceWindow({
    silences: [{ start: 1, end: 1.3, duration: 0.3 }],
    audioDuration: 3,
  }), {
    start: 0,
    end: 3,
    duration: 3,
    trimmed: false,
  });
});
