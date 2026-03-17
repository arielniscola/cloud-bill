import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { createCompanySchema, updateCompanySchema, updateModulesSchema } from '../../../application/dtos/company.dto';

export class CompanyController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const companies = await repo.findAll();
      res.json({ status: 'success', data: companies });
    } catch (error) { next(error); }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const company = await repo.findById(req.params.id);
      if (!company) throw new NotFoundError('Empresa');
      res.json({ status: 'success', data: company });
    } catch (error) { next(error); }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const data = createCompanySchema.parse(req.body);
      const company = await repo.create(data);
      res.status(201).json({ status: 'success', data: company });
    } catch (error) { next(error); }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const company = await repo.findById(req.params.id);
      if (!company) throw new NotFoundError('Empresa');
      const data = updateCompanySchema.parse(req.body);
      const updated = await repo.update(req.params.id, data);
      res.json({ status: 'success', data: updated });
    } catch (error) { next(error); }
  }

  async updateModules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const company = await repo.findById(req.params.id);
      if (!company) throw new NotFoundError('Empresa');
      const { enabledModules } = updateModulesSchema.parse(req.body);
      const updated = await repo.updateModules(req.params.id, enabledModules);
      res.json({ status: 'success', data: updated });
    } catch (error) { next(error); }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.params.id === '00000000-0000-0000-0000-000000000001') {
        throw new AppError('No se puede eliminar la empresa principal', 400);
      }
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const company = await repo.findById(req.params.id);
      if (!company) throw new NotFoundError('Empresa');
      await repo.delete(req.params.id);
      res.status(204).send();
    } catch (error) { next(error); }
  }
}
