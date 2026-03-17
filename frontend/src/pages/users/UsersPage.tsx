import UsersSettingsCard from '../settings/UsersSettingsCard';

export default function UsersPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Usuarios</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
          Gestión de usuarios de todas las empresas
        </p>
      </div>
      <UsersSettingsCard />
    </div>
  );
}
