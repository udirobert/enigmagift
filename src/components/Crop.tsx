import { bboxToCrop, useImageAspect, aspectKnown } from '../lib/crop';
import { Photo } from './Photo';

interface CropProps {
  /** source photo url */
  url: string;
  /** normalised [x, y, w, h] */
  bbox: [number, number, number, number];
  alt?: string;
  className?: string;
  /** a short caption pinned to the crop (the agent's note) */
  caption?: string;
  taped?: boolean;
}

/**
 * A located crop of a real photo: the detail the agent found, framed so it
 * fills the card. The frame uses the photo's own aspect, so object-fit cover
 * is the identity and the bbox centres exactly. Falls back to a matte 4:5
 * frame while the image's aspect is still unknown.
 */
export function Crop({ url, bbox, alt = '', className = '', caption, taped = true }: CropProps) {
  const aspect = useImageAspect(url || null);
  const crop = bboxToCrop(bbox, aspect);
  const ready = aspectKnown(url || null);

  if (!url || !ready) {
    return (
      <figure className={`crop crop-loading ${className}`} aria-hidden>
        <div className="photo-mat" style={{ aspectRatio: '4 / 5', background: 'var(--ink-3)' }} />
      </figure>
    );
  }

  return (
    <figure className={`crop ${className}`}>
      <Photo src={url} alt={alt} zoom={crop.zoom} focus={crop.focus} pos={crop.pos} ratio={crop.ratio} taped={taped} />
      {caption && <figcaption className="crop-cap">{caption}</figcaption>}
    </figure>
  );
}
