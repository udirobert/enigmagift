import type { CSSProperties, ReactNode } from 'react';

interface PhotoProps {
  src: string;
  alt?: string;
  /** zoomed "crop" — scales the img around `focus` */
  zoom?: number;
  /** object-position + transform-origin, e.g. '62% 56%' */
  focus?: string;
  ratio?: string;
  taped?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * A photograph treated as a physical object: warm dark mat, soft shadow,
 * optional tape strip, and a zoomed "crop" via object-position + scale.
 */
export function Photo({
  src,
  alt = '',
  zoom = 1,
  focus = '50% 50%',
  ratio = '4 / 5',
  taped = false,
  className = '',
  children,
}: PhotoProps) {
  const frameStyle: CSSProperties = {
    aspectRatio: ratio,
    transform: zoom !== 1 ? `scale(${zoom})` : undefined,
    transformOrigin: focus,
    objectPosition: focus,
  };
  return (
    <figure className={`photo ${className}`}>
      <div className="photo-mat">
        {taped && <span className="tape" aria-hidden />}
        <img className="photo-img" src={src} alt={alt} style={frameStyle} draggable={false} />
        {children}
      </div>
    </figure>
  );
}

interface PolaroidProps {
  src: string;
  alt?: string;
  rotate?: number;
  caption?: string;
  className?: string;
}

/** Cream-bordered polaroid — used for the scattered photo fan. */
export function Polaroid({ src, alt = '', rotate = 0, caption, className = '' }: PolaroidProps) {
  return (
    <figure
      className={`polaroid ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div className="polaroid-img">
        <img src={src} alt={alt} loading="lazy" draggable={false} />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
