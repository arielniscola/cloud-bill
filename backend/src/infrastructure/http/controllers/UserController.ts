import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { AppError, NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/AppError';

const createUserSchema = z.object({
  name:      z.string().min(1),
  username:  z.string().min(3, 'Mínimo 3 caracteres').regex(/^\S+$/, 'Sin espacios'),
  email:     z.string().email().optional().or(z.literal('')),
  password:  z.string().min(6, 'Mínimo 6 caracteres'),
  role:      z.enum(['ADMIN', 'SELLER', 'FINANCES', 'PURCHASES', 'WAREHOUSE_CLERK']).default('SELLER'),
  companyId: z.string().uuid('ID de empresa inválido'),
});

const updateUserSchema = z.object({
  name:      z.string().min(1).optional(),
  username:  z.string().min(3).regex(/^\S+$/, 'Sin espacios').optional(),
  email:     z.string().email().optional().or(z.literal('')),
  role:      z.enum(['ADMIN', 'SELLER', 'FINANCES', 'PURCHASES', 'WAREHOUSE_CLERK']).optional(),
  isActive:  z.boolean().optional(),
});

const changePasswordSchema = z.object({
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

function omitPassword<T extends { password?: string }>(user: T) {
  const { password: _, ...rest } = user;
  return rest;
}

export class UserController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IUserRepository>('UserRepository');
      // SUPER_ADMIN sees all; ADMIN sees only their company
      const filters = req.user!.role === 'SUPER_ADMIN'
        ? {}
        : { companyId: req.companyId };

      const users = await repo.findAll(filters);
      res.json({ status: 'success', data: users.map(omitPassword) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IUserRepository>('UserRepository');
      const data = createUserSchema.parse(req.body);

      const existingByUsername = await repo.findByUsername(data.username);
      if (existingByUsername) throw new ConflictError('El nombre de usuario ya está registrado');

      if (data.email) {
        const existingByEmail = await repo.findByEmail(data.email);
        if (existingByEmail) throw new ConflictError('El email ya está registrado');
      }

      const hashed = await bcrypt.hash(data.password, 10);
      const user   = await repo.create({
        ...data,
        email:    data.email || null,
        password: hashed,
        isActive: true,
      });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'CREATE',
        entity: 'User',
        entityId: user.id,
        description: `Usuario ${user.name} (${user.username}) creado con rol ${data.role}`,
        metadata: { role: data.role, companyId: data.companyId },
      });

      res.status(201).json({ status: 'success', data: omitPassword(user) });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IUserRepository>('UserRepository');
      const user = await repo.findById(req.params.id);
      if (!user) throw new NotFoundError('Usuario');

      const data = updateUserSchema.parse(req.body);

      if (data.username && data.username !== user.username) {
        const existing = await repo.findByUsername(data.username);
        if (existing) throw new ConflictError('El nombre de usuario ya está registrado');
      }

      if (data.email && data.email !== user.email) {
        const existing = await repo.findByEmail(data.email);
        if (existing) throw new ConflictError('El email ya está registrado');
      }

      const updateData: Record<string, unknown> = { ...data };
      if ('email' in data && data.email === '') updateData.email = null;

      const updated = await repo.update(req.params.id, updateData as any);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'User',
        entityId: updated.id,
        description: `Usuario ${updated.name} actualizado`,
        metadata: data as Record<string, unknown>,
      });

      res.json({ status: 'success', data: omitPassword(updated) });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IUserRepository>('UserRepository');
      const user = await repo.findById(req.params.id);
      if (!user) throw new NotFoundError('Usuario');

      const { password } = changePasswordSchema.parse(req.body);
      const hashed       = await bcrypt.hash(password, 10);

      await repo.update(req.params.id, { password: hashed });

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'User',
        entityId: req.params.id,
        description: `Contraseña de ${user.name} cambiada`,
      });

      res.json({ status: 'success', message: 'Contraseña actualizada' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.params.id === req.user!.userId) {
        throw new AppError('No podés eliminar tu propio usuario', 400);
      }

      const repo = container.resolve<IUserRepository>('UserRepository');
      const user = await repo.findById(req.params.id);
      if (!user) throw new NotFoundError('Usuario');

      await repo.delete(req.params.id);

      const activityLogRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
      await activityLogRepo.create({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'User',
        entityId: req.params.id,
        description: `Usuario ${user.name} (${user.username}) eliminado`,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
