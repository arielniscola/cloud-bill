/**
 * Blob → base64 por bloques. `String.fromCharCode(...bytes)` con el archivo
 * entero desborda la pila apenas el PDF supera ~100 KB (p. ej. con logo).
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
