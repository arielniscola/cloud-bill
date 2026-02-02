import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { RegisterDTO } from '../../dtos/auth.dto';
import { ConflictError } from '../../../shared/errors/AppError';
import { User } from '../../../domain/entities/User';

@injectable()
export class RegisterUseCase {
  constructor(
    @inject('UserRepository')
    private userRepository: IUserRepository
  ) {}

  async execute(data: RegisterDTO): Promise<Omit<User, 'password'>> {
    const existingUser = await this.userRepository.findByEmail(data.email);

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.userRepository.create({
      email: data.email,
      password: hashedPassword,
      name: data.name,
      role: data.role || 'SELLER',
      isActive: true,
    });

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
