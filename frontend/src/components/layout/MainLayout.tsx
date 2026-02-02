import { Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { useUIStore } from '../../stores';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function MainLayout() {
  const { menuType, sidebarOpen } = useUIStore();

  if (menuType === 'navbar') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="pt-16">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main
        className={clsx(
          'transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-20'
        )}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
