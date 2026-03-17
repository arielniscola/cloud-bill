import { injectable } from 'tsyringe';
import prisma from '../prisma';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { Company, CreateCompanyInput, UpdateCompanyInput } from '../../../domain/entities/Company';

const db = prisma as any;

function parseModules(raw: string | null | undefined): string[] {
  if (!raw || raw === 'ALL') return ['ALL'];
  return raw.split(',').filter(Boolean);
}

async function withModules(company: any): Promise<Company> {
  const rows = await prisma.$queryRaw<{ enabledModules: string }[]>`
    SELECT "enabledModules" FROM companies WHERE id = ${company.id}
  `;
  return { ...company, enabledModules: parseModules(rows[0]?.enabledModules) };
}

async function withModulesMany(companies: any[]): Promise<Company[]> {
  if (companies.length === 0) return [];
  const ids = companies.map(c => c.id);
  const rows = await prisma.$queryRaw<{ id: string; enabledModules: string }[]>`
    SELECT id, "enabledModules" FROM companies WHERE id = ANY(${ids}::text[])
  `;
  const map = new Map(rows.map(r => [r.id, parseModules(r.enabledModules)]));
  return companies.map(c => ({ ...c, enabledModules: map.get(c.id) ?? ['ALL'] }));
}

@injectable()
export class PrismaCompanyRepository implements ICompanyRepository {
  async findAll(): Promise<Company[]> {
    const companies = await db.company.findMany({ orderBy: { name: 'asc' } });
    return withModulesMany(companies);
  }

  async findById(id: string): Promise<Company | null> {
    const company = await db.company.findUnique({ where: { id } });
    if (!company) return null;
    return withModules(company);
  }

  async create(data: CreateCompanyInput): Promise<Company> {
    const company = await db.company.create({ data });
    return withModules(company);
  }

  async update(id: string, data: UpdateCompanyInput): Promise<Company> {
    const company = await db.company.update({ where: { id }, data });
    return withModules(company);
  }

  async updateModules(id: string, enabledModules: string[]): Promise<Company> {
    const raw = enabledModules.includes('ALL') ? 'ALL' : enabledModules.join(',');
    await prisma.$executeRaw`UPDATE companies SET "enabledModules" = ${raw} WHERE id = ${id}`;
    const company = await db.company.findUnique({ where: { id } });
    return withModules(company);
  }

  async delete(id: string): Promise<void> {
    await db.company.delete({ where: { id } });
  }
}
