import * as https from 'https';
import axios from 'axios';
import * as soap from 'soap';

/**
 * servicios1.afip.gov.ar (WSFE producción) negocia DHE con una clave DH de 1024 bits.
 * OpenSSL 3 en Linux (node:alpine/debian) trae SECLEVEL=2 y la rechaza con
 * "dh key too small". Bajamos a SECLEVEL=1 (admite DH ≥ 1024) SOLO para ARCA.
 */
/**
 * Sin timeout una llamada colgada retenía el lock de emisión indefinidamente.
 * Si FECAESolicitar vence por timeout, ARCA pudo haberlo autorizado igual: la
 * emisión lo verifica con FECompConsultar (ver `findAuthorizedVoucher`).
 */
export const AFIP_SOAP_TIMEOUT_MS = 30_000;

const afipAxios = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true, ciphers: 'DEFAULT@SECLEVEL=1' }),
  timeout: AFIP_SOAP_TIMEOUT_MS,
});

export function createAfipSoapClient(wsdlUrl: string): Promise<soap.Client> {
  return soap.createClientAsync(wsdlUrl, { request: afipAxios as any });
}
