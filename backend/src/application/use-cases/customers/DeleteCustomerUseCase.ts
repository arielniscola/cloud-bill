import { inject, injectable } from 'tsyringe';
import { ICustomerRepository } from '../../../domain/repositories/ICustomerRepository';
import { NotFoundError } from '../../../shared/errors/AppError';

@injectable()
export class DeleteCustomerUseCase {
  constructor(
    @inject('CustomerRepository')
    private customerRepository: ICustomerRepository
  ) {}

  async execute(id: string): Promise<void> {
    const existingCustomer = await this.customerRepository.findById(id);

    if (!existingCustomer) {
      throw new NotFoundError('Customer');
    }

    await this.customerRepository.delete(id);
  }
}
