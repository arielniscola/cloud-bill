import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { IProductCustomFieldRepository } from '../../../domain/repositories/IProductCustomFieldRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { NotFoundError, ConflictError } from '../../../shared/errors/AppError';
import {
  createProductCustomFieldSchema,
  updateProductCustomFieldSchema,
} from '../../../application/dtos/productCustomField.dto';

export class ProductCustomFieldController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductCustomFieldRepository>('ProductCustomFieldRepository');
      const onlyActive = req.query.activeOnly === 'true';
      const fields = await repo.findAll(req.companyId, onlyActive);
      res.json({ status: 'success', data: fields });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductCustomFieldRepository>('ProductCustomFieldRepository');
      const field = await repo.findById(req.params.id);
      if (!field) throw new NotFoundError('Campo personalizado');
      res.json({ status: 'success', data: field });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductCustomFieldRepository>('ProductCustomFieldRepository');
      const data = createProductCustomFieldSchema.parse(req.body);
      const companyId = req.companyId!;

      const existing = await repo.findByKey(companyId, data.key);
      if (existing) throw new ConflictError(`Ya existe un campo con la clave "${data.key}"`);

      const field = await repo.create({ ...data, options: data.options ?? null, companyId });
      this._log(req, 'CREATE', field.id, `Campo personalizado "${field.name}" creado`);
      res.status(201).json({ status: 'success', data: field });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductCustomFieldRepository>('ProductCustomFieldRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Campo personalizado');
      const data = updateProductCustomFieldSchema.parse(req.body);

      if (data.key && data.key !== existing.key) {
        const dup = await repo.findByKey(existing.companyId, data.key);
        if (dup && dup.id !== existing.id) {
          throw new ConflictError(`Ya existe un campo con la clave "${data.key}"`);
        }
      }

      const field = await repo.update(req.params.id, data);
      this._log(req, 'UPDATE', field.id, `Campo personalizado "${field.name}" actualizado`);
      res.json({ status: 'success', data: field });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<IProductCustomFieldRepository>('ProductCustomFieldRepository');
      const existing = await repo.findById(req.params.id);
      if (!existing) throw new NotFoundError('Campo personalizado');
      await repo.delete(req.params.id);
      this._log(req, 'DELETE', req.params.id, `Campo personalizado "${existing.name}" eliminado`);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo
      .create({ userId: req.user!.userId, action, entity: 'ProductCustomField', entityId, description })
      .catch(() => { /* non-critical */ });
  }
}
