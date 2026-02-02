import { inject, injectable } from 'tsyringe';
import { ICustomerRepository, CustomerFilters } from '../../../domain/repositories/ICustomerRepository';
import { Customer } from '../../../domain/entities/Customer';
import { PaginationParams, PaginatedResult } from '../../../shared/types';

@injectable()
export class ListCustomersUseCase {
  constructor(
    @inject('CustomerRepository')
    private customerRepository: ICustomerRepository
  ) {}

  async execute(
    pagination?: PaginationParams,
    filters?: CustomerFilters
  ): Promise<PaginatedResult<Customer>> {
    return this.customerRepository.findAll(pagination, filters);
  }
}
