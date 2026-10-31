// Browser-only: rasterizing the exported SVG to PNG.
import type { DiagramImage } from './diagram-svg';

/** Browsers refuse canvases past roughly these limits; large diagrams get a smaller scale. */
const MAX_SIDE = 16_384;
const MAX_PIXELS = 64_000_000;

/** The pixel ratio for a PNG of `image`: `preferred` unless the canvas would be too large. */
export function pngScale(image: Pick<DiagramImage, 'width' | 'height'>, preferred = 2): number {
  const bySide = MAX_SIDE / Math.max(image.width, image.height);
  const byArea = Math.sqrt(MAX_PIXELS / (image.width * image.height));
  return Math.min(preferred, bySide, byArea);
}

export async function diagramToPng(image: DiagramImage): Promise<Blob> {
  const scale = pngScale(image);
  const url = URL.createObjectURL(new Blob([image.svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode the PNG'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
