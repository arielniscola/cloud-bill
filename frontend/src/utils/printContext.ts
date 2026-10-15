import { afipService, appSettingsService, companiesService } from '../services';
import type { AfipConfigSummary } from '../types/afip.types';
import type { AppSettings, RemitoCopies } from '../types/app-settings.types';
import type { Company } from '../types/company.types';
import { TAX_CONDITIONS } from './constants';

/**
 * Datos del emisor que llevan todos los comprobantes impresos. Junta tres
 * fuentes: la config de ARCA (datos fiscales: razón social, domicilio, CUIT,
 * IIBB, inicio de actividades), la empresa (logo, teléfono, email; y fallback
 * de lo fiscal) y la configuración de la app (web, establecimiento, CAI).
 */
export interface IssuerInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  cuit: string;
  taxCondition: string;     // etiqueta legible ("Responsable Inscripto")
  grossIncome: string;
  activityStart: string | null;
  establishment: string;
  logoDataUrl: string | null;
}

export interface PrintContext {
  issuer: IssuerInfo;
  afipConfig: AfipConfigSummary | null;
  settings: AppSettings | null;
  remitoCai: string;
  remitoCaiExpiry: string | null;
  remitoCopies: RemitoCopies;
}

function taxConditionLabel(raw: string | null | undefined): string {
  if (!raw) return 'Responsable Inscripto';
  return (TAX_CONDITIONS as Record<string, string>)[raw] ?? raw.replace(/_/g, ' ');
}

/**
 * Baja el logo y lo pasa a data URL: react-pdf solo dibuja PNG/JPG y, si la URL
 * no permite CORS, no hay forma de embeberlo — en ese caso se imprime el nombre.
 */
async function logoToDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(png|jpe?g)$/i.test(blob.type)) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function loadPrintContext(): Promise<PrintContext> {
  const [afipConfig, company, settings] = await Promise.all([
    afipService.getConfig().catch(() => null),
    companiesService.getCurrent().catch(() => null as Company | null),
    appSettingsService.get().catch(() => null as AppSettings | null),
  ]);
  const logoDataUrl = await logoToDataUrl(company?.logoUrl);

  const companyAddress = [company?.address, company?.city].filter(Boolean).join(' - ');

  const issuer: IssuerInfo = {
    name:          afipConfig?.businessName || company?.name || '',
    address:       afipConfig?.businessAddress || companyAddress,
    phone:         company?.phone ?? '',
    email:         company?.email ?? '',
    website:       settings?.printWebsite ?? '',
    cuit:          afipConfig?.cuit || company?.cuit || '',
    taxCondition:  taxConditionLabel(afipConfig?.taxCondition || company?.taxCondition),
    grossIncome:   afipConfig?.grossIncome || company?.grossIncome || '',
    activityStart: afipConfig?.activityStartDate ?? null,
    establishment: settings?.printEstablishment ?? '',
    logoDataUrl,
  };

  return {
    issuer,
    afipConfig,
    settings,
    remitoCai: settings?.remitoCai ?? '',
    remitoCaiExpiry: settings?.remitoCaiExpiry ?? null,
    remitoCopies: settings?.remitoCopies ?? 'TWO_PER_PAGE',
  };
}

/** Descarga un PDF generado en el navegador. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Abre el diálogo de impresión del PDF sin pestaña intermedia (iframe oculto).
 */
export function printBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  document.body.appendChild(iframe);

  const cleanup = () => { URL.revokeObjectURL(url); iframe.remove(); };
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) { cleanup(); return; }
    win.focus();
    win.print();
    win.onafterprint = cleanup;
  };
  // Red de seguridad por si el navegador no dispara "afterprint" en el visor de PDF embebido.
  setTimeout(cleanup, 120000);
}
