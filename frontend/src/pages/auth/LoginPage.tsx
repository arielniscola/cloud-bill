import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores';
import { authService } from '../../services';
import { Button, Input } from '../../components/ui';

const loginSchema = z.object({
  username: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await authService.login(data);
      setAuth(response.user, response.token);
      toast.success(`Bienvenido, ${response.user.name}`);
      navigate(from, { replace: true });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-16 left-16 w-64 h-64 rounded-full border-4 border-white" />
          <div className="absolute bottom-24 right-12 w-96 h-96 rounded-full border-4 border-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-white" />
        </div>

        <div className="relative z-10 text-center text-white">
          {/* Branding */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30 shadow-2xl">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
              </svg>
            </div>
            <div className="text-left">
              <h1 className="text-4xl font-extrabold tracking-tight leading-none">Cloud Bill</h1>
              <p className="text-sm font-light text-primary-200 tracking-widest uppercase">Facturación · Stock · Gestión</p>
            </div>
          </div>

          <p className="text-lg font-light text-primary-200 mb-10">
            Sistema de Gestión Empresarial
          </p>

          {/* Feature pills */}
          <div className="flex flex-col gap-3 text-left max-w-xs mx-auto">
            {[
              { icon: '📄', label: 'Facturación electrónica AFIP' },
              { icon: '📦', label: 'Control de stock e inventario' },
              { icon: '💰', label: 'Gestión de compras y pagos' },
              { icon: '📊', label: 'Dashboard y reportes' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3 backdrop-blur-sm border border-white/20">
                <span className="text-lg">{icon}</span>
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-slate-950 px-8 py-12">
        {/* Mobile logo */}
        <div className="lg:hidden text-center mb-8">
          <img src="/logo.png" alt="Cloud Bill" className="h-14 w-auto mx-auto mb-1" />
          <p className="text-sm text-gray-500 dark:text-slate-400">Sistema de Gestión Empresarial</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Ingresá tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Usuario"
              type="text"
              autoComplete="username"
              {...register('username')}
              error={errors.username?.message}
            />

            <Input
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              error={errors.password?.message}
            />

            <Button
              type="submit"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Iniciar sesión
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-gray-400 dark:text-slate-600">
            © {new Date().getFullYear()} Cloud Bill — Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
