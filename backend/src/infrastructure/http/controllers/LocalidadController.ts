import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { ILocalidadRepository } from '../../../domain/repositories/ILocalidadRepository';
import { IProvinciaRepository } from '../../../domain/repositories/IProvinciaRepository';
import { IActivityLogRepository } from '../../../domain/repositories/IActivityLogRepository';
import { AppError, NotFoundError } from '../../../shared/errors/AppError';
import { createLocalidadSchema, updateLocalidadSchema } from '../../../application/dtos/localidad.dto';
import { normalizeProvinciaName } from '../../../shared/constants/provincias';

/** Espacios de más fuera; el nombre queda como se cargó ("CABA" es una sigla, no se prolija). */
const tidyName = (s: string): string => s.trim().replace(/\s+/g, ' ');

export class LocalidadController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ILocalidadRepository>('LocalidadRepository');
      res.json({ status: 'success', data: await repo.findAll(req.companyId!) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ILocalidadRepository>('LocalidadRepository');
      const data = createLocalidadSchema.parse(req.body);
      await this._assertProvincia(req.companyId!, data.provinciaId);
      await this._assertUnique(repo, req.companyId!, data.name, data.provinciaId ?? null);
      const localidad = await repo.create({ ...data, companyId: req.companyId! });
      this._log(req, 'CREATE', localidad.id, `Localidad ${localidad.name} creada`);
      res.status(201).json({ status: 'success', data: localidad });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ILocalidadRepository>('LocalidadRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Localidad');
      const data = updateLocalidadSchema.parse(req.body);
      if ('provinciaId' in data) await this._assertProvincia(req.companyId!, data.provinciaId);
      if (data.name !== undefined || 'provinciaId' in data) {
        await this._assertUnique(
          repo, req.companyId!,
          data.name ?? existing.name,
          'provinciaId' in data ? data.provinciaId ?? null : existing.provinciaId,
          existing.id,
        );
      }
      const localidad = await repo.update(existing.id, data);
      this._log(req, 'UPDATE', localidad.id, `Localidad ${localidad.name} actualizada`);
      res.json({ status: 'success', data: localidad });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = container.resolve<ILocalidadRepository>('LocalidadRepository');
      const existing = await repo.findById(req.params.id, req.companyId);
      if (!existing) throw new NotFoundError('Localidad');
      await repo.delete(existing.id);
      this._log(req, 'DELETE', existing.id, `Localidad ${existing.name} desactivada`);
      res.json({ status: 'success', data: null });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Arma el catálogo con las localidades ya cargadas en clientes y proveedores.
   * La provincia se busca en el catálogo de provincias por nombre (sin acentos);
   * las que ya existen (mismo nombre y provincia) se saltean.
   */
  async importFromParties(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const repo = container.resolve<ILocalidadRepository>('LocalidadRepository');
      const provinciaRepo = container.resolve<IProvinciaRepository>('ProvinciaRepository');

      const [provincias, existing, used] = await Promise.all([
        provinciaRepo.findAll(companyId),
        repo.findAll(companyId),
        repo.findUsedInParties(companyId),
      ]);
      const provByName = new Map(provincias.map((p) => [normalizeProvinciaName(p.name), p.id]));
      const keyOf = (name: string, provinciaId: string | null) => `${normalizeProvinciaName(name)}|${provinciaId ?? ''}`;
      const seen = new Set(existing.map((l) => keyOf(l.name, l.provinciaId)));
      // Una localidad sin provincia no se crea si ya existe con alguna provincia.
      const namesWithProv = new Set(existing.filter((l) => l.provinciaId).map((l) => normalizeProvinciaName(l.name)));

      // Primero las que traen provincia, así "Rosario" (proveedor, sin provincia)
      // no duplica a "Rosario, Santa Fe" (cliente).
      const rows = [...used].sort((a, b) => Number(!!b.province) - Number(!!a.province));
      let created = 0;
      for (const row of rows) {
        const name = tidyName(row.city);
        if (name.length < 2) continue;
        const provinciaId = row.province ? provByName.get(normalizeProvinciaName(row.province)) ?? null : null;
        const key = keyOf(name, provinciaId);
        if (seen.has(key)) continue;
        if (!provinciaId && namesWithProv.has(normalizeProvinciaName(name))) continue;
        await repo.create({ name, provinciaId, postalCode: row.postalCode, companyId });
        seen.add(key);
        if (provinciaId) namesWithProv.add(normalizeProvinciaName(name));
        created++;
      }

      if (created > 0) this._log(req, 'CREATE', companyId, `${created} localidades importadas desde clientes/proveedores`);
      res.json({ status: 'success', data: { created } });
    } catch (error) {
      next(error);
    }
  }

  private async _assertProvincia(companyId: string, provinciaId: string | null | undefined) {
    if (!provinciaId) return;
    const provinciaRepo = container.resolve<IProvinciaRepository>('ProvinciaRepository');
    if (!(await provinciaRepo.findById(provinciaId, companyId))) throw new NotFoundError('Provincia');
  }

  /** Misma localidad = mismo nombre (sin acentos ni mayúsculas) en la misma provincia. */
  private async _assertUnique(repo: ILocalidadRepository, companyId: string, name: string, provinciaId: string | null, exceptId?: string) {
    const n = normalizeProvinciaName(name);
    const clash = (await repo.findAll(companyId)).find((l) =>
      l.id !== exceptId && (l.provinciaId ?? null) === provinciaId && normalizeProvinciaName(l.name) === n);
    if (clash) {
      throw new AppError(`Ya existe la localidad "${clash.name}"${clash.provinciaName ? ` en ${clash.provinciaName}` : ''}`, 400);
    }
  }

  private _log(req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', entityId: string, description: string): void {
    const logRepo = container.resolve<IActivityLogRepository>('ActivityLogRepository');
    logRepo.create({ userId: req.user!.userId, action, entity: 'Localidad', entityId, description })
      .catch(() => { /* log failure is non-critical */ });
  }
}
