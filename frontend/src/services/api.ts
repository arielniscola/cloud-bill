import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth.store";
import { useOfflineStore } from "../stores/offline.store";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "/api";

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Request interceptor - add active company header (for super-admins)
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    try {
      const companyData = localStorage.getItem("cloud-bill-company");
      if (companyData) {
        const parsed = JSON.parse(companyData);
        const companyId = parsed?.state?.activeCompanyId;
        if (companyId) {
          config.headers["X-Company-Id"] = companyId;
        }
      }
    } catch {
      // ignore parse errors
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Request interceptor - add fiscal mode header
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    try {
      const fiscalData = localStorage.getItem("cloud-bill-fiscal-mode");
      if (fiscalData) {
        const parsed = JSON.parse(fiscalData);
        const viewMode = parsed?.state?.viewMode ?? parsed?.state?.mode;
        if (viewMode === 'FORMAL' || viewMode === 'INFORMAL' || viewMode === 'ALL') {
          config.headers["X-Fiscal-Mode"] = viewMode;
        }
      }
    } catch {
      // ignore parse errors
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/** true cuando axios fallo sin llegar al servidor (red caida, DNS, timeout). */
export function isNetworkError(error: unknown): boolean {
  const e = error as AxiosError | undefined;
  if (!e || !e.isAxiosError) return false;
  return !e.response;
}

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => {
    // Toda respuesta del servidor confirma que hay conexion, sin pingear.
    if (useOfflineStore.getState().connection !== 'online') {
      useOfflineStore.getState().setConnection('online');
    }
    return response;
  },
  (error: AxiosError) => {
    // Sin respuesta = no llegamos al servidor. NO es un problema de sesion:
    // desloguear acá echaria al usuario justo cuando se corta internet, que es
    // cuando mas necesita seguir trabajando (y con ventas pendientes de subir).
    if (isNetworkError(error)) {
      useOfflineStore.getState().setConnection('offline');
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      // Token expired or invalid (not a login attempt)
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
