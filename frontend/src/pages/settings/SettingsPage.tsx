import { PageHeader } from '../../components/shared';
import { Card, Button } from '../../components/ui';
import { useUIStore } from '../../stores';

export default function SettingsPage() {
  const { menuType, setMenuType } = useUIStore();

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Personaliza tu experiencia" />

      <div className="max-w-2xl">
        <Card>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Tipo de Menú
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Elige cómo quieres ver el menú de navegación
          </p>
          <div className="flex gap-4">
            <Button
              variant={menuType === 'sidebar' ? 'primary' : 'outline'}
              onClick={() => setMenuType('sidebar')}
            >
              Sidebar (lateral)
            </Button>
            <Button
              variant={menuType === 'navbar' ? 'primary' : 'outline'}
              onClick={() => setMenuType('navbar')}
            >
              Navbar (superior)
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
