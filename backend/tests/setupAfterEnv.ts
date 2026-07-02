import prisma from '../src/infrastructure/database/prisma';

// Cierra la conexión del singleton de la app para que jest pueda terminar.
afterAll(async () => {
  await prisma.$disconnect();
});
