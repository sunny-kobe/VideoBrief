import { Composition } from 'remotion';
import { ShortVideoComposition } from './ShortVideoComposition';
import {
  SHORT_VIDEO_FPS,
  SHORT_VIDEO_HEIGHT,
  SHORT_VIDEO_TOTAL_SECONDS,
  SHORT_VIDEO_WIDTH,
} from '../src/shortVideoTimeline';

export function RemotionRoot() {
  return (
    <Composition
      id="WeeklyAiShort"
      component={ShortVideoComposition}
      durationInFrames={SHORT_VIDEO_TOTAL_SECONDS * SHORT_VIDEO_FPS}
      fps={SHORT_VIDEO_FPS}
      width={SHORT_VIDEO_WIDTH}
      height={SHORT_VIDEO_HEIGHT}
    />
  );
}
