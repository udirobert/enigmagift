import qrcode from 'qrcode-generator';
import type { ReactNode } from 'react';

/**
 * A real, scannable QR code (qrcode-generator, ~20KB, no deps) rendered as
 * SVG cells so it inherits the seal's styling. `value` is usually the
 * recipient link /t/<token> — for The Hide this gets printed inside the
 * hidden thing.
 */
export function QRCode({ value, className = 'qr-glyph' }: { value: string; className?: string }) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.isDark(y, x)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      className={className}
      role="img"
      aria-label={`qr code — scans to ${value}`}
    >
      {cells}
    </svg>
  );
}
