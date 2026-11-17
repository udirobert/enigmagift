interface WaxSealProps {
  size?: number;
  className?: string;
}

/**
 * Handmade wax seal — an irregular blob, waxy radial gradients, inner
 * shadow, and a subtle embossed monogram. Deliberately imperfect.
 */
export function WaxSeal({ size = 190, className = '' }: WaxSealProps) {
  return (
    <svg
      className={`wax-seal ${className}`}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="wax seal"
    >
      <defs>
        <radialGradient id="wax-body" cx="42%" cy="36%" r="75%">
          <stop offset="0%" stopColor="#d97a45" />
          <stop offset="45%" stopColor="#b34f24" />
          <stop offset="100%" stopColor="#7e3416" />
        </radialGradient>
        <radialGradient id="wax-inner" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#8f3d1c" />
          <stop offset="100%" stopColor="#5f2410" />
        </radialGradient>
        <radialGradient id="wax-well" cx="50%" cy="55%" r="60%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#000000" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <filter id="wax-rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" />
        </filter>
      </defs>

      {/* outer blob — wobbly, handmade edge */}
      <path
        className="wax-blob"
        d="M100 14
           C 58 10, 26 36, 24 76
           C 22 116, 44 156, 90 172
           C 128 186, 172 168, 182 126
           C 192 84, 176 38, 140 20
           C 126 12, 112 13, 100 14 Z"
        fill="url(#wax-body)"
        filter="url(#wax-rough)"
      />
      {/* inner pressed ring */}
      <path
        className="wax-blob"
        d="M100 44
           C 74 42, 54 60, 52 86
           C 50 114, 66 138, 96 146
           C 124 153, 152 140, 158 110
           C 164 82, 152 56, 126 48
           C 116 45, 107 44, 100 44 Z"
        fill="url(#wax-inner)"
        opacity="0.85"
        filter="url(#wax-rough)"
      />
      {/* pressed centre + monogram */}
      <ellipse cx="100" cy="98" rx="34" ry="30" fill="url(#wax-well)" />
      <text
        x="100"
        y="110"
        textAnchor="middle"
        className="wax-mark"
        fontFamily="Fraunces, serif"
        fontStyle="italic"
        fontWeight="500"
      >
        e
      </text>
      {/* wax sheen */}
      <ellipse cx="72" cy="52" rx="26" ry="14" fill="#f0c9a8" opacity="0.16" transform="rotate(-24 72 52)" />
    </svg>
  );
}
