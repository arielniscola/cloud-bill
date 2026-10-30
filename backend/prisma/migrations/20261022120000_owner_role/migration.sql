-- Rol "Dueño" de la empresa: todo lo de ADMIN + aprueba las acciones
-- protegidas (anulaciones, devoluciones). Va en su propia migración porque un
-- valor nuevo de enum no se puede usar en la misma transacción que lo crea.
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'OWNER';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
