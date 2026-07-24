import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  Video,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export interface CanonicalRemotionScene {
  id: string;
  start: number;
  end: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  assetPath: string;
  sourceStart: number;
}

export interface CanonicalProjectCompositionProps {
  [key: string]: unknown;
  title: string;
  audioPath: string;
  scenes: CanonicalRemotionScene[];
  renderWidth: number;
  renderHeight: number;
  mediaFit: 'contain' | 'cover';
}

const fontFamily =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

function publicAsset(path: string) {
  return staticFile(path.replace(/^public\//, ''));
}

function Scene({ scene, mediaFit }: { scene: CanonicalRemotionScene; mediaFit: 'contain' | 'cover' }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const durationInFrames = Math.max(1, Math.round((scene.end - scene.start) * fps));
  const entrance = interpolate(frame, [0, Math.min(12, durationInFrames)], [18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const horizontal = width > height;
  const portrait = height > width;
  const isVideo = /\.(?:mp4|mov|m4v|webm)$/i.test(scene.assetPath);
  const objectFit = mediaFit === 'cover' ? 'cover' as const : 'contain' as const;
  const mediaStyle = { height: '100%', width: '100%', objectFit };
  const media = isVideo ? (
    <Video
      loop
      muted
      src={publicAsset(scene.assetPath)}
      startFrom={Math.max(0, Math.round(scene.sourceStart * fps))}
      style={mediaStyle}
    />
  ) : (
    <Img src={publicAsset(scene.assetPath)} style={mediaStyle} />
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#080b10', fontFamily }}>
      {mediaFit === 'cover' ? media : (
        <div
          style={{
            position: 'absolute',
            left: horizontal ? '15%' : 0,
            right: horizontal ? '15%' : 0,
            top: horizontal ? '12%' : portrait ? '34.2%' : '21.9%',
            bottom: horizontal ? '18%' : undefined,
            aspectRatio: horizontal ? undefined : '16 / 9',
            borderBlock: '2px solid rgba(255,255,255,0.16)',
            background: '#020409',
          }}
        >
          {media}
        </div>
      )}
      <AbsoluteFill
        style={{
          background: horizontal
            ? 'linear-gradient(180deg, rgba(4,7,12,0.72) 0%, rgba(4,7,12,0.04) 30%, rgba(4,7,12,0.06) 70%, rgba(4,7,12,0.92) 100%)'
            : 'linear-gradient(180deg, rgba(4,7,12,0.18) 0%, rgba(4,7,12,0) 30%, rgba(4,7,12,0) 70%, rgba(4,7,12,0.18) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: horizontal ? 72 : 68,
          right: horizontal ? 72 : 68,
          top: horizontal ? 18 : portrait ? 112 : 52,
          transform: `translateY(${entrance}px)`,
        }}
      >
        <div style={{ color: '#7ee2ad', fontSize: horizontal ? 25 : 28, fontWeight: 800, lineHeight: 1.25 }}>
          {scene.eyebrow}
        </div>
        <div
          style={{
            color: '#ffffff',
            fontSize: horizontal ? 52 : portrait ? 66 : 54,
            fontWeight: 900,
            lineHeight: 1.16,
            marginTop: 14,
            overflowWrap: 'anywhere',
            textShadow: '0 3px 18px rgba(0,0,0,0.75)',
          }}
        >
          {scene.title}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: horizontal ? 72 : 68,
          right: horizontal ? 72 : 68,
          bottom: horizontal ? 48 : portrait ? 106 : 48,
          borderTop: '2px solid rgba(255,255,255,0.22)',
          color: '#f4f6f8',
          fontSize: horizontal ? 36 : portrait ? 42 : 38,
          fontWeight: 700,
          lineHeight: 1.38,
          paddingTop: horizontal ? 18 : 26,
          overflowWrap: 'anywhere',
          textShadow: '0 2px 12px rgba(0,0,0,0.82)',
        }}
      >
        {scene.subtitle}
      </div>
    </AbsoluteFill>
  );
}

export function CanonicalProjectComposition({
  title,
  audioPath,
  scenes,
  mediaFit,
}: CanonicalProjectCompositionProps) {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#080b10' }} aria-label={title}>
      {scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={Math.round(scene.start * fps)}
          durationInFrames={Math.max(1, Math.round((scene.end - scene.start) * fps))}
          premountFor={fps}
        >
          <Scene scene={scene} mediaFit={mediaFit} />
        </Sequence>
      ))}
      <Audio src={publicAsset(audioPath)} />
    </AbsoluteFill>
  );
}
