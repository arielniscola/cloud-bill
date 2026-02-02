import { inject, injectable } from 'tsyringe';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { Customer } from '../../../domain/entities/Customer';
import { NotFoundError } from '../../../shared/errors/AppError';

@injectable()
export class GetCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private customerRepository: ICustomerRepository
  ) {}

  async execute(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findById(id);

    if (!customer) {
      throw new NotFoundError('Customer');
    }

    return customer;
  }
}
