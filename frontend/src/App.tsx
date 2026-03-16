import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppRoutes from './routes/AppRoutes';
import { useUIStore } from './stores';

function App() {
  const { isDarkMode } = useUIStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  return (
    <BrowserRouter>
      <AppRoutes />
      <Toaster
        position="top-right"
        gutter={8}
        toastOptions={{
          duration: 4000,
          style: {
            background: isDarkMode ? '#1e293b' : '#ffffff',
            color: isDarkMode ? '#f1f5f9' : '#111827',
            borderRadius: '10px',
            border: `1px solid ${isDarkMode ? '#334155' : '#e5e7eb'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            fontSize: '14px',
            padding: '10px 14px',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: isDarkMode ? '#1e293b' : '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: isDarkMode ? '#1e293b' : '#fff',
            },
          },
        }}
      />
    </BrowserRouter>
  );
}

export default App;
