import 'reflect-metadata';
import { container } from 'tsyringe';

import { IUserRepository } from '../domain/repositories/IUserRepository';
import { ICustomerRepository } from '../domain/repositories/ICustomerRepository';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { ICategoryRepository } from '../domain/repositories/ICategoryRepository';
import { IInvoiceRepository } from '../domain/repositories/IInvoiceRepository';
import { ICurrentAccountRepository } from '../domain/repositories/ICurrentAccountRepository';
import { IWarehouseRepository, IStockRepository } from '../domain/repositories/IWarehouseRepository';
import { IRemitoRepository } from '../domain/repositories/IRemitoRepository';
import { ICashRegisterRepository } from '../domain/repositories/ICashRegisterRepository';
import { IActivityLogRepository } from '../domain/repositories/IActivityLogRepository';
import { IAfipConfigRepository } from '../domain/repositories/IAfipConfigRepository';
import { ISupplierRepository } from '../domain/repositories/ISupplierRepository';
import { IPurchaseRepository } from '../domain/repositories/IPurchaseRepository';
import { IBrandRepository } from '../domain/repositories/IBrandRepository';
import { IBudgetRepository } from '../domain/repositories/IBudgetRepository';
import { IAppSettingsRepository } from '../domain/repositories/IAppSettingsRepository';
import { IStockIntelligenceRepository } from '../domain/repositories/IStockIntelligenceRepository';
import { IReciboRepository } from '../domain/repositories/IReciboRepository';
import { IOrdenPedidoRepository } from '../domain/repositories/IOrdenPedidoRepository';
import { IOrdenCompraRepository } from '../domain/repositories/IOrdenCompraRepository';

import { PrismaUserRepository } from '../infrastructure/database/repositories/PrismaUserRepository';
import { PrismaCustomerRepository } from '../infrastructure/database/repositories/PrismaCustomerRepository';
import { PrismaProductRepository } from '../infrastructure/database/repositories/PrismaProductRepository';
import { PrismaCategoryRepository } from '../infrastructure/database/repositories/PrismaCategoryRepository';
import { PrismaInvoiceRepository } from '../infrastructure/database/repositories/PrismaInvoiceRepository';
import { PrismaCurrentAccountRepository } from '../infrastructure/database/repositories/PrismaCurrentAccountRepository';
import { PrismaWarehouseRepository } from '../infrastructure/database/repositories/PrismaWarehouseRepository';
import { PrismaStockRepository } from '../infrastructure/database/repositories/PrismaStockRepository';
import { PrismaRemitoRepository } from '../infrastructure/database/repositories/PrismaRemitoRepository';
import { PrismaCashRegisterRepository } from '../infrastructure/database/repositories/PrismaCashRegisterRepository';
import { PrismaActivityLogRepository } from '../infrastructure/database/repositories/PrismaActivityLogRepository';
import { PrismaAfipConfigRepository } from '../infrastructure/database/repositories/PrismaAfipConfigRepository';
import { PrismaSupplierRepository } from '../infrastructure/database/repositories/PrismaSupplierRepository';
import { PrismaPurchaseRepository } from '../infrastructure/database/repositories/PrismaPurchaseRepository';
import { PrismaBrandRepository } from '../infrastructure/database/repositories/PrismaBrandRepository';
import { PrismaBudgetRepository } from '../infrastructure/database/repositories/PrismaBudgetRepository';
import { PrismaAppSettingsRepository } from '../infrastructure/database/repositories/PrismaAppSettingsRepository';
import { PrismaStockIntelligenceRepository } from '../infrastructure/database/repositories/PrismaStockIntelligenceRepository';
import { PrismaReciboRepository } from '../infrastructure/database/repositories/PrismaReciboRepository';
import { PrismaOrdenPedidoRepository } from '../infrastructure/database/repositories/PrismaOrdenPedidoRepository';
import { PrismaOrdenCompraRepository } from '../infrastructure/database/repositories/PrismaOrdenCompraRepository';

// Repository registrations
container.registerSingleton<IUserRepository>('UserRepository', PrismaUserRepository);
container.registerSingleton<ICustomerRepository>('CustomerRepository', PrismaCustomerRepository);
container.registerSingleton<IProductRepository>('ProductRepository', PrismaProductRepository);
container.registerSingleton<ICategoryRepository>('CategoryRepository', PrismaCategoryRepository);
container.registerSingleton<IInvoiceRepository>('InvoiceRepository', PrismaInvoiceRepository);
container.registerSingleton<ICurrentAccountRepository>(
  'CurrentAccountRepository',
  PrismaCurrentAccountRepository
);
container.registerSingleton<IWarehouseRepository>('WarehouseRepository', PrismaWarehouseRepository);
container.registerSingleton<IStockRepository>('StockRepository', PrismaStockRepository);
container.registerSingleton<IRemitoRepository>('RemitoRepository', PrismaRemitoRepository);
container.registerSingleton<ICashRegisterRepository>('CashRegisterRepository', PrismaCashRegisterRepository);
container.registerSingleton<IActivityLogRepository>('ActivityLogRepository', PrismaActivityLogRepository);
container.registerSingleton<IAfipConfigRepository>('AfipConfigRepository', PrismaAfipConfigRepository);
container.registerSingleton<ISupplierRepository>('SupplierRepository', PrismaSupplierRepository);
container.registerSingleton<IPurchaseRepository>('PurchaseRepository', PrismaPurchaseRepository);
container.registerSingleton<IBrandRepository>('BrandRepository', PrismaBrandRepository);
container.registerSingleton<IBudgetRepository>('BudgetRepository', PrismaBudgetRepository);
container.registerSingleton<IAppSettingsRepository>('AppSettingsRepository', PrismaAppSettingsRepository);
container.registerSingleton<IStockIntelligenceRepository>('StockIntelligenceRepository', PrismaStockIntelligenceRepository);
container.registerSingleton<IReciboRepository>('ReciboRepository', PrismaReciboRepository);
container.registerSingleton<IOrdenPedidoRepository>('OrdenPedidoRepository', PrismaOrdenPedidoRepository);
container.registerSingleton<IOrdenCompraRepository>('OrdenCompraRepository', PrismaOrdenCompraRepository);

export { container };
