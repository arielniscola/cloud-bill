import { Request, Response, NextFunction } from 'express';
import { container } from 'tsyringe';
import { RegisterUseCase } from '../../../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const registerUseCase = container.resolve(RegisterUseCase);
      const user = await registerUseCase.execute(req.body);

      res.status(201).json({
        status: 'success',
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const loginUseCase = container.resolve(LoginUseCase);
      const result = await loginUseCase.execute(req.body);

      res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
