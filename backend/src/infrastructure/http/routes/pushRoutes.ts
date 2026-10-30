import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/authMiddleware';
import { AppError } from '../../../shared/errors/AppError';
import {
  countSubscriptions,
  deleteSubscription,
  getVapidPublicKey,
  saveSubscription,
  sendPushToUsers,
} from '../../services/PushService';

// Suscripciones Web Push de la PWA (avisos de aprobaciones).

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().max(2000) });

const router = Router();
router.use(authMiddleware);

/** Clave pública VAPID; null si el servidor no tiene el push configurado. */
router.get('/public-key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const publicKey = getVapidPublicKey();
    const devices = publicKey ? await countSubscriptions(req.user!.userId) : 0;
    res.json({ status: 'success', data: { publicKey, devices } });
  } catch (error) {
    next(error);
  }
});

router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!getVapidPublicKey()) throw new AppError('Los avisos push no están configurados en el servidor', 503);
    const sub = subscriptionSchema.parse(req.body);
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : null;
    await saveSubscription(req.user!.userId, req.companyId ?? null, sub, ua);
    res.status(201).json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
});

router.post('/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = unsubscribeSchema.parse(req.body);
    await deleteSubscription(req.user!.userId, endpoint);
    res.json({ status: 'success', data: null });
  } catch (error) {
    next(error);
  }
});

/** Aviso de prueba a los dispositivos del propio usuario. */
router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sent = await sendPushToUsers([req.user!.userId], {
      title: 'Cloud Bill',
      body: 'Los avisos están funcionando en este dispositivo.',
      url: '/approvals',
      tag: 'push-test',
    });
    res.json({ status: 'success', data: { sent } });
  } catch (error) {
    next(error);
  }
});

export { router as pushRoutes };
