import { useState } from 'react';
import { clsx } from 'clsx';
import { Monitor, Building2, Landmark, PackageSearch, LayoutDashboard, AlignJustify, Sun, Moon, Mail, Users, Store, Check } from 'lucide-react';
import { PageHeader } from '../../components/shared';
import { Card } from '../../components/ui';
import { useUIStore } from '../../stores';
import { NAV_THEMES } from '../../utils/navThemes';
import { usePermissions } from '../../hooks/usePermissions';
import AfipSettingsCard from './AfipSettingsCard';
import SmtpSettingsCard from './SmtpSettingsCard';
import BudgetSettingsCard from './BudgetSettingsCard';
import StockSettingsCard from './StockSettingsCard';
import PriceSettingsCard from './PriceSettingsCard';
import PrintSettingsCard from './PrintSettingsCard';
import UsersSettingsCard from './UsersSettingsCard';
import CompanySettingsCard from './CompanySettingsCard';

// ── Types ──────────────────────────────────────────────────────────
type Tab = 'general' | 'empresa' | 'operaciones' | 'stock' | 'correo' | 'usuarios' | 'empresas';

const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; description: string; superAdminOnly?: boolean }[] = [
  { id: 'general',     label: 'General',     icon: Monitor,       description: 'Apariencia y preferencias' },
  { id: 'empresa',     label: 'Empresa',     icon: Building2,     description: 'Datos fiscales y ARCA/AFIP' },
  { id: 'operaciones', label: 'Operaciones', icon: Landmark,      description: 'Cajas predeterminadas' },
  { id: 'stock',       label: 'Stock',       icon: PackageSearch, description: 'Análisis inteligente' },
  { id: 'correo',      label: 'Correo',      icon: Mail,          description: 'Configuración SMTP para envío de emails' },
  { id: 'usuarios',    label: 'Usuarios',    icon: Users,         description: 'Gestión de usuarios y roles de acceso' },
  { id: 'empresas',    label: 'Empresas',    icon: Store,         description: 'Gestión de empresas y puntos de venta', superAdminOnly: true },
];

// ── Sub-components ─────────────────────────────────────────────────
function MenuTypeCard() {
  const { menuType, setMenuType } = useUIStore();

  return (
    <Card>
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tipo de menú</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Elegí cómo querés ver la navegación principal.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => setMenuType('sidebar')}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
            menuType === 'sidebar'
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 ring-1 ring-indigo-300'
              : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300'
          )}
        >
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            menuType === 'sidebar' ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-slate-600'
          )}>
            <LayoutDashboard className={clsx('w-5 h-5', menuType === 'sidebar' ? 'text-indigo-600' : 'text-gray-400 dark:text-slate-400')} />
          </div>
          <div>
            <p className={clsx('text-sm font-medium', menuType === 'sidebar' ? 'text-indigo-800 dark:text-indigo-400' : 'text-gray-700 dark:text-slate-300')}>
              Sidebar lateral
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Panel fijo o contraíble a la izquierda</p>
          </div>
        </button>

        <button
          onClick={() => setMenuType('navbar')}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
            menuType === 'navbar'
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 ring-1 ring-indigo-300'
              : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300'
          )}
        >
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            menuType === 'navbar' ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-slate-600'
          )}>
            <AlignJustify className={clsx('w-5 h-5', menuType === 'navbar' ? 'text-indigo-600' : 'text-gray-400 dark:text-slate-400')} />
          </div>
          <div>
            <p className={clsx('text-sm font-medium', menuType === 'navbar' ? 'text-indigo-800 dark:text-indigo-400' : 'text-gray-700 dark:text-slate-300')}>
              Navbar superior
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Barra horizontal fija en la parte de arriba</p>
          </div>
        </button>
      </div>
    </Card>
  );
}

function NavColorCard() {
  const { navTheme, setNavTheme } = useUIStore();

  return (
    <Card>
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Color de la navegación</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Elegí el color del sidebar y la barra superior.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {NAV_THEMES.map((t) => {
          const isActive = navTheme === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setNavTheme(t.key)}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all duration-150',
                isActive
                  ? 'border-indigo-400 ring-1 ring-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 bg-white dark:bg-slate-700'
              )}
            >
              {/* Swatch */}
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 shadow-inner"
                style={{ backgroundColor: t.bg }}
              >
                {isActive && <Check className="w-3.5 h-3.5 text-white" />}
              </span>
              <span className={clsx(
                'text-sm font-medium',
                isActive ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-700 dark:text-slate-300'
              )}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function DarkModeCard() {
  const { isDarkMode, toggleDarkMode } = useUIStore();

  return (
    <Card>
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tema de la interfaz</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
          Elegí entre el modo claro u oscuro.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => isDarkMode && toggleDarkMode()}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
            !isDarkMode
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 ring-1 ring-indigo-300'
              : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300'
          )}
        >
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            !isDarkMode ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-slate-600'
          )}>
            <Sun className={clsx('w-5 h-5', !isDarkMode ? 'text-indigo-600' : 'text-gray-400 dark:text-slate-400')} />
          </div>
          <div>
            <p className={clsx('text-sm font-medium', !isDarkMode ? 'text-indigo-800 dark:text-indigo-400' : 'text-gray-700 dark:text-slate-300')}>
              Modo claro
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Fondo blanco, ideal para ambientes con luz</p>
          </div>
        </button>

        <button
          onClick={() => !isDarkMode && toggleDarkMode()}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
            isDarkMode
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 ring-1 ring-indigo-300'
              : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-300'
          )}
        >
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            isDarkMode ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-gray-100 dark:bg-slate-600'
          )}>
            <Moon className={clsx('w-5 h-5', isDarkMode ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-slate-400')} />
          </div>
          <div>
            <p className={clsx('text-sm font-medium', isDarkMode ? 'text-indigo-800 dark:text-indigo-400' : 'text-gray-700 dark:text-slate-300')}>
              Modo oscuro
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">Fondo oscuro, reduce la fatiga visual</p>
          </div>
        </button>
      </div>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function SettingsPage() {
  const { isSuperAdmin } = usePermissions();
  const TABS = ALL_TABS.filter(t => !t.superAdminOnly || isSuperAdmin);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const active = TABS.find(t => t.id === activeTab) ?? TABS[0];

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Ajustá las preferencias de tu cuenta y empresa"
      />

      {/* ── Tab navigation ── */}
      <div className="flex overflow-x-auto gap-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-1 mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 flex-shrink-0',
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab description ── */}
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-4 ml-0.5">{active.description}</p>

      {/* ── Tab content ── */}
      <div className={clsx('space-y-6', activeTab !== 'usuarios' && activeTab !== 'empresas' && 'max-w-3xl')}>
        {activeTab === 'general'     && <MenuTypeCard />}
        {activeTab === 'general'     && <NavColorCard />}
        {activeTab === 'general'     && <DarkModeCard />}
        {activeTab === 'empresa'     && <AfipSettingsCard />}
        {activeTab === 'correo'      && <SmtpSettingsCard />}
        {activeTab === 'operaciones' && <BudgetSettingsCard />}
        {activeTab === 'operaciones' && <PriceSettingsCard />}
        {activeTab === 'operaciones' && <PrintSettingsCard />}
        {activeTab === 'stock'       && <StockSettingsCard />}
        {activeTab === 'usuarios'    && <UsersSettingsCard />}
        {activeTab === 'empresas'   && <CompanySettingsCard />}
      </div>
    </div>
  );
}
