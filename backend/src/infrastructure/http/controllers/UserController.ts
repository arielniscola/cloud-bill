import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError, NotFoundError, ConflictError } from '../../../shared/errors/AppError';

const createUserSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email(),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  role:     z.enum(['ADMIN', 'SELLER', 'WAREHOUSE_CLERK']).default('SELLER'),
});

const updateUserSchema = z.object({
  name:     z.string().min(1).optional(),
  email:    z.string().email().optional(),
  role:     z.enum(['ADMIN', 'SELLER', 'WAREHOUSE_CLERK']).optional(),
  isActive: z.boolean().optional(),
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
      const repo  = container.resolve<IUserRepository>('UserRepository');
      const users = await repo.findAll();
      res.json({ status: 'success', data: users.map(omitPassword) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IUserRepository>('UserRepository');
      const data = createUserSchema.parse(req.body);

      const existing = await repo.findByEmail(data.email);
      if (existing) throw new ConflictError('El email ya está registrado');

      const hashed = await bcrypt.hash(data.password, 10);
      const user   = await repo.create({ ...data, password: hashed, isActive: true });

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

      if (data.email && data.email !== user.email) {
        const existing = await repo.findByEmail(data.email);
        if (existing) throw new ConflictError('El email ya está registrado');
      }

      const updated = await repo.update(req.params.id, data);
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
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
