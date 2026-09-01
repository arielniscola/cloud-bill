-- Imagen del producto. Se guardan dos cosas:
--   imageUrl → URL pública que consume el frontend (CDN o proxy local)
--   imageKey → key del objeto en el bucket, necesaria para poder borrarlo
--              cuando se reemplaza o se elimina la imagen. Sin la key habría
--              que parsear la URL, que cambia si se cambia de proveedor.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "imageKey" TEXT;
