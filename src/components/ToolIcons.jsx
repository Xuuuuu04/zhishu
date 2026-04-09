import React from 'react';

// ─── Tool brand icons ────────────────────────────────────────────────────────
//
// These are hand-drawn SVG icons that echo each tool's visual identity without
// copying proprietary logos. The goal is visual cohesion across the toolbar
// (all icons share the same stroke weight and grid size) while still being
// recognizable.
//
// Each icon takes { size, color } props.

const baseProps = (size) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  xmlns: 'http://www.w3.org/2000/svg',
});

// Anthropic / Claude — the iconic asterisk / sparkle
export const ClaudeIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <path
      d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z"
      fill={color}
    />
  </svg>
);

// OpenAI / Codex — hexagonal knot (nod to OpenAI's blossom)
export const CodexIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" />
      <circle cx="12" cy="12" r="3.2" fill={color} stroke="none" />
    </g>
  </svg>
);

// Google Gemini — four-pointed sparkle star
export const GeminiIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <path
      d="M12 2 C 12 7, 14 10, 22 12 C 14 14, 12 17, 12 22 C 12 17, 10 14, 2 12 C 10 10, 12 7, 12 2 Z"
      fill={color}
    />
  </svg>
);

// Alibaba Qwen — stylized 通 radical (通 = "thoroughly")
export const QwenIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" strokeWidth="1.6" opacity="0.55" />
      <path d="M7 9 L17 9" />
      <path d="M12 9 L12 17" />
      <path d="M9 13 C 10 15, 14 15, 15 13" />
    </g>
  </svg>
);

// OpenCode — open curly brace with a dot (open-source code energy)
export const OpenCodeIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4 C 6 4, 6 8, 6 10 C 6 11, 5 12, 4 12 C 5 12, 6 13, 6 14 C 6 16, 6 20, 9 20" />
      <path d="M15 4 C 18 4, 18 8, 18 10 C 18 11, 19 12, 20 12 C 19 12, 18 13, 18 14 C 18 16, 18 20, 15 20" />
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
    </g>
  </svg>
);

// Zhipu GLM — layered squares (智谱 glyph inspired)
export const GlmIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3" y="3" width="11" height="11" rx="1.5" />
      <rect x="10" y="10" width="11" height="11" rx="1.5" fill={color} fillOpacity="0.22" />
    </g>
  </svg>
);

// MiniMax — infinity / lemniscate (M + ∞ playful combo)
export const MinimaxIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12 C 3 8, 7 8, 9 12 C 11 16, 13 16, 15 12 C 17 8, 21 8, 21 12" />
      <path d="M3 12 C 3 16, 7 16, 9 12" opacity="0.65" />
      <circle cx="6" cy="12" r="0.8" fill={color} stroke="none" />
      <circle cx="18" cy="12" r="0.8" fill={color} stroke="none" />
    </g>
  </svg>
);

// ─── App brand logo (智枢 / ZhiShu) ──────────────────────────────────────────
//
// Design rationale:
// • Outer "shield" rotated square (45°) — solidity, framing, stability
// • Inner curved "Z" stroke — first letter of 智 (zhì) AND ZhiShu romanization
// • Central illuminated core dot — the "hub" being radiated to
// • Three orbital arcs — three providers/agents revolving around the hub
// • Multi-stop amber→orange→deep gradient gives depth and warmth
// • Inner highlight + outer glow for premium feel
//
// The result reads as a single unified mark rather than a sum of geometric parts.
export const AppLogo = ({ size = 28 }) => {
  const id = 'appLogo';  // unique gradient IDs would be needed if mounted twice
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Outer shield gradient — warm gold to deep amber */}
        <linearGradient id={`${id}-shell`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%"   stopColor="#fde68a" />
          <stop offset="35%"  stopColor="#fbbf24" />
          <stop offset="70%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        {/* Z stroke — slightly more saturated for emphasis */}
        <linearGradient id={`${id}-z`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#fef3c7" />
          <stop offset="40%"  stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        {/* Core glow */}
        <radialGradient id={`${id}-core`} cx="42%" cy="38%" r="65%">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="35%"  stopColor="#fde68a" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        {/* Outer atmospheric glow */}
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#fbbf24" stopOpacity="0.42" />
          <stop offset="55%"  stopColor="#f59e0b" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Atmospheric outer glow */}
      <circle cx="24" cy="24" r="23" fill={`url(#${id}-glow)`} />

      {/* Outer rotated shield (45°) — stroke only, slightly inset */}
      <g transform="rotate(45 24 24)">
        <rect
          x="6.5" y="6.5" width="35" height="35" rx="4.5"
          fill="none"
          stroke={`url(#${id}-shell)`}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* Inner shield line for double-stroke depth */}
        <rect
          x="9" y="9" width="30" height="30" rx="3"
          fill="none"
          stroke={`url(#${id}-shell)`}
          strokeWidth="0.8"
          strokeLinejoin="round"
          opacity="0.45"
        />
      </g>

      {/* Three orbital arcs (rotated 60° apart) suggesting agents in orbit */}
      <g fill="none" stroke={`url(#${id}-shell)`} strokeWidth="0.9" opacity="0.7">
        <ellipse cx="24" cy="24" rx="14" ry="6" transform="rotate(20 24 24)" />
        <ellipse cx="24" cy="24" rx="14" ry="6" transform="rotate(80 24 24)" />
        <ellipse cx="24" cy="24" rx="14" ry="6" transform="rotate(140 24 24)" />
      </g>

      {/* Stylized "Z" — three strokes forming a centered Z with curved corners */}
      <g
        fill="none"
        stroke={`url(#${id}-z)`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 16 16 L 30 16 Q 32 16 30.5 17.8 L 17.5 30.2 Q 16 32 18 32 L 32 32" />
      </g>

      {/* Central illuminated core */}
      <circle cx="24" cy="24" r="3.2" fill={`url(#${id}-core)`} />
      <circle cx="22.6" cy="22.6" r="1" fill="#ffffff" opacity="0.85" />

      {/* Tiny orbit nodes for life */}
      <circle cx="38" cy="24" r="0.9" fill={`url(#${id}-shell)`} />
      <circle cx="10" cy="24" r="0.9" fill={`url(#${id}-shell)`} />
    </svg>
  );
};

// ─── UI chrome icons (toolbar buttons, not AI tools) ───────────────────────

// Bell for notifications (outline style)
export const BellIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8 A 6 6 0 0 1 18 8 V 13 L 20 16 H 4 L 6 13 Z" />
      <path d="M10 20 A 2 2 0 0 0 14 20" />
    </g>
  </svg>
);

// Bell with a slash (muted)
export const BellMutedIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8 A 6 6 0 0 1 18 8 V 13 L 20 16 H 4 L 6 13 Z" />
      <path d="M10 20 A 2 2 0 0 0 14 20" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </g>
  </svg>
);

// Pin (always-on-top). Rotated when inactive, upright when active.
export const PinIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {/* Thumbtack: circular head with a pin stem */}
      <path d="M9 3 L15 3 L14 9 L16.5 12 H 7.5 L10 9 Z" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </g>
  </svg>
);

// Git branch icon
export const GitBranchIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9 a 9 9 0 0 1 -9 9" />
    </g>
  </svg>
);

// Pencil icon (rename)
export const PencilIcon = ({ size = 11, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4 H 4 a 2 2 0 0 0 -2 2 v 14 a 2 2 0 0 0 2 2 h 14 a 2 2 0 0 0 2 -2 v -7" />
      <path d="M18.5 2.5 a 2.121 2.121 0 0 1 3 3 L 12 15 l -4 1 1 -4 9.5 -9.5 z" />
    </g>
  </svg>
);

// File tree drawer toggle
export const TreeIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5 H 11 L 12.5 7 H 21 V 19 a 1 1 0 0 1 -1 1 H 4 a 1 1 0 0 1 -1 -1 Z" />
      <line x1="7" y1="13" x2="17" y2="13" />
      <line x1="7" y1="16" x2="14" y2="16" />
    </g>
  </svg>
);

// Gear for settings
export const GearIcon = ({ size = 14, color = 'currentColor' }) => (
  <svg {...baseProps(size)}>
    <g fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15 a 1.65 1.65 0 0 0 .33 1.82 l .06 .06 a 2 2 0 1 1 -2.83 2.83 l -.06 -.06 a 1.65 1.65 0 0 0 -1.82 -.33 1.65 1.65 0 0 0 -1 1.51 V 21 a 2 2 0 0 1 -4 0 v -.09 A 1.65 1.65 0 0 0 9 19.4 a 1.65 1.65 0 0 0 -1.82 .33 l -.06 .06 a 2 2 0 1 1 -2.83 -2.83 l .06 -.06 a 1.65 1.65 0 0 0 .33 -1.82 1.65 1.65 0 0 0 -1.51 -1 H 3 a 2 2 0 0 1 0 -4 h .09 A 1.65 1.65 0 0 0 4.6 9 a 1.65 1.65 0 0 0 -.33 -1.82 l -.06 -.06 a 2 2 0 1 1 2.83 -2.83 l .06 .06 a 1.65 1.65 0 0 0 1.82 .33 H 9 a 1.65 1.65 0 0 0 1 -1.51 V 3 a 2 2 0 0 1 4 0 v .09 a 1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82 -.33 l .06 -.06 a 2 2 0 1 1 2.83 2.83 l -.06 .06 a 1.65 1.65 0 0 0 -.33 1.82 V 9 a 1.65 1.65 0 0 0 1.51 1 H 21 a 2 2 0 0 1 0 4 h -.09 a 1.65 1.65 0 0 0 -1.51 1 z" />
    </g>
  </svg>
);

// ─── Registry — look up icon by tool id ─────────────────────────────────────

export const TOOL_ICONS = {
  claude:   ClaudeIcon,
  codex:    CodexIcon,
  gemini:   GeminiIcon,
  qwen:     QwenIcon,
  opencode: OpenCodeIcon,
  glm:      GlmIcon,
  minimax:  MinimaxIcon,
};

export function ToolIcon({ id, size = 14, color = 'currentColor' }) {
  const Icon = TOOL_ICONS[id];
  if (!Icon) return null;
  return <Icon size={size} color={color} />;
}
