/**
 * Módulos que el SUPER_ADMIN activa por empresa (companies.enabledModules,
 * CSV o el literal "ALL"). Distinto de planFeatures.ts, que gatilla por plan
 * comercial: acá la unidad es "esta empresa lo pidió".
 */

export const MODULE_KEYS = [
  'ventas',
  'catalogo',
  'compras',
  'finanzas',
  'variantes',
  'imagenes',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * Módulos que "ALL" NO incluye: hay que activarlos explícitamente por empresa.
 *
 * `imagenes` está acá porque consume storage facturable. Las empresas ya
 * existentes tienen enabledModules = 'ALL', así que sin esta lista el módulo
 * quedaría prendido para todas de golpe y podríamos pagar el bucket de
 * clientes que nunca lo pidieron.
 */
export const OPT_IN_MODULE_KEYS: ModuleKey[] = ['imagenes'];

/** Parsea el valor crudo de la columna a la lista de módulos activos. */
export function parseEnabledModules(raw: string | null | undefined): string[] {
  if (!raw) return ['ALL'];
  if (raw === 'ALL') return ['ALL'];
  return raw.split(',').map((m) => m.trim()).filter(Boolean);
}

export function modulesInclude(enabledModules: string[], key: string): boolean {
  if (enabledModules.includes(key)) return true;
  return enabledModules.includes('ALL') && !OPT_IN_MODULE_KEYS.includes(key as ModuleKey);
}
