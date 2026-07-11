import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {
  SHORT_VIDEO_FPS,
  SHORT_VIDEO_TOTAL_SECONDS,
  formatShortVideoTime,
  getShortVideoScene,
} from '../src/shortVideoTimeline';

const fontFamily =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 12,
        background: 'rgba(255,255,255,0.12)',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
          height: '100%',
          background: '#6ee7b7',
        }}
      />
    </div>
  );
}

function isPlaceholderClip(scene: ReturnType<typeof getShortVideoScene>) {
  return scene.clip?.src.includes('placeholder') ?? false;
}

function sceneSourceFrameRange(scene: ReturnType<typeof getShortVideoScene>) {
  const startFrom = Math.round((scene.clip?.startFromSeconds ?? 0) * SHORT_VIDEO_FPS);
  const expectedDuration = Math.round((scene.end - scene.start) * SHORT_VIDEO_FPS);
  const explicitEnd = scene.clip?.endAtSeconds;
  const endAt =
    explicitEnd === undefined
      ? startFrom + expectedDuration
      : Math.round(explicitEnd * SHORT_VIDEO_FPS);

  return { startFrom, endAt };
}

function sourceCameraMotion(sceneId: string, frameInScene: number, duration: number) {
  const progress = Math.max(0, Math.min(frameInScene / Math.max(1, duration), 1));
  const direction = sceneId.length % 2 === 0 ? 1 : -1;
  const scale = 1.055 + progress * 0.035;
  const translateX = direction * (-18 + progress * 36);
  const translateY = -14 + progress * 28;

  return `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

function OriginalMotionVisual({
  scene,
  frame,
}: {
  scene: ReturnType<typeof getShortVideoScene>;
  frame: number;
}) {
  const pulse = Math.sin(frame / 18);
  const drift = Math.sin(frame / 46);
  const sweep = interpolate((frame % 150) / 150, [0, 1], [-260, 1120]);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(145deg, ${scene.accentFrom}55 0%, #07111f 48%, ${scene.accentTo}3d 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          transform: `translateY(${(frame % 72) * -0.28}px)`,
          opacity: 0.62,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 80 + drift * 18,
          top: 500,
          width: 920,
          height: 760,
          borderRadius: 64,
          border: '2px solid rgba(255,255,255,0.12)',
          background: 'rgba(2,6,23,0.28)',
          boxShadow: '0 50px 130px rgba(0,0,0,0.32)',
        }}
      />
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: 142 + index * 162,
            top: 590 + Math.sin(frame / 20 + index) * 18,
            width: 116,
            height: 116,
            borderRadius: 28,
            background:
              index % 2 === 0
                ? `linear-gradient(135deg, ${scene.accentFrom}cc, rgba(255,255,255,0.18))`
                : `linear-gradient(135deg, ${scene.accentTo}cc, rgba(255,255,255,0.14))`,
            boxShadow: '0 22px 70px rgba(0,0,0,0.28)',
            opacity: 0.84,
          }}
        />
      ))}
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: 150,
            right: 150,
            top: 820 + index * 118,
            height: 56,
            borderRadius: 999,
            background:
              'linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0.18), rgba(255,255,255,0.08))',
            opacity: 0.24 + index * 0.08,
            transform: `translateX(${Math.sin(frame / 24 + index) * 38}px)`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: sweep,
          top: 0,
          bottom: 0,
          width: 180,
          transform: 'skewX(-18deg)',
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
          opacity: 0.55,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: -180,
          top: 250,
          width: 520 + pulse * 24,
          height: 520 + pulse * 24,
          borderRadius: '50%',
          background: `${scene.accentTo}33`,
          filter: 'blur(18px)',
        }}
      />
    </>
  );
}

function SceneBackground({
  scene,
  frameStart,
  duration,
  frame,
}: {
  scene: ReturnType<typeof getShortVideoScene>;
  frameStart: number;
  duration: number;
  frame: number;
}) {
  if (!scene.clip) {
    return (
      <>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(145deg, ${scene.accentFrom}44 0%, ${scene.accentTo}30 42%, #020617 92%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 680,
            height: 680,
            borderRadius: '50%',
            top: 120,
            left: -180,
            background: 'rgba(255,255,255,0.16)',
            filter: 'blur(4px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 620,
            height: 620,
            borderRadius: '50%',
            top: 220,
            right: -220,
            background: `${scene.accentTo}33`,
            filter: 'blur(10px)',
          }}
        />
      </>
    );
  }

  if (isPlaceholderClip(scene)) {
    return <OriginalMotionVisual scene={scene} frame={frame} />;
  }

  const frameInScene = Math.max(0, frame - frameStart);
  const transitionFrames = 6;
  const cutFadeIn =
    frameStart === 0
      ? 0
      : interpolate(frameInScene, [0, transitionFrames], [0.46, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
  const cutFadeOut = interpolate(
    duration - frameInScene,
    [0, transitionFrames],
    [0.34, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  return (
    <>
      <Sequence from={frameStart} durationInFrames={duration}>
        <OffthreadVideo
          src={staticFile(scene.clip.src)}
          muted
          startFrom={sceneSourceFrameRange(scene).startFrom}
          endAt={sceneSourceFrameRange(scene).endAt}
          style={{
            position: 'absolute',
            inset: 0,
            width: 'calc(100% + 80px)',
            height: 'calc(100% + 80px)',
            marginLeft: -40,
            marginTop: -40,
            objectFit: 'cover',
            transform: sourceCameraMotion(scene.id, frameInScene, duration),
          }}
        />
      </Sequence>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(2,6,23,0.68) 0%, rgba(2,6,23,0.24) 34%, rgba(2,6,23,0.22) 58%, rgba(2,6,23,0.82) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${scene.accentFrom}22, transparent 36%, ${scene.accentTo}1a 74%, rgba(2,6,23,0.36))`,
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#020617',
          opacity: Math.max(cutFadeIn, cutFadeOut),
        }}
      />
    </>
  );
}

function IntroCard({ scene }: { scene: ReturnType<typeof getShortVideoScene> }) {
  if (scene.clip) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 84,
        right: 84,
        top: 560,
        borderRadius: 42,
        border: '2px solid rgba(255,255,255,0.16)',
        background: 'rgba(2,6,23,0.46)',
        padding: 48,
        boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          fontSize: 54,
          lineHeight: 1.12,
          fontWeight: 950,
        }}
      >
        海外信号混剪
        <br />
        中文判断版
      </div>
    </div>
  );
}

function SceneCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const scene = getShortVideoScene(seconds);
  const progress = seconds / SHORT_VIDEO_TOTAL_SECONDS;
  const sceneFrame = Math.max(0, frame - scene.start * fps + 18);
  const sceneStartFrame = Math.round(scene.start * fps);
  const sceneDuration = Math.round((scene.end - scene.start) * fps);
  const isSourceFootageScene = Boolean(scene.clip);
  const enter = spring({
    fps,
    frame: sceneFrame,
    config: {
      damping: 18,
      stiffness: 130,
      mass: 0.8,
    },
  });
  const y = interpolate(enter, [0, 1], [70, 0]);
  const opacity = interpolate(enter, [0, 0.35, 1], [0, 0.85, 1]);
  const scale = interpolate(enter, [0, 1], [0.98, 1]);

  return (
    <AbsoluteFill
      style={{
        background: '#020617',
        color: '#fff',
        fontFamily,
      }}
    >
      <SceneBackground
        scene={scene}
        frameStart={sceneStartFrame}
        duration={sceneDuration}
        frame={frame}
      />

      <ProgressBar progress={progress} />

      <div
        style={{
          position: 'absolute',
          top: 90,
          left: 84,
          right: 84,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'rgba(255,255,255,0.82)',
          fontSize: 28,
          fontWeight: 800,
        }}
      >
        <span>VideoBrief</span>
        <span>{formatShortVideoTime(seconds)} / 00:38</span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          top: isSourceFootageScene ? 214 : 265,
          opacity,
          transform: `translateY(${y}px) scale(${scale})`,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
            borderRadius: 999,
            border: '2px solid rgba(255,255,255,0.18)',
            background: 'rgba(255,255,255,0.11)',
            padding: isSourceFootageScene ? '12px 20px' : '16px 24px',
            color: '#d1fae5',
            fontSize: isSourceFootageScene ? 22 : 26,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          <span>✦</span>
          <span>{scene.eyebrow}</span>
        </div>

        <h1
          style={{
            margin: isSourceFootageScene ? '30px 0 0' : '50px 0 0',
            fontSize: isSourceFootageScene ? 44 : 58,
            lineHeight: isSourceFootageScene ? 1.14 : 1.08,
            letterSpacing: 0,
            fontWeight: 950,
            maxWidth: isSourceFootageScene ? 820 : 880,
            textShadow:
              '0 5px 18px rgba(0,0,0,0.78), 0 2px 2px rgba(0,0,0,0.7)',
          }}
        >
          {scene.title}
        </h1>
      </div>

      <IntroCard scene={scene} />

      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          bottom: 292,
        }}
      >
        <div
          style={{
            color: '#a7f3d0',
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: 4,
            textShadow: '0 4px 18px rgba(0,0,0,0.55)',
          }}
        >
          判断
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 32,
            lineHeight: 1.28,
            fontWeight: 900,
            textShadow: '0 5px 22px rgba(0,0,0,0.78)',
          }}
        >
          {scene.body}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          bottom: 80,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: '#fff',
            fontSize: 46,
            lineHeight: 1.28,
            fontWeight: 950,
            textShadow:
              '0 5px 18px rgba(0,0,0,0.9), 0 2px 2px rgba(0,0,0,0.82), 0 -1px 2px rgba(0,0,0,0.65)',
          }}
        >
          {scene.subtitle}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function ShortVideoComposition() {
  return <SceneCard />;
}
