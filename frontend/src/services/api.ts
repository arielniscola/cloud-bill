import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth.store";
import { useOfflineStore } from "../stores/offline.store";
import { useApprovalStore } from "../stores/approval.store";
import toast from "react-hot-toast";
import { ApprovalFlowError, APPROVAL_ACTION_LABELS } from "../utils/approvalActions";

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

type ApprovalRetryConfig = InternalAxiosRequestConfig & { _approvalRetry?: boolean };

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => {
    // Toda respuesta del servidor confirma que hay conexion, sin pingear.
    if (useOfflineStore.getState().connection !== 'online') {
      useOfflineStore.getState().setConnection('online');
    }
    // Acción protegida: el backend no la ejecutó, dejó una solicitud para el
    // Dueño. Se rechaza para que quien llamó no la tome como hecha.
    const body = response.data as { pendingApproval?: boolean; message?: string } | undefined;
    if (response.status === 202 && body?.pendingApproval) {
      toast.success(body.message || 'Solicitud enviada al Dueño para su aprobación', { duration: 5000 });
      useApprovalStore.getState().bump();
      return Promise.reject(new ApprovalFlowError('pending'));
    }
    return response;
  },
  async (error: AxiosError) => {
    // Sin respuesta = no llegamos al servidor. NO es un problema de sesion:
    // desloguear acá echaria al usuario justo cuando se corta internet, que es
    // cuando mas necesita seguir trabajando (y con ventas pendientes de subir).
    if (isNetworkError(error)) {
      useOfflineStore.getState().setConnection('offline');
      return Promise.reject(error);
    }

    // Acción protegida: se pide el motivo y se reintenta. El backend crea la
    // solicitud de aprobación y responde 202 (ver arriba).
    const data = error.response?.data as
      | { code?: string; data?: { action?: string; entityLabel?: string | null } }
      | undefined;
    const config = error.config as ApprovalRetryConfig | undefined;
    if (error.response?.status === 428 && data?.code === 'APPROVAL_REQUIRED' && config && !config._approvalRetry) {
      const action = data.data?.action as keyof typeof APPROVAL_ACTION_LABELS | undefined;
      const reason = await useApprovalStore.getState().askReason({
        actionLabel: (action && APPROVAL_ACTION_LABELS[action]) || 'Acción protegida',
        entityLabel: data.data?.entityLabel ?? null,
      });
      if (!reason) return Promise.reject(new ApprovalFlowError('cancelled'));
      config._approvalRetry = true;
      config.headers["X-Approval-Reason"] = encodeURIComponent(reason);
      return api.request(config);
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
