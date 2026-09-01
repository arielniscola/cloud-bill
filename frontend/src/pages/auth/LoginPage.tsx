import { InputHTMLAttributes, ReactNode, forwardRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Check, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuthStore } from '../../stores';
import { authService } from '../../services';
import { Button } from '../../components/ui';

const loginSchema = z.object({
  username: z.string().min(1, 'El usuario es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Campo propio del login: mismos tokens que `ui/Input` pero con alto de 44px
 * (48 en mobile) e ícono adentro. No se toca el Input compartido para no
 * cambiar la densidad del resto de la app.
 */
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon: ReactNode;
  trailing?: ReactNode;
}

const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, icon, trailing, id, className, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div>
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5"
        >
          {label}
        </label>
        <div className="relative">
          <span
            className={clsx(
              'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2',
              error ? 'text-red-400' : 'text-gray-400 dark:text-slate-500'
            )}
          >
            {icon}
          </span>
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'block w-full h-12 sm:h-11 rounded-lg border shadow-sm text-sm transition-colors',
              'pl-10 placeholder:text-gray-400 dark:placeholder:text-slate-500',
              trailing ? 'pr-11' : 'pr-3',
              'focus:ring-2 focus:ring-offset-0 focus:outline-none',
              error
                ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500/20 bg-red-50/30 dark:bg-red-900/10'
                : 'border-gray-200 dark:border-slate-600 focus:border-primary-500 focus:ring-primary-500/20 bg-white dark:bg-slate-800 dark:text-slate-200',
              className
            )}
            {...props}
          />
          {trailing && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
);

Field.displayName = 'Field';

const CloudMark = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.6}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
    />
  </svg>
);

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="min-h-screen flex bg-white dark:bg-slate-950">
      {/* ── Panel de marca ── */}
      <div className="hidden lg:flex lg:w-[540px] xl:w-[620px] flex-shrink-0 flex-col justify-between bg-[#0f172a] p-14 relative overflow-hidden">
        <div className="absolute -top-44 -right-40 w-[520px] h-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.20)_0%,rgba(99,102,241,0)_70%)]" />

        <div className="relative flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-primary-600 flex items-center justify-center">
            <CloudMark className="w-[21px] h-[21px] text-white" />
          </div>
          <span className="text-white text-[19px] font-bold tracking-tight">Cloud Bill</span>
        </div>

        <div className="relative">
          <h1 className="text-white text-4xl xl:text-[40px] font-bold leading-[1.14] tracking-tight max-w-[460px] text-pretty">
            Facturación, stock y cuentas corrientes en un solo lugar.
          </h1>
          <p className="mt-[18px] mb-10 text-slate-400 text-base leading-relaxed max-w-[400px]">
            Emitís con CAE de ARCA, descontás stock y registrás el movimiento de cuenta en la misma
            operación.
          </p>

          {/* Comprobante de muestra */}
          <div className="w-[420px] max-w-full bg-white rounded-xl shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)] overflow-hidden">
            <div className="flex items-center justify-between px-[18px] py-3.5 border-b border-gray-200">
              <div className="flex items-center gap-2.5">
                <div className="w-[26px] h-[26px] rounded-[7px] bg-primary-50 flex items-center justify-center">
                  <span className="text-primary-600 text-[13px] font-extrabold leading-none">A</span>
                </div>
                <div>
                  <div className="text-gray-900 text-[13px] font-semibold leading-tight">
                    Factura A
                  </div>
                  <div className="text-gray-400 text-[11px] leading-tight">0001-00001284</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                <Check className="w-3 h-3" strokeWidth={3} />
                Autorizada
              </span>
            </div>
            <div className="px-[18px] py-3.5 flex flex-col gap-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-gray-500 text-xs">Neto gravado</span>
                <span className="text-gray-700 text-xs tabular-nums">$ 1.061.983,47</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-gray-500 text-xs">IVA 21%</span>
                <span className="text-gray-700 text-xs tabular-nums">$ 223.016,53</span>
              </div>
              <div className="h-px bg-gray-100 my-0.5" />
              <div className="flex justify-between items-baseline">
                <span className="text-gray-900 text-[13px] font-semibold">Total</span>
                <span className="text-gray-900 text-[17px] font-bold tracking-tight tabular-nums">
                  $ 1.285.000,00
                </span>
              </div>
            </div>
            <div className="px-[18px] py-2.5 bg-gray-50 border-t border-gray-100 flex gap-[18px]">
              <span className="text-gray-400 text-[11px]">
                CAE <span className="text-gray-500 tabular-nums">75304118926314</span>
              </span>
              <span className="text-gray-400 text-[11px]">
                Vto. <span className="text-gray-500 tabular-nums">05/09/2026</span>
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex gap-6 text-slate-500 text-xs">
          <span>Facturación ARCA</span>
          <span>Libro IVA</span>
          <span>Cuenta corriente</span>
          <span>Stock</span>
        </div>
      </div>

      {/* ── Formulario ── */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-14 py-12">
        <div className="w-full max-w-[384px] mx-auto">
          {/* Marca en mobile: el panel de la izquierda no se muestra */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-[10px] bg-primary-600 flex items-center justify-center">
              <CloudMark className="w-5 h-5 text-white" />
            </div>
            <span className="text-gray-900 dark:text-white text-lg font-bold tracking-tight">
              Cloud Bill
            </span>
          </div>

          <h2 className="text-gray-900 dark:text-white text-2xl sm:text-[26px] font-bold tracking-tight">
            Iniciar sesión
          </h2>
          <p className="mt-1.5 mb-8 text-gray-500 dark:text-slate-400 text-sm">
            Ingresá con el usuario de tu empresa.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-[18px]">
            <Field
              label="Usuario"
              type="text"
              placeholder="tu.usuario"
              autoComplete="username"
              autoFocus
              icon={<User className="w-[17px] h-[17px]" />}
              error={errors.username?.message}
              {...register('username')}
            />

            <Field
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              icon={<Lock className="w-[17px] h-[17px]" />}
              error={errors.password?.message}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  {showPassword ? (
                    <EyeOff className="w-[17px] h-[17px]" />
                  ) : (
                    <Eye className="w-[17px] h-[17px]" />
                  )}
                </button>
              }
              {...register('password')}
            />

            <Button type="submit" className="w-full h-12 sm:h-11 mt-1" isLoading={isLoading}>
              Iniciar sesión
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-slate-800">
            <p className="text-gray-400 dark:text-slate-500 text-[12.5px] leading-relaxed">
              ¿No podés entrar? Escribile al administrador de tu empresa para que restablezca tu
              acceso.
            </p>
          </div>

          <p className="mt-14 text-gray-300 dark:text-slate-700 text-[11.5px]">
            © {new Date().getFullYear()} Cloud Bill
          </p>
        </div>
      </div>
    </div>
  );
}
