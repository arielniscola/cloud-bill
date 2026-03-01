import { useState } from 'react';
import { Monitor, Building2, Landmark, PackageSearch, LayoutDashboard, AlignJustify } from 'lucide-react';
import { clsx } from 'clsx';
import { PageHeader } from '../../components/shared';
import { Card } from '../../components/ui';
import { useUIStore } from '../../stores';
import AfipSettingsCard from './AfipSettingsCard';
import BudgetSettingsCard from './BudgetSettingsCard';
import StockSettingsCard from './StockSettingsCard';

// ── Types ──────────────────────────────────────────────────────────
type Tab = 'general' | 'empresa' | 'operaciones' | 'stock';

const TABS: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'general',     label: 'General',     icon: Monitor,       description: 'Apariencia y preferencias' },
  { id: 'empresa',     label: 'Empresa',     icon: Building2,     description: 'Datos fiscales y ARCA/AFIP' },
  { id: 'operaciones', label: 'Operaciones', icon: Landmark,      description: 'Cajas predeterminadas' },
  { id: 'stock',       label: 'Stock',       icon: PackageSearch, description: 'Análisis inteligente' },
];

// ── Sub-components ─────────────────────────────────────────────────
function MenuTypeCard() {
  const { menuType, setMenuType } = useUIStore();

  return (
    <Card>
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-900">Tipo de menú</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Elegí cómo querés ver la navegación principal.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => setMenuType('sidebar')}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
            menuType === 'sidebar'
              ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300'
              : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
          )}
        >
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            menuType === 'sidebar' ? 'bg-indigo-100' : 'bg-gray-100'
          )}>
            <LayoutDashboard className={clsx('w-5 h-5', menuType === 'sidebar' ? 'text-indigo-600' : 'text-gray-400')} />
          </div>
          <div>
            <p className={clsx('text-sm font-medium', menuType === 'sidebar' ? 'text-indigo-800' : 'text-gray-700')}>
              Sidebar lateral
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Panel fijo o contraíble a la izquierda</p>
          </div>
        </button>

        <button
          onClick={() => setMenuType('navbar')}
          className={clsx(
            'flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150',
            menuType === 'navbar'
              ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300'
              : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
          )}
        >
          <div className={clsx(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            menuType === 'navbar' ? 'bg-indigo-100' : 'bg-gray-100'
          )}>
            <AlignJustify className={clsx('w-5 h-5', menuType === 'navbar' ? 'text-indigo-600' : 'text-gray-400')} />
          </div>
          <div>
            <p className={clsx('text-sm font-medium', menuType === 'navbar' ? 'text-indigo-800' : 'text-gray-700')}>
              Navbar superior
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Barra horizontal fija en la parte de arriba</p>
          </div>
        </button>
      </div>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const active = TABS.find(t => t.id === activeTab)!;

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Ajustá las preferencias de tu cuenta y empresa"
      />

      {/* ── Tab navigation ── */}
      <div className="flex overflow-x-auto gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab description ── */}
      <p className="text-xs text-gray-400 mb-4 ml-0.5">{active.description}</p>

      {/* ── Tab content ── */}
      <div className="max-w-3xl space-y-6">
        {activeTab === 'general'     && <MenuTypeCard />}
        {activeTab === 'empresa'     && <AfipSettingsCard />}
        {activeTab === 'operaciones' && <BudgetSettingsCard />}
        {activeTab === 'stock'       && <StockSettingsCard />}
      </div>
    </div>
  );
}
