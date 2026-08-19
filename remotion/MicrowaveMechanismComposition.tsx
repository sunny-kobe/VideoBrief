import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const MICROWAVE_MECHANISM_FPS = 30;
export const MICROWAVE_MECHANISM_SCENE_SECONDS = 10;
export const MICROWAVE_MECHANISM_SCENE_COUNT = 6;
export const MICROWAVE_MECHANISM_DURATION_FRAMES =
  MICROWAVE_MECHANISM_FPS * MICROWAVE_MECHANISM_SCENE_SECONDS * MICROWAVE_MECHANISM_SCENE_COUNT;

const palette = {
  night: '#080a0d',
  steel: '#aeb6bd',
  white: '#f7f7f3',
  coral: '#ff5a43',
  orange: '#ff9d2e',
  amber: '#ffd166',
  cyan: '#50d5e5',
  blue: '#3478d4',
  green: '#72d39b',
};

const fontFamily =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

function reveal(frame: number, start = 0, duration = 18) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function SceneShell({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const entry = reveal(frame, 0, 14);
  return (
    <AbsoluteFill
      style={{
        background: `
          linear-gradient(118deg, rgba(255,255,255,0.035), transparent 38%),
          radial-gradient(circle at 72% 44%, rgba(255,90,67,0.08), transparent 34%),
          linear-gradient(150deg, #15191e 0%, ${palette.night} 58%, #050608 100%)
        `,
        color: palette.white,
        fontFamily,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 76,
          top: 54,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          opacity: entry,
          zIndex: 40,
        }}
      >
        <div style={{ width: 46, height: 5, background: palette.coral, boxShadow: `0 0 18px ${palette.coral}` }} />
        <div style={{ fontSize: 25, fontWeight: 760, letterSpacing: 0, color: '#d9dde0' }}>{label}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: 72,
          top: 56,
          fontSize: 21,
          fontWeight: 700,
          color: '#818a93',
          letterSpacing: 0,
          zIndex: 40,
        }}
      >
        {String(index + 1).padStart(2, '0')} / {String(MICROWAVE_MECHANISM_SCENE_COUNT).padStart(2, '0')}
      </div>
      {children}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: `${((index + frame / (MICROWAVE_MECHANISM_SCENE_SECONDS * MICROWAVE_MECHANISM_FPS)) / MICROWAVE_MECHANISM_SCENE_COUNT) * 100}%`,
          height: 7,
          background: `linear-gradient(90deg, ${palette.coral}, ${palette.amber})`,
          boxShadow: '0 -3px 16px rgba(255,90,67,0.35)',
          zIndex: 50,
        }}
      />
    </AbsoluteFill>
  );
}

function Steam({ left, delay = 0 }: { left: number; delay?: number }) {
  const frame = useCurrentFrame();
  const phase = ((frame + delay) % 72) / 72;
  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: 310 + phase * 120,
        width: 22 + phase * 28,
        height: 118,
        borderRadius: '50%',
        borderLeft: '8px solid rgba(255,255,255,0.45)',
        transform: `rotate(${Math.sin((frame + delay) / 12) * 13}deg)`,
        opacity: Math.sin(phase * Math.PI) * 0.72,
        filter: 'blur(4px)',
      }}
    />
  );
}

function FoodBowl({
  x,
  y,
  scale = 1,
  heat = 0.7,
  coldCenter = false,
}: {
  x: number;
  y: number;
  scale?: number;
  heat?: number;
  coldCenter?: boolean;
}) {
  const frame = useCurrentFrame();
  const pulse = (Math.sin(frame / 11) + 1) / 2;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 430, height: 280, transform: `scale(${scale})`, transformOrigin: 'center bottom' }}>
      <div
        style={{
          position: 'absolute',
          left: 34,
          top: 36,
          width: 360,
          height: 174,
          borderRadius: '50%',
          background: `radial-gradient(circle at 52% 48%, ${coldCenter ? '#4c83a8' : '#ffd38c'} 0 22%, #f4a33b 24% 52%, #b44627 72%, #5b2118 100%)`,
          boxShadow: `0 0 ${24 + pulse * 34}px rgba(255,90,67,${0.22 + heat * 0.3})`,
          border: '8px solid rgba(255,229,184,0.38)',
        }}
      >
        {[0, 1, 2, 3, 4].map((item) => (
          <div
            key={item}
            style={{
              position: 'absolute',
              left: 58 + item * 50,
              top: 43 + (item % 2) * 34,
              width: 52,
              height: 28,
              borderRadius: '50%',
              background: item % 2 ? '#7b9e4a' : '#f4d35e',
              boxShadow: 'inset 0 -6px 10px rgba(0,0,0,0.25)',
              transform: `rotate(${item * 17}deg)`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 16,
          top: 130,
          width: 398,
          height: 118,
          borderRadius: '0 0 190px 190px',
          background: 'linear-gradient(180deg, rgba(180,197,208,0.95), #58636e 55%, #252c33)',
          border: '7px solid #bfc8ce',
          borderTop: '4px solid rgba(255,255,255,0.75)',
          boxShadow: '0 30px 45px rgba(0,0,0,0.48), inset 0 -18px 28px rgba(0,0,0,0.28)',
        }}
      />
      <Steam left={132} />
      <Steam left={210} delay={23} />
      <Steam left={284} delay={46} />
    </div>
  );
}

function MicrowaveBody({
  x = 570,
  y = 170,
  scale = 1,
  cutaway = false,
  rotating = false,
  coldCenter = false,
}: {
  x?: number;
  y?: number;
  scale?: number;
  cutaway?: boolean;
  rotating?: boolean;
  coldCenter?: boolean;
}) {
  const frame = useCurrentFrame();
  const angle = rotating ? frame * 1.05 : 0;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 1260, height: 720, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 24,
          background: 'linear-gradient(145deg, #f3f5f6 0%, #9da6ad 22%, #394149 58%, #171c21 100%)',
          border: '3px solid rgba(255,255,255,0.35)',
          boxShadow: '0 55px 90px rgba(0,0,0,0.62), inset 0 2px 3px rgba(255,255,255,0.8)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 44,
          top: 42,
          width: 922,
          height: 614,
          overflow: 'hidden',
          borderRadius: 12,
          border: '16px solid #161b20',
          background: cutaway
            ? 'linear-gradient(160deg, #4f5962, #12171b 48%, #07090b)'
            : 'linear-gradient(145deg, #202931, #07090b 62%)',
          boxShadow: 'inset 0 0 75px rgba(0,0,0,0.9), 0 0 0 2px rgba(255,255,255,0.12)',
        }}
      >
        <div style={{ position: 'absolute', left: 30, right: 30, top: 28, height: 6, background: 'rgba(255,255,255,0.15)' }} />
        <div
          style={{
            position: 'absolute',
            left: 190,
            bottom: 30,
            width: 540,
            height: 150,
            borderRadius: '50%',
            border: `6px solid rgba(80,213,229,${rotating ? 0.7 : 0.34})`,
            background: 'radial-gradient(ellipse, rgba(80,213,229,0.15), rgba(255,255,255,0.03) 60%, transparent 65%)',
            transform: `rotate(${angle}deg)`,
            boxShadow: rotating ? '0 0 35px rgba(80,213,229,0.25)' : 'none',
          }}
        >
          <div style={{ position: 'absolute', left: '50%', top: 5, bottom: 5, width: 3, background: 'rgba(255,255,255,0.22)' }} />
          <div style={{ position: 'absolute', top: '50%', left: 5, right: 5, height: 3, background: 'rgba(255,255,255,0.16)' }} />
        </div>
        <FoodBowl x={280 + (rotating ? Math.sin(frame / 18) * 125 : 0)} y={260} scale={0.82} heat={0.9} coldCenter={coldCenter} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(122deg, rgba(255,255,255,0.16) 0 8%, transparent 9% 52%, rgba(255,255,255,0.06) 53% 61%, transparent 62%)',
            opacity: cutaway ? 0.28 : 0.7,
          }}
        />
      </div>
      <div style={{ position: 'absolute', right: 56, top: 72, width: 190, height: 78, borderRadius: 6, background: '#090d10', border: '3px solid #606970', boxShadow: 'inset 0 0 16px rgba(80,213,229,0.18)' }}>
        <div style={{ color: palette.cyan, fontSize: 34, fontWeight: 700, textAlign: 'center', lineHeight: '72px', textShadow: `0 0 12px ${palette.cyan}` }}>01:20</div>
      </div>
      {[0, 1].map((item) => (
        <div key={item} style={{ position: 'absolute', right: 105, top: 210 + item * 150, width: 92, height: 92, borderRadius: '50%', background: 'linear-gradient(145deg, #dce1e4, #48515a)', border: '7px solid #151a1f', boxShadow: '0 12px 20px rgba(0,0,0,0.38), inset 0 4px 5px rgba(255,255,255,0.58)' }} />
      ))}
    </div>
  );
}

function Wave({ left, top, delay = 0, color = palette.coral }: { left: number; top: number; delay?: number; color?: string }) {
  const frame = useCurrentFrame();
  const travel = ((frame * 10 + delay) % 850) / 850;
  return (
    <div
      style={{
        position: 'absolute',
        left: left + travel * 850,
        top: top + Math.sin((frame + delay) / 8) * 24,
        width: 120,
        height: 10,
        borderRadius: 10,
        background: color,
        boxShadow: `0 0 20px ${color}`,
        opacity: 0.86,
      }}
    />
  );
}

function SceneOne() {
  const frame = useCurrentFrame();
  const first = reveal(frame, 3, 12);
  const second = reveal(frame, 29, 12);
  const zoom = interpolate(frame, [0, 90], [1.08, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <SceneShell index={0} label="你一定遇到过">
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: '72% 48%' }}>
        <MicrowaveBody x={720} y={150} scale={0.88} coldCenter />
      </div>
      <div style={{ position: 'absolute', left: 78, top: 185, zIndex: 30, opacity: first, transform: `translateY(${(1 - first) * 30}px)` }}>
        <div style={{ fontSize: 96, lineHeight: 1.02, fontWeight: 900, letterSpacing: 0 }}>外面已经</div>
        <div style={{ fontSize: 126, lineHeight: 1.02, fontWeight: 950, color: palette.coral, textShadow: '0 0 34px rgba(255,90,67,0.38)', letterSpacing: 0 }}>烫嘴</div>
      </div>
      <div style={{ position: 'absolute', left: 78, top: 470, zIndex: 30, opacity: second, transform: `translateX(${(1 - second) * -35}px)` }}>
        <div style={{ fontSize: 66, lineHeight: 1.12, fontWeight: 880, color: '#dce3e7', letterSpacing: 0 }}>里面怎么还是</div>
        <div style={{ marginTop: 4, fontSize: 106, lineHeight: 1.05, fontWeight: 950, color: palette.cyan, textShadow: '0 0 28px rgba(80,213,229,0.36)', letterSpacing: 0 }}>冷的？</div>
      </div>
      <div style={{ position: 'absolute', left: 84, bottom: 142, fontSize: 32, fontWeight: 700, color: '#aab2b9', opacity: reveal(frame, 70, 20) }}>因为它根本不是从中心开始加热</div>
    </SceneShell>
  );
}

function SceneTwo() {
  const frame = useCurrentFrame();
  return (
    <SceneShell index={1} label="能量是这样进去的">
      <MicrowaveBody x={550} y={155} scale={0.92} cutaway />
      <div style={{ position: 'absolute', right: 235, top: 225, width: 185, height: 138, borderRadius: 12, background: 'radial-gradient(circle at 35% 35%, #ffb056, #b92e24 58%, #38100d)', border: '7px solid #cfdae0', boxShadow: '0 0 45px rgba(255,90,67,0.46), inset 0 0 30px rgba(255,209,102,0.42)' }} />
      {[0, 1, 2, 3].map((item) => <Wave key={item} left={700} top={345 + item * 62} delay={item * 170} />)}
      <div style={{ position: 'absolute', left: 78, top: 220, width: 530 }}>
        <div style={{ fontSize: 74, fontWeight: 920, lineHeight: 1.06, letterSpacing: 0 }}>先把电</div>
        <div style={{ marginTop: 10, fontSize: 88, fontWeight: 950, color: palette.coral, lineHeight: 1.04, letterSpacing: 0 }}>变成微波</div>
        <div style={{ marginTop: 42, fontSize: 38, fontWeight: 720, lineHeight: 1.4, color: '#bac2c8' }}>再把看不见的能量<br />送进金属炉腔</div>
      </div>
    </SceneShell>
  );
}

function Particle({ x, y, phase }: { x: number; y: number; phase: number }) {
  const frame = useCurrentFrame();
  const swing = Math.sin(frame / 5 + phase);
  return (
    <div style={{ position: 'absolute', left: x + swing * 24, top: y + Math.cos(frame / 7 + phase) * 12, width: 128, height: 58, transform: `rotate(${swing * 42}deg)` }}>
      <div style={{ position: 'absolute', left: 0, top: 10, width: 46, height: 46, borderRadius: '50%', background: `radial-gradient(circle at 30% 28%, #dffaff, ${palette.cyan} 45%, #176b7a)`, boxShadow: '0 0 22px rgba(80,213,229,0.4)' }} />
      <div style={{ position: 'absolute', right: 0, top: 0, width: 58, height: 58, borderRadius: '50%', background: `radial-gradient(circle at 30% 28%, #ffe0bd, ${palette.coral} 48%, #8f2118)`, boxShadow: '0 0 22px rgba(255,90,67,0.42)' }} />
      <div style={{ position: 'absolute', left: 40, right: 48, top: 27, height: 7, background: '#ccd4d9', boxShadow: '0 0 8px rgba(255,255,255,0.45)' }} />
    </div>
  );
}

function SceneThree() {
  const frame = useCurrentFrame();
  const field = Math.sin(frame / 5) > 0;
  return (
    <SceneShell index={2} label="食物为什么会变热">
      <div style={{ position: 'absolute', left: 100, right: 100, top: 162, height: 670, overflow: 'hidden', borderTop: '2px solid rgba(255,255,255,0.18)', borderBottom: '2px solid rgba(255,255,255,0.18)', background: 'linear-gradient(90deg, rgba(52,120,212,0.13), rgba(255,90,67,0.16))' }}>
        <div style={{ position: 'absolute', left: field ? 1180 : 120, top: 50, fontSize: 46, fontWeight: 850, color: field ? palette.coral : palette.cyan }}>{field ? '电场推向右边  →' : '←  电场推向左边'}</div>
        {[0, 1, 2].flatMap((row) => [0, 1, 2, 3, 4, 5].map((column) => (
          <Particle key={`${row}-${column}`} x={145 + column * 260} y={180 + row * 150} phase={row * 1.7 + column * 0.65} />
        )))}
        {[0, 1, 2, 3].map((item) => (
          <div key={item} style={{ position: 'absolute', left: 360 + item * 330, top: 280 + (item % 2) * 170, width: 16, height: 16, borderRadius: '50%', background: palette.amber, boxShadow: `0 0 ${22 + ((frame + item * 10) % 22)}px ${palette.amber}` }} />
        ))}
      </div>
      <div style={{ position: 'absolute', left: 100, bottom: 150, fontSize: 58, fontWeight: 900, letterSpacing: 0 }}>
        来回推动 + 彼此碰撞 = <span style={{ color: palette.orange }}>热</span>
      </div>
    </SceneShell>
  );
}

function SceneFour() {
  const frame = useCurrentFrame();
  const innerHeat = interpolate(frame, [30, 250], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <SceneShell index={3} label="为什么大块食物容易外热内冷">
      <div style={{ position: 'absolute', left: 150, top: 150, width: 760, height: 760, borderRadius: '50%', background: 'radial-gradient(circle at 42% 35%, #ffd78f, #d06a2b 43%, #8c2c1f 68%, #43120f)', border: '12px solid #e7b56f', boxShadow: '0 40px 85px rgba(0,0,0,0.58), 0 0 55px rgba(255,90,67,0.28)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 95, borderRadius: '50%', border: '6px solid rgba(255,209,102,0.68)', background: `radial-gradient(circle, rgba(255,90,67,${innerHeat * 0.55}) 0%, rgba(80,213,229,${0.42 - innerHeat * 0.32}) 58%, rgba(255,157,46,0.22) 100%)`, boxShadow: `inset 0 0 ${40 + innerHeat * 80}px rgba(255,90,67,${innerHeat * 0.55})` }} />
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} style={{ position: 'absolute', left: 320 + Math.cos(item * 1.25) * 205, top: 320 + Math.sin(item * 1.25) * 205, width: 95, height: 18, borderRadius: 10, background: palette.coral, transform: `rotate(${item * 72}deg)`, boxShadow: `0 0 18px ${palette.coral}`, opacity: 0.8 }} />
        ))}
      </div>
      <div style={{ position: 'absolute', left: 1040, top: 245, width: 720 }}>
        <div style={{ fontSize: 76, fontWeight: 950, lineHeight: 1.08, letterSpacing: 0 }}>微波只能<br />深入<span style={{ color: palette.orange }}>一段距离</span></div>
        <div style={{ marginTop: 66, fontSize: 42, fontWeight: 760, lineHeight: 1.45, color: '#c8cfd4' }}>更里面的部分<br />还要等热慢慢传进去</div>
      </div>
    </SceneShell>
  );
}

function SceneFive() {
  const frame = useCurrentFrame();
  const angle = frame * 1.25;
  return (
    <SceneShell index={4} label="转盘为什么一直在转">
      <div style={{ position: 'absolute', left: 165, top: 145, width: 1050, height: 760, perspective: 900 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 34, background: 'linear-gradient(145deg, #545e67, #101419 65%)', border: '12px solid #8c969e', boxShadow: 'inset 0 0 70px rgba(0,0,0,0.85), 0 45px 80px rgba(0,0,0,0.5)' }} />
        {[0, 1, 2, 3].map((item) => {
          const hot = item % 2 === 0;
          return <div key={item} style={{ position: 'absolute', left: 80 + item * 240, top: 70, width: 210, height: 610, borderRadius: 90, background: hot ? 'linear-gradient(180deg, rgba(255,90,67,0.18), rgba(255,90,67,0.68), rgba(255,157,46,0.14))' : 'linear-gradient(180deg, rgba(52,120,212,0.12), rgba(80,213,229,0.36), rgba(52,120,212,0.1))', filter: 'blur(7px)', opacity: 0.72 + Math.sin(frame / 9 + item) * 0.12 }} />;
        })}
        <div style={{ position: 'absolute', left: 210, top: 250, width: 640, height: 280, borderRadius: '50%', border: '8px solid rgba(230,239,243,0.68)', background: 'radial-gradient(ellipse, rgba(255,255,255,0.16), rgba(80,213,229,0.08) 62%, transparent 64%)', transform: `rotate(${angle}deg)`, boxShadow: '0 0 34px rgba(80,213,229,0.22)' }}>
          <div style={{ position: 'absolute', left: 120, top: 70, width: 210, height: 135, borderRadius: '50%', background: 'radial-gradient(circle, #ffcb72, #e2692e 65%, #7d2319)', border: '6px solid #f0b35f', boxShadow: '0 0 38px rgba(255,90,67,0.48)' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', right: 92, top: 245, width: 560 }}>
        <div style={{ fontSize: 72, fontWeight: 950, lineHeight: 1.08, letterSpacing: 0 }}>有些地方<span style={{ color: palette.coral }}>热</span><br />有些地方<span style={{ color: palette.cyan }}>冷</span></div>
        <div style={{ marginTop: 58, fontSize: 40, fontWeight: 760, lineHeight: 1.4, color: '#c8cfd4' }}>转起来，让每一部分<br />都轮流经过热区</div>
      </div>
    </SceneShell>
  );
}

function SceneSix() {
  const frame = useCurrentFrame();
  const steps = [
    ['01', '翻个面', '让两边都照顾到', palette.coral],
    ['02', '搅一搅', '把热点和冷点混开', palette.cyan],
    ['03', '等一会儿', '让热继续往里走', palette.amber],
  ] as const;
  return (
    <SceneShell index={5} label="这样加热会更均匀">
      <div style={{ position: 'absolute', left: 112, top: 162, right: 112, display: 'grid', gap: 22 }}>
        {steps.map((step, index) => {
          const shown = reveal(frame, 15 + index * 38, 16);
          return (
            <div key={step[0]} style={{ height: 210, display: 'grid', gridTemplateColumns: '145px 1fr 620px', alignItems: 'center', borderTop: '2px solid rgba(255,255,255,0.2)', opacity: shown, transform: `translateY(${(1 - shown) * 26}px)` }}>
              <div style={{ fontSize: 74, fontWeight: 950, color: step[3], textShadow: `0 0 25px ${step[3]}55` }}>{step[0]}</div>
              <div style={{ fontSize: 66, fontWeight: 940, letterSpacing: 0 }}>{step[1]}</div>
              <div style={{ fontSize: 36, fontWeight: 720, color: '#aeb7bd' }}>{step[2]}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 112, bottom: 135, fontSize: 31, fontWeight: 700, color: palette.green, opacity: reveal(frame, 142, 18) }}>
        微波炉加热很快，但“快”不等于每一处都一样热
      </div>
    </SceneShell>
  );
}

const scenes = [SceneOne, SceneTwo, SceneThree, SceneFour, SceneFive, SceneSix];

export function MicrowaveMechanismComposition() {
  const { fps } = useVideoConfig();
  const sceneFrames = MICROWAVE_MECHANISM_SCENE_SECONDS * fps;
  return (
    <AbsoluteFill style={{ background: palette.night }}>
      {scenes.map((Scene, index) => (
        <Sequence key={index} from={index * sceneFrames} durationInFrames={sceneFrames} premountFor={fps}>
          <Scene />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
