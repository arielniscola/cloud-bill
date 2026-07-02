import { randomUUID } from 'crypto';
import prisma from '../prisma';
import { ICardRepository } from '../../../domain/repositories/ICardRepository';
import { Card, CardSurcharge, CreateCardInput, UpdateCardInput } from '../../../domain/entities/Card';

type RawCard = {
  id: string;
  name: string;
  type: string;
  bank: string | null;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
};

type RawSurcharge = {
  id: string;
  cardId: string;
  installments: number;
  surchargePercent: string | number;
  createdAt: Date;
  updatedAt: Date;
};

function mapSurcharge(s: RawSurcharge): CardSurcharge {
  return {
    id: s.id,
    cardId: s.cardId,
    installments: Number(s.installments),
    surchargePercent: Number(s.surchargePercent),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

async function getSurchargesForCards(cardIds: string[]): Promise<Map<string, CardSurcharge[]>> {
  if (cardIds.length === 0) return new Map();
  const surcharges = await prisma.$queryRaw<RawSurcharge[]>`
    SELECT * FROM "card_surcharges"
    WHERE "cardId" = ANY(${cardIds}::text[])
    ORDER BY "installments" ASC
  `;
  const map = new Map<string, CardSurcharge[]>();
  for (const s of surcharges) {
    if (!map.has(s.cardId)) map.set(s.cardId, []);
    map.get(s.cardId)!.push(mapSurcharge(s));
  }
  return map;
}

export class PrismaCardRepository implements ICardRepository {
  async findAll(companyId: string): Promise<Card[]> {
    const cards = await prisma.$queryRaw<RawCard[]>`
      SELECT * FROM "cards"
      WHERE "companyId" = ${companyId}
      ORDER BY "name" ASC
    `;
    const surchargesMap = await getSurchargesForCards(cards.map((c) => c.id));
    return cards.map((c) => ({
      ...c,
      surcharges: surchargesMap.get(c.id) ?? [],
    }));
  }

  async findById(id: string, companyId?: string): Promise<Card | null> {
    const rows = companyId
      ? await prisma.$queryRaw<RawCard[]>`
          SELECT * FROM "cards" WHERE id = ${id} AND "companyId" = ${companyId} LIMIT 1
        `
      : await prisma.$queryRaw<RawCard[]>`
          SELECT * FROM "cards" WHERE id = ${id} LIMIT 1
        `;
    if (!rows[0]) return null;
    const surchargesMap = await getSurchargesForCards([id]);
    return {
      ...rows[0],
      surcharges: surchargesMap.get(id) ?? [],
    };
  }

  async create(data: CreateCardInput): Promise<Card> {
    const id = randomUUID();
    const now = new Date();
    const bank = data.bank ?? null;
    const isActive = data.isActive ?? true;

    await prisma.$executeRaw`
      INSERT INTO "cards" (id, name, type, bank, "isActive", "companyId", "createdAt", "updatedAt")
      VALUES (${id}, ${data.name}, ${data.type}, ${bank}, ${isActive}, ${data.companyId}, ${now}, ${now})
    `;

    if (data.surcharges && data.surcharges.length > 0) {
      await this._upsertSurcharges(id, data.surcharges);
    }

    return (await this.findById(id))!;
  }

  async update(id: string, data: UpdateCardInput): Promise<Card> {
    const now = new Date();
    const parts: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { parts.push(`name = $${parts.length + 1}`); values.push(data.name); }
    if (data.type !== undefined) { parts.push(`type = $${parts.length + 1}`); values.push(data.type); }
    if ('bank' in data) { parts.push(`bank = $${parts.length + 1}`); values.push(data.bank ?? null); }
    if (data.isActive !== undefined) { parts.push(`"isActive" = $${parts.length + 1}`); values.push(data.isActive); }

    if (parts.length > 0) {
      // Build raw update with Prisma $executeRawUnsafe for dynamic fields
      const setClause = parts.join(', ');
      values.push(now, id);
      await prisma.$executeRawUnsafe(
        `UPDATE "cards" SET ${setClause}, "updatedAt" = $${values.length - 1} WHERE id = $${values.length}`,
        ...values
      );
    }

    if (data.surcharges !== undefined) {
      // Delete all existing surcharges and re-insert
      await prisma.$executeRaw`DELETE FROM "card_surcharges" WHERE "cardId" = ${id}`;
      if (data.surcharges.length > 0) {
        await this._upsertSurcharges(id, data.surcharges);
      }
    }

    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await prisma.$executeRaw`UPDATE "cards" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ${id}`;
  }

  private async _upsertSurcharges(
    cardId: string,
    surcharges: Array<{ installments: number; surchargePercent: number }>
  ): Promise<void> {
    for (const s of surcharges) {
      const sid = randomUUID();
      const now = new Date();
      const pct = s.surchargePercent;
      await prisma.$executeRaw`
        INSERT INTO "card_surcharges" (id, "cardId", installments, "surchargePercent", "createdAt", "updatedAt")
        VALUES (${sid}, ${cardId}, ${s.installments}, ${pct}, ${now}, ${now})
        ON CONFLICT ("cardId", installments)
        DO UPDATE SET "surchargePercent" = EXCLUDED."surchargePercent", "updatedAt" = EXCLUDED."updatedAt"
      `;
    }
  }
}
