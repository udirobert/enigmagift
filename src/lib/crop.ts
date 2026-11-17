/* ------------------------------------------------------------------ */
/*  bbox → crop. The Photo component shows an image in a fixed aspect  */
/*  frame (object-fit: cover) and can zoom around a focus point.      */
/*  Given a normalised bbox and the image's real aspect ratio, return  */
/*  the object-position that centres the bbox and the zoom that makes */
/*  it fill the frame (with a little headroom).                       */
/* ------------------------------------------------------------------ */
import { useEffect, useState } from 'react';

export interface Crop {
  zoom: number;
  /** transform-origin, 'x% y%' of the frame — where the zoom pivots */
  focus: string;
  /** object-position — where the image content is aligned */
  pos: string;
  /** frame aspect — the source image's own aspect, so cover is identity */
  ratio: string;
}

/**
 * Frame the bbox so the detail fills the frame.
 * imgAspect = naturalWidth / naturalHeight of the source image.
 *
 * The frame is drawn at the image's own aspect, so object-fit: cover is
 * the identity (no cropping, nothing locked) and the detail can be
 * centred exactly on both axes: zoom around the bbox centre, sized to
 * "contain" — the whole detail must stay visible, the recipient has to
 * be able to recognise it.
 */
export function bboxToCrop(
  bbox: [number, number, number, number],
  imgAspect: number
): Crop {
  const [x, y, w, h] = bbox;
  const a = imgAspect || 1;

  const u = x + w / 2; // bbox centre, image-normalised
  const v = y + h / 2;

  // frame is a wide × 1 tall; zoom until the bbox fills ~95% of the
  // limiting dimension ("contain", not "fill")
  const zRaw = 0.95 * Math.min(a / w, 1 / h);
  const zoom = Math.min(6, Math.max(1, zRaw));

  return {
    zoom,
    focus: `${(u * 100).toFixed(1)}% ${(v * 100).toFixed(1)}%`,
    pos: `${(u * 100).toFixed(1)}% ${(v * 100).toFixed(1)}%`,
    ratio: `${a.toFixed(3)} / 1`,
  };
}

/* ---------------------- image aspect cache ------------------------- */

const aspectCache = new Map<string, number>();

/** Has this url's natural aspect been measured yet? */
export function aspectKnown(url: string | null): boolean {
  return !!url && aspectCache.has(url);
}

/**
 * Measure an image's natural aspect (w/h). Resolves once the image loads.
 */
export function useImageAspect(url: string | null, fallback = 4 / 5): number {
  const [aspect, setAspect] = useState<number>(() =>
    url ? aspectCache.get(url) ?? fallback : fallback
  );

  useEffect(() => {
    if (!url) return;
    const cached = aspectCache.get(url);
    if (cached) {
      setAspect(cached);
      return;
    }
    setAspect(fallback);
    let dead = false;
    const img = new Image();
    img.onload = () => {
      if (dead) return;
      const a =
        img.naturalWidth && img.naturalHeight
          ? img.naturalWidth / img.naturalHeight
          : fallback;
      aspectCache.set(url, a);
      setAspect(a);
    };
    img.src = url;
    return () => {
      dead = true;
    };
  }, [url, fallback]);

  return aspect;
}
