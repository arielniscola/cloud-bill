import { create } from 'zustand';

// Pedido del motivo para una acción protegida. Lo abre el interceptor de axios
// cuando el backend responde 428 APPROVAL_REQUIRED; el modal resuelve la promesa.

interface ApprovalPrompt {
  actionLabel: string;
  entityLabel: string | null;
}

interface ApprovalState {
  prompt: ApprovalPrompt | null;
  resolver: ((reason: string | null) => void) | null;
  /** Bumpea al crear o resolver solicitudes: el badge y los avisos se recargan. */
  version: number;
  askReason: (prompt: ApprovalPrompt) => Promise<string | null>;
  answer: (reason: string | null) => void;
  bump: () => void;
}

export const useApprovalStore = create<ApprovalState>()((set, get) => ({
  prompt: null,
  resolver: null,
  version: 0,
  askReason: (prompt) =>
    new Promise<string | null>((resolve) => {
      get().resolver?.(null); // un pedido anterior que quedó abierto se da por cancelado
      set({ prompt, resolver: resolve });
    }),
  answer: (reason) => {
    get().resolver?.(reason);
    set({ prompt: null, resolver: null });
  },
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
