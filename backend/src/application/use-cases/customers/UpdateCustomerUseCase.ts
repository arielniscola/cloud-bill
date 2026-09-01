import { inject, injectable } from 'tsyringe';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { UpdateCustomerDTO } from '../../dtos/customer.dto';
import { Customer } from '../../../domain/entities/Customer';
import { NotFoundError, ConflictError } from '../../../shared/errors/AppError';

@injectable()
export class UpdateCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private customerRepository: ICustomerRepository
  ) {}

  async execute(id: string, data: UpdateCustomerDTO, companyId?: string): Promise<Customer> {
    const existingCustomer = await this.customerRepository.findById(id, companyId);

    if (!existingCustomer) {
      throw new NotFoundError('Customer');
    }

    if (data.taxId && data.taxId !== existingCustomer.taxId) {
      const customerWithTaxId = await this.customerRepository.findByTaxId(
        data.taxId,
        companyId ?? (existingCustomer as any).companyId
      );
      if (customerWithTaxId && customerWithTaxId.id !== id) {
        throw new ConflictError('Ya existe un cliente con este CUIT en tu empresa');
      }
    }

    return this.customerRepository.update(id, {
      name: data.name,
      taxId: data.taxId,
      taxCondition: data.taxCondition,
      address: data.address,
      city: data.city,
      province: data.province,
      postalCode: data.postalCode,
      phone: data.phone,
      email: data.email,
      notes: data.notes,
      isActive: data.isActive,
    });
  }
}
