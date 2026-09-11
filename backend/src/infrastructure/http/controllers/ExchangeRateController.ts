import { Request, Response, NextFunction } from 'express';
import { exchangeRateService } from '../../services/ExchangeRateService';

export class ExchangeRateController {
  /**
   * GET /api/exchange-rate
   * Cotización del día USD → ARS que usan todas las vistas para expresar la
   * deuda en pesos. Si la fuente no responde devuelve la última conocida con
   * `stale: true`; si nunca se pudo obtener ninguna, `data` viene en null y la
   * UI cae a mostrar los importes en su moneda original.
   */
  async getUsdRate(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await exchangeRateService.getUsdRate();
      res.json({ status: 'success', data });
    } catch (error) {
      next(error);
    }
  }
}
