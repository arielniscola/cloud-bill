import * as https from 'https';
import axios from 'axios';
import * as soap from 'soap';

/**
 * servicios1.afip.gov.ar (WSFE producción) negocia DHE con una clave DH de 1024 bits.
 * OpenSSL 3 en Linux (node:alpine/debian) trae SECLEVEL=2 y la rechaza con
 * "dh key too small". Bajamos a SECLEVEL=1 (admite DH ≥ 1024) SOLO para ARCA.
 */
const afipAxios = axios.create({
  httpsAgent: new https.Agent({ keepAlive: true, ciphers: 'DEFAULT@SECLEVEL=1' }),
});

export function createAfipSoapClient(wsdlUrl: string): Promise<soap.Client> {
  return soap.createClientAsync(wsdlUrl, { request: afipAxios as any });
}
