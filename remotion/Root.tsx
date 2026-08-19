import { Composition } from 'remotion';
import { ShortVideoComposition } from './ShortVideoComposition';
import {
  CanonicalProjectComposition,
  type CanonicalProjectCompositionProps,
} from './CanonicalProjectComposition';
import {
  SHORT_VIDEO_FPS,
  SHORT_VIDEO_HEIGHT,
  SHORT_VIDEO_TOTAL_SECONDS,
  SHORT_VIDEO_WIDTH,
} from '../src/shortVideoTimeline';
import {
  MICROWAVE_MECHANISM_DURATION_FRAMES,
  MICROWAVE_MECHANISM_FPS,
  MicrowaveMechanismComposition,
} from './MicrowaveMechanismComposition';

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="WeeklyAiShort"
        component={ShortVideoComposition}
        durationInFrames={SHORT_VIDEO_TOTAL_SECONDS * SHORT_VIDEO_FPS}
        fps={SHORT_VIDEO_FPS}
        width={SHORT_VIDEO_WIDTH}
        height={SHORT_VIDEO_HEIGHT}
      />
      <Composition<any, CanonicalProjectCompositionProps>
        id="CanonicalProject"
        component={CanonicalProjectComposition}
        durationInFrames={SHORT_VIDEO_FPS}
        fps={SHORT_VIDEO_FPS}
        width={SHORT_VIDEO_WIDTH}
        height={SHORT_VIDEO_HEIGHT}
        defaultProps={{ title: '', audioPath: '', scenes: [], renderWidth: 1080, renderHeight: 1920, mediaFit: 'contain' } satisfies CanonicalProjectCompositionProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            Math.ceil((props.scenes.at(-1)?.end ?? 1) * SHORT_VIDEO_FPS),
          ),
          width: props.renderWidth,
          height: props.renderHeight,
        })}
      />
      <Composition
        id="MicrowaveMechanismAsset"
        component={MicrowaveMechanismComposition}
        durationInFrames={MICROWAVE_MECHANISM_DURATION_FRAMES}
        fps={MICROWAVE_MECHANISM_FPS}
        width={1920}
        height={1080}
      />
    </>
  );
}
