import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth.store";

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
        const mode = parsed?.state?.mode;
        if (mode === 'FORMAL' || mode === 'INFORMAL') {
          config.headers["X-Fiscal-Mode"] = mode;
        }
      }
    } catch {
      // ignore parse errors
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      // Token expired or invalid (not a login attempt)
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;
