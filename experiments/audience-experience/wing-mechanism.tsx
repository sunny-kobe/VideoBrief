import React from 'react';
import { AbsoluteFill, Composition, interpolate, registerRoot, useCurrentFrame } from 'remotion';

// Same 279 frames and narration as the existing scene; this take changes only the visual.
// A qualitative bending/twisting feedback diagram, not a simulated flight or measured mode.
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

function WingMechanism() {
  const frame = useCurrentFrame();
  const time = frame / 30;
  const amplitude = interpolate(frame, [0, 69, 112, 172, 237, 278], [16, 28, 42, 80, 123, 123], clamp);
  const displacement = Math.sin(time * 7.2) * amplitude;
  const twist = Math.sin(time * 7.2 + 0.45) * amplitude * 0.2;
  const feedback = interpolate(frame, [100, 116], [0, 1], clamp);
  const diagnosis = interpolate(frame, [237, 250], [0, 1], clamp);
  const caption = frame < 69 ? '气流跟着变' : frame < 172 ? '抖动被推大' : frame < 237 ? '相互放大' : '颤振';
  const wing = `M420 500 C770 448 1060 ${470 + displacement * 0.25} 1470 ${478 + displacement - twist} L1500 ${553 + displacement + twist} C1050 ${583 + displacement * 0.25} 765 568 420 581 Z`;

  return <AbsoluteFill style={{ background: '#f5f3ed', fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif' }}>
    <svg width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="wing" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#fcffff" /><stop offset="0.48" stopColor="#b5c7ce" /><stop offset="1" stopColor="#6e8993" />
        </linearGradient>
        <linearGradient id="root" x1="0" x2="1"><stop stopColor="#203c45" /><stop offset="1" stopColor="#49606a" /></linearGradient>
        <marker id="flowArrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="8" markerHeight="8" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#277b89" strokeWidth="2" /></marker>
        <marker id="forceArrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1 L11 6 L1 11" fill="none" stroke="#c75b35" strokeWidth="2" /></marker>
        <filter id="shadow"><feGaussianBlur stdDeviation="16" /></filter>
      </defs>

      <text x="110" y="109" fontSize="42" fill="#64716e">机翼与气流</text>
      <text x="1810" y="109" fontSize="38" fill="#64716e" textAnchor="end">机制示意</text>
      <text x="110" y="248" fontSize="104" fontWeight="700" fill="#173c46">{caption}</text>
      <line x1="112" y1="295" x2="250" y2="295" stroke={frame >= 69 ? '#c75b35' : '#277b89'} strokeWidth="9" />

      <ellipse cx="980" cy="760" rx="590" ry="30" fill="#1a4048" opacity="0.1" filter="url(#shadow)" />
      {[0, 1, 2, 3].map((i) => {
        const y = 370 + i * 110;
        const bend = Math.sin(time * 7.2 + i * 0.35) * amplitude * 0.42;
        return <g key={i} opacity={i === 1 ? 0.95 : 0.35}>
          <path d={`M135 ${y} C565 ${y} 1000 ${y + bend} 1760 ${y + bend * 0.65}`} fill="none" stroke="#277b89" strokeWidth={i === 1 ? 7 : 4} markerEnd="url(#flowArrow)" />
          <path d={`M135 ${y} C565 ${y} 1000 ${y + bend} 1760 ${y + bend * 0.65}`} fill="none" stroke="#2c8b99" strokeWidth="9" strokeDasharray="5 130" strokeDashoffset={-frame * 8} opacity="0.6" />
        </g>;
      })}

      <path d="M420 500 C770 448 1060 470 1470 478 L1500 553 C1050 583 765 568 420 581 Z" fill="none" stroke="#657a7c" strokeWidth="3" strokeDasharray="12 12" opacity="0.3" />
      <path d={wing} fill="url(#wing)" stroke="#456774" strokeWidth="4" />
      <path d={`M438 513 C790 470 1090 ${498 + displacement * 0.25} 1470 ${509 + displacement}`} fill="none" stroke="#f3fbfc" strokeWidth="4" opacity="0.65" />
      <rect x="310" y="420" width="116" height="245" rx="15" fill="url(#root)" />
      {[460, 525, 590].map((y) => <circle key={y} cx="368" cy={y} r="9" fill="#a0b0b4" />)}

      <g opacity={feedback}>
        <circle cx="1484" cy={528 + displacement} r="22" fill="#c75b35" stroke="#fff7ee" strokeWidth="6" />
        <path d={`M1580 ${528 + displacement} L1580 ${528 + displacement + Math.sin(time * 7.2 + 0.8) * 98}`} fill="none" stroke="#c75b35" strokeWidth="11" markerEnd="url(#forceArrow)" />
      </g>
      <text x="1810" y="835" textAnchor="end" fontSize="42" fill="#c75b35" opacity={diagnosis}>弯曲与扭转耦合</text>
      {/* y >= 890 stays clear for the existing production subtitles. */}
    </svg>
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="WingMechanism" component={WingMechanism} width={1920} height={1080} fps={30} durationInFrames={279} />);
