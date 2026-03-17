import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError, NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/AppError';

const createUserSchema = z.object({
  name:      z.string().min(1),
  username:  z.string().min(3, 'Mínimo 3 caracteres').regex(/^\S+$/, 'Sin espacios'),
  email:     z.string().email().optional().or(z.literal('')),
  password:  z.string().min(6, 'Mínimo 6 caracteres'),
  role:      z.enum(['ADMIN', 'SELLER', 'WAREHOUSE_CLERK']).default('SELLER'),
  companyId: z.string().uuid('ID de empresa inválido'),
});

const updateUserSchema = z.object({
  name:      z.string().min(1).optional(),
  username:  z.string().min(3).regex(/^\S+$/, 'Sin espacios').optional(),
  email:     z.string().email().optional().or(z.literal('')),
  role:      z.enum(['ADMIN', 'SELLER', 'WAREHOUSE_CLERK']).optional(),
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
      if (req.user!.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Solo el super administrador puede crear usuarios');
      }

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

      res.status(201).json({ status: 'success', data: omitPassword(user) });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user!.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Solo el super administrador puede modificar usuarios');
      }

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
      res.json({ status: 'success', data: omitPassword(updated) });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user!.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Solo el super administrador puede cambiar contraseñas');
      }

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
      if (req.user!.role !== 'SUPER_ADMIN') {
        throw new ForbiddenError('Solo el super administrador puede eliminar usuarios');
      }

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
