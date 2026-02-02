import 'reflect-metadata';
import { container } from 'tsyringe';

import { IUserRepository } from '../domain/repositories/IUserRepository';
import { ICustomerRepository } from '../domain/repositories/ICustomerRepository';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { ICategoryRepository } from '../domain/repositories/ICategoryRepository';
import { IInvoiceRepository } from '../domain/repositories/IInvoiceRepository';
import { ICurrentAccountRepository } from '../domain/repositories/ICurrentAccountRepository';
import { IWarehouseRepository, IStockRepository } from '../domain/repositories/IWarehouseRepository';

import { PrismaUserRepository } from '../infrastructure/database/repositories/PrismaUserRepository';
import { PrismaCustomerRepository } from '../infrastructure/database/repositories/PrismaCustomerRepository';
import { PrismaProductRepository } from '../infrastructure/database/repositories/PrismaProductRepository';
import { PrismaCategoryRepository } from '../infrastructure/database/repositories/PrismaCategoryRepository';
import { PrismaInvoiceRepository } from '../infrastructure/database/repositories/PrismaInvoiceRepository';
import { PrismaCurrentAccountRepository } from '../infrastructure/database/repositories/PrismaCurrentAccountRepository';
import { PrismaWarehouseRepository } from '../infrastructure/database/repositories/PrismaWarehouseRepository';
import { PrismaStockRepository } from '../infrastructure/database/repositories/PrismaStockRepository';

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

export { container };
