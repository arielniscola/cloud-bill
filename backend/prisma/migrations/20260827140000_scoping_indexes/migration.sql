-- ============================================================================
-- Índices de scoping y ordenamiento
--
-- Toda query del sistema filtra por "companyId", y los listados ordenan por
-- fecha descendente o por nombre. Sin índices que cubran ese par, cada listado
-- es un seq scan + sort: no se nota con miles de filas y se vuelve el cuello de
-- botella con cientos de miles.
--
-- Cada índice de acá abajo responde a una query concreta del código, anotada
-- sobre su definición. No se indexan las tablas de catálogo chicas (marcas,
-- rubros, categorías, cajas, depósitos, config): ahí el índice cuesta más en
-- escritura de lo que ahorra en lectura.
--
-- NOTA PARA PRODUCCIÓN: CREATE INDEX toma un lock de escritura sobre la tabla
-- mientras construye. Con tablas grandes conviene correr estos índices a mano
-- con CREATE INDEX CONCURRENTLY (que no puede ir dentro de una migración de
-- Prisma, porque corren en transacción) y recién después aplicar la migración,
-- que encontrará los índices ya creados gracias al IF NOT EXISTS.
-- ============================================================================

-- ── Ventas ──────────────────────────────────────────────────────────────────

-- PrismaInvoiceRepository.findAll: WHERE companyId = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS "idx_invoices_company_date"
    ON "invoices" ("companyId", "date" DESC);

-- Filtro de estado del listado y totales de la tira de stats
CREATE INDEX IF NOT EXISTS "idx_invoices_company_status"
    ON "invoices" ("companyId", "status");

-- Deuda y comprobantes por cliente (cuenta corriente, detalle de cliente)
CREATE INDEX IF NOT EXISTS "idx_invoices_customer_status"
    ON "invoices" ("customerId", "status");

-- Listados de presupuestos, remitos, recibos y órdenes de pedido: todos
-- filtran por empresa y ordenan por fecha descendente.
CREATE INDEX IF NOT EXISTS "idx_budgets_company_date"
    ON "budgets" ("companyId", "date" DESC);

CREATE INDEX IF NOT EXISTS "idx_remitos_company_date"
    ON "remitos" ("companyId", "date" DESC);

CREATE INDEX IF NOT EXISTS "idx_recibos_company_date"
    ON "recibos" ("companyId", "date" DESC);

CREATE INDEX IF NOT EXISTS "idx_orden_pedidos_company_date"
    ON "orden_pedidos" ("companyId", "date" DESC);

-- ── Compras ─────────────────────────────────────────────────────────────────

-- PrismaPurchaseRepository.findAll: WHERE companyId = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS "idx_purchases_company_date"
    ON "purchases" ("companyId", "date" DESC);

CREATE INDEX IF NOT EXISTS "idx_purchases_supplier_status"
    ON "purchases" ("supplierId", "status");

-- Facturas de compra: listado por empresa y deuda por proveedor
CREATE INDEX IF NOT EXISTS "idx_purchase_invoices_company_date"
    ON "purchase_invoices" ("companyId", "date" DESC);

CREATE INDEX IF NOT EXISTS "idx_purchase_invoices_supplier_status"
    ON "purchase_invoices" ("supplierId", "status");

-- ── Cuentas corrientes ──────────────────────────────────────────────────────

-- PrismaCurrentAccountRepository.getMovements:
--   WHERE currentAccountId IN (...) ORDER BY createdAt DESC
-- account_movements no tiene companyId: se scopea por la cuenta.
CREATE INDEX IF NOT EXISTS "idx_account_movements_account_created"
    ON "account_movements" ("currentAccountId", "createdAt" DESC);

-- _getSupplierCurrencyBalance: el SUM que calcula el saldo del proveedor filtra
-- exactamente por estas tres columnas.
CREATE INDEX IF NOT EXISTS "idx_sam_company_supplier_currency"
    ON "supplier_account_movements" ("companyId", "supplierId", "currency");

-- getSupplierMovements: ORDER BY sam."createdAt" DESC sobre el proveedor
CREATE INDEX IF NOT EXISTS "idx_sam_supplier_created"
    ON "supplier_account_movements" ("supplierId", "createdAt" DESC);

-- ── Stock ───────────────────────────────────────────────────────────────────

-- Listado de movimientos de stock: ORDER BY sm."createdAt" DESC, filtrando por
-- producto o por depósito. Son las tablas que más crecen del sistema.
CREATE INDEX IF NOT EXISTS "idx_stock_movements_product_created"
    ON "stock_movements" ("productId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_stock_movements_warehouse_created"
    ON "stock_movements" ("warehouseId", "createdAt" DESC);

-- ── Catálogo y terceros ─────────────────────────────────────────────────────

-- El catálogo se lista y se busca siempre dentro de la empresa, filtrando
-- activos. products ya tiene el unique (companyId, sku), que sirve para la
-- búsqueda exacta por código pero no para el listado filtrado por estado.
CREATE INDEX IF NOT EXISTS "idx_products_company_active"
    ON "products" ("companyId", "isActive");

-- PrismaCustomerRepository / PrismaSupplierRepository.findAll:
--   WHERE companyId = ? ORDER BY name ASC
CREATE INDEX IF NOT EXISTS "idx_customers_company_name"
    ON "customers" ("companyId", "name");

CREATE INDEX IF NOT EXISTS "idx_suppliers_company_name"
    ON "suppliers" ("companyId", "name");

-- ── Bancos ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_bank_movements_company_date"
    ON "bank_movements" ("companyId", "date" DESC);
