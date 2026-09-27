"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev.slice(-4), { id, type, message, duration }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const success = React.useCallback((msg: string) => toast(msg, "success"), [toast]);
  const error = React.useCallback((msg: string) => toast(msg, "error", 6000), [toast]);
  const info = React.useCallback((msg: string) => toast(msg, "info"), [toast]);
  const warning = React.useCallback((msg: string) => toast(msg, "warning", 5000), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2.5 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: React.ReactNode; text: string }> = {
  success: {
    bg: "bg-emerald-50 dark:bg-emerald-950/80",
    border: "border-emerald-200 dark:border-emerald-800",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    text: "text-emerald-900 dark:text-emerald-100",
  },
  error: {
    bg: "bg-rose-50 dark:bg-rose-950/80",
    border: "border-rose-200 dark:border-rose-800",
    icon: <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />,
    text: "text-rose-900 dark:text-rose-100",
  },
  info: {
    bg: "bg-blue-50 dark:bg-blue-950/80",
    border: "border-blue-200 dark:border-blue-800",
    icon: <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />,
    text: "text-blue-900 dark:text-blue-100",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/80",
    border: "border-amber-200 dark:border-amber-800",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />,
    text: "text-amber-900 dark:text-amber-100",
  },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const s = TOAST_STYLES[toast.type];
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-2xl border shadow-xl px-4 py-3 backdrop-blur-sm ${s.bg} ${s.border} animate-in slide-in-from-right-5 fade-in duration-300`}
    >
      {s.icon}
      <p className={`flex-1 text-sm font-medium leading-snug ${s.text}`}>{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
