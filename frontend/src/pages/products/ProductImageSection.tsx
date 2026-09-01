import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { productsService } from '../../services/products.service';

/**
 * Imagen del producto — módulo "imagenes".
 *
 * La subida es inmediata (no espera al submit del formulario) porque necesita
 * el productId para armar la key en el bucket. Por eso en un producto nuevo la
 * sección aparece deshabilitada hasta que se guarda: es la misma regla que ya
 * usa ProductVariantsSection.
 */

interface ProductImageSectionProps {
  productId: string | null;
  imageUrl: string | null;
  onChange: (imageUrl: string | null) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif';

export default function ProductImageSection({
  productId,
  imageUrl,
  onChange,
}: ProductImageSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const isDisabled = !productId || isBusy;

  const handleFile = async (file: File | undefined) => {
    if (!file || !productId) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo no es una imagen');
      return;
    }

    setIsBusy(true);
    try {
      const updated = await productsService.uploadImage(productId, file);
      onChange(updated.imageUrl ?? null);
      toast.success('Imagen actualizada');
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Error al subir la imagen');
    } finally {
      setIsBusy(false);
      // Permite volver a elegir el mismo archivo después de un error.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!productId) return;
    setIsBusy(true);
    try {
      await productsService.deleteImage(productId);
      onChange(null);
      toast.success('Imagen eliminada');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al eliminar la imagen');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
        <ImagePlus className="w-3.5 h-3.5" />
        Imagen
      </div>

      {!productId && (
        <div className="flex items-start gap-2 text-xs text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 rounded-lg p-3">
          <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>Guardá el producto para poder cargarle una imagen.</span>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div
          onClick={() => !isDisabled && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDisabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (!isDisabled) void handleFile(e.dataTransfer.files[0]);
          }}
          className={clsx(
            'relative w-40 h-40 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors',
            isDisabled
              ? 'border-gray-100 dark:border-slate-700 opacity-60 cursor-not-allowed'
              : 'cursor-pointer border-gray-200 dark:border-slate-600 hover:border-primary-400',
            isDragging && 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
          )}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="" className="w-full h-full object-contain bg-white dark:bg-slate-900" />
          ) : (
            <div className="text-center px-3">
              <ImagePlus className="w-6 h-6 mx-auto text-gray-300 dark:text-slate-600" />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5 leading-tight">
                Arrastrá una imagen<br />o hacé click
              </p>
            </div>
          )}

          {isBusy && (
            <div className="absolute inset-0 bg-white/70 dark:bg-slate-900/70 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400 dark:text-slate-500 space-y-2 pt-1">
          <p>JPG, PNG, WebP o AVIF.</p>
          <p>Se redimensiona a 1200 px y se convierte a WebP automáticamente antes de subirla.</p>
          {imageUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar imagen
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
