import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { NotFoundError, AppError } from '../../../shared/errors/AppError';
import { createCompanySchema, updateCompanySchema, updateModulesSchema } from '../../../application/dtos/company.dto';
import { PLAN_NAMES } from '../../../shared/constants/planFeatures';
import { invalidatePlanCache } from '../middlewares/featureMiddleware';
import { invalidateModuleCache } from '../middlewares/moduleMiddleware';
import prisma from '../../database/prisma';

export class CompanyController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      // Un ADMIN solo ve su propia empresa; el listado completo es de SUPER_ADMIN.
      if (req.user?.role !== 'SUPER_ADMIN') {
        const own = req.companyId ? await repo.findById(req.companyId) : null;
        res.json({ status: 'success', data: own ? [own] : [] });
        return;
      }
      const companies = await repo.findAll();
      res.json({ status: 'success', data: await this.withCounts(companies) });
    } catch (error) { next(error); }
  }

  // Conteos por empresa para el listado de SUPER_ADMIN: usuarios activos y
  // facturas emitidas en el mes en curso (sin borradores ni anuladas).
  private async withCounts<T extends { id: string }>(companies: T[]): Promise<T[]> {
    if (companies.length === 0) return companies;

    const ids = companies.map((c) => c.id);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [userGroups, invoiceGroups] = await Promise.all([
      prisma.user.groupBy({
        by: ['companyId'],
        where: { companyId: { in: ids }, isActive: true },
        _count: { _all: true },
      }),
      prisma.invoice.groupBy({
        by: ['companyId'],
        where: {
          companyId: { in: ids },
          date: { gte: monthStart },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
        _count: { _all: true },
      }),
    ]);

    const users = new Map(userGroups.map((g) => [g.companyId, g._count._all]));
    const invoices = new Map(invoiceGroups.map((g) => [g.companyId, g._count._all]));

    return companies.map((c) => ({
      ...c,
      usersCount: users.get(c.id) ?? 0,
      invoicesThisMonth: invoices.get(c.id) ?? 0,
    }));
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'SUPER_ADMIN' && req.params.id !== req.companyId) {
        throw new NotFoundError('Empresa');
      }
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const company = await repo.findById(req.params.id);
      if (!company) throw new NotFoundError('Empresa');
      res.json({ status: 'success', data: company });
    } catch (error) { next(error); }
  }

  // Datos de la empresa activa del usuario — accesible a cualquier rol autenticado.
  // Se usa, p.ej., como fallback del encabezado en tickets/impresiones cuando la
  // configuración AFIP está incompleta.
  async getCurrent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.companyId) throw new NotFoundError('Empresa');
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const company = await repo.findById(req.companyId);
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
      invalidateModuleCache(req.params.id);
      res.json({ status: 'success', data: updated });
    } catch (error) { next(error); }
  }

  async updatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { plan } = req.body;
      if (!plan || !PLAN_NAMES.includes(plan)) {
        throw new AppError(`Plan inválido. Valores permitidos: ${PLAN_NAMES.join(', ')}`, 400);
      }
      const repo = container.resolve<ICompanyRepository>('CompanyRepository');
      const company = await repo.findById(req.params.id);
      if (!company) throw new NotFoundError('Empresa');

      await prisma.$executeRaw`
        UPDATE "companies" SET "plan" = ${plan}, "updatedAt" = NOW() WHERE id = ${req.params.id}
      `;
      invalidatePlanCache(req.params.id);

      const updated = await repo.findById(req.params.id);
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
