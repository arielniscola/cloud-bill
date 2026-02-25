import { inject, injectable } from 'tsyringe';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { ICurrentAccountRepository } from '../../../domain/repositories/ICurrentAccountRepository';
import { CreateCustomerDTO } from '../../dtos/customer.dto';
import { Customer } from '../../../domain/entities/Customer';
import { ConflictError } from '../../../shared/errors/AppError';

@injectable()
export class CreateCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private customerRepository: ICustomerRepository,
    @inject('CurrentAccountRepository')
    private currentAccountRepository: ICurrentAccountRepository
  ) {}

  async execute(data: CreateCustomerDTO): Promise<Customer> {
    if (data.taxId) {
      const existingCustomer = await this.customerRepository.findByTaxId(data.taxId);
      if (existingCustomer) {
        throw new ConflictError('Customer with this tax ID already exists');
      }
    }

    const customer = await this.customerRepository.create({
      name: data.name,
      taxId: data.taxId ?? null,
      taxCondition: data.taxCondition,
      address: data.address ?? null,
      city: data.city ?? null,
      province: data.province ?? null,
      postalCode: data.postalCode ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      notes: data.notes ?? null,
      isActive: data.isActive,
    });

    await this.currentAccountRepository.createForCustomer(customer.id, 'ARS');

    return customer;
  }
}
