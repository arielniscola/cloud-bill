import { useMemo } from 'react';
import { encodeItf } from '../../utils/afipFiscal';

interface Itf14BarcodeProps {
  /** Cadena de dígitos a codificar (para ARCA: los 40 del CAE). */
  value: string;
  /** Alto de las barras en px. */
  height?: number;
  /** Ratio ancho/angosto. El estándar admite 2:1 a 3:1. */
  ratio?: number;
  className?: string;
}

/**
 * Código de barras Interleaved 2 of 5 dibujado como SVG.
 *
 * Se genera a mano en lugar de sumar una dependencia (jsbarcode): el trazado es
 * determinístico y así el mismo encoder sirve para el ticket HTML y, si hace
 * falta, para react-pdf. El SVG usa viewBox + width 100% para escalar al ancho
 * disponible sin importar cuántos dígitos entren.
 */
export default function Itf14Barcode({ value, height = 40, ratio = 3, className }: Itf14BarcodeProps) {
  const { bars, totalWidth } = useMemo(() => {
    let modules;
    try {
      modules = encodeItf(value);
    } catch {
      return { bars: [] as { x: number; w: number }[], totalWidth: 0 };
    }

    const rects: { x: number; w: number }[] = [];
    let x = 0;
    for (const m of modules) {
      const w = m.wide ? ratio : 1;
      if (m.bar) rects.push({ x, w });
      x += w;
    }
    return { bars: rects, totalWidth: x };
  }, [value, ratio]);

  if (!bars.length) return null;

  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 ${totalWidth} ${height}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Código de barras ${value}`}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}
