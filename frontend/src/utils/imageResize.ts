/**
 * Redimensiona y recomprime una imagen en el navegador antes de subirla.
 *
 * Se hace acá y no en el servidor por tres motivos: una foto de celular pesa
 * 4-8 MB y subirla entera por una conexión argentina promedio tarda una
 * eternidad; el backend corre en serverless y no puede procesar imágenes; y
 * el storage se paga por GB, así que conviene guardar 150 KB y no 6 MB.
 */

export interface ResizeOptions {
  /** Lado máximo (ancho o alto). La proporción se mantiene. */
  maxSize?: number;
  /** 0-1. 0.82 es el punto donde WebP deja de verse distinto del original. */
  quality?: number;
}

export interface ResizedImage {
  blob: Blob;
  contentType: string;
  width: number;
  height: number;
}

const DEFAULTS = { maxSize: 1200, quality: 0.82 };

/** WebP tiene soporte universal desde 2021, pero si fallara se cae a JPEG. */
function bestFormat(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

export async function resizeImage(file: File, options: ResizeOptions = {}): Promise<ResizedImage> {
  const { maxSize, quality } = { ...DEFAULTS, ...options };
  const img = await loadImage(file);

  // Una imagen más chica que el máximo no se agranda: sólo se recomprime.
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no soporta canvas 2D');
  ctx.drawImage(img, 0, 0, width, height);

  const contentType = bestFormat();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, contentType, quality)
  );
  if (!blob) throw new Error('No se pudo procesar la imagen');

  return { blob, contentType, width, height };
}
