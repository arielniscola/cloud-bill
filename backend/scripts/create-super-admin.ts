/**
 * Run once to create the super admin user:
 *   npx ts-node scripts/create-super-admin.ts
 */
import 'reflect-metadata';
import bcrypt from 'bcryptjs';
import prisma from '../src/infrastructure/database/prisma';

const USERNAME = 'superadmin';
const PASSWORD = 'superadmin123';
const NAME     = 'Super Administrador';

async function main() {
  const existing = await (prisma as any).user.findUnique({ where: { username: USERNAME } });

  if (existing) {
    console.log(`⚠️  Ya existe un usuario con username "${USERNAME}".`);
    console.log(`   ID: ${existing.id}  |  Rol: ${existing.role}`);
    return;
  }

  const hashed = await bcrypt.hash(PASSWORD, 10);

  const user = await (prisma as any).user.create({
    data: {
      username:  USERNAME,
      password:  hashed,
      name:      NAME,
      role:      'SUPER_ADMIN',
      isActive:  true,
      companyId: null,   // Super admin no pertenece a ninguna empresa
    },
  });

  console.log('✅ Super admin creado exitosamente:');
  console.log(`   Usuario:    ${USERNAME}`);
  console.log(`   Contraseña: ${PASSWORD}`);
  console.log(`   ID:         ${user.id}`);
  console.log('');
  console.log('⚠️  Cambiá la contraseña luego del primer login.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
