"use client";

import * as React from "react";
import {
  ShieldCheck,
  Lock,
  Globe,
  Shield,
  Download,
  Eye,
  EyeOff,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderCode: string;
  initialVisibility: "PUBLIC" | "PASSWORD_PROTECTED" | "PRIVATE";
  initialAllowDownload: boolean;
  hasPassword?: boolean;
  onUpdated: () => void;
}

export function PrivacyModal({
  isOpen,
  onClose,
  folderCode,
  initialVisibility,
  initialAllowDownload,
  hasPassword,
  onUpdated,
}: PrivacyModalProps) {
  const [visibility, setVisibility] = React.useState(initialVisibility);
  const [allowDownload, setAllowDownload] = React.useState(initialAllowDownload);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [removePassword, setRemovePassword] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    setVisibility(initialVisibility);
    setAllowDownload(initialAllowDownload);
    setPassword("");
    setRemovePassword(false);
    setErrorMsg(null);
  }, [initialVisibility, initialAllowDownload, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (visibility === "PASSWORD_PROTECTED" && !hasPassword && (!password || password.length < 4)) {
      setErrorMsg("Password-protected folders require a password of at least 4 characters.");
      return;
    }

    setSaving(true);
    try {
      const guestToken = localStorage.getItem(`sharebox_ownership_${folderCode}`);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (guestToken) headers["x-ownership-token"] = guestToken;

      const body: Record<string, unknown> = {
        visibility,
        allowDownload,
      };

      if (removePassword) {
        body.removePassword = true;
      } else if (password && password.trim().length > 0) {
        body.password = password.trim();
      }

      const res = await fetch(`/api/folders/${folderCode}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update privacy settings");
      }

      onUpdated();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error updating settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400 shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Folder Privacy & Access
            </h3>
            <p className="text-xs text-slate-500">Configure recipient permissions</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Visibility Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Access Visibility
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* Public */}
              <div
                onClick={() => setVisibility("PUBLIC")}
                className={`cursor-pointer rounded-xl border p-2.5 text-center transition-all ${
                  visibility === "PUBLIC"
                    ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-600 font-bold"
                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <Globe className="h-4 w-4 mx-auto mb-1" />
                <span className="text-xs">Public</span>
              </div>

              {/* Password */}
              <div
                onClick={() => setVisibility("PASSWORD_PROTECTED")}
                className={`cursor-pointer rounded-xl border p-2.5 text-center transition-all ${
                  visibility === "PASSWORD_PROTECTED"
                    ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-600 font-bold"
                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <Lock className="h-4 w-4 mx-auto mb-1" />
                <span className="text-xs">Password</span>
              </div>

              {/* Private */}
              <div
                onClick={() => setVisibility("PRIVATE")}
                className={`cursor-pointer rounded-xl border p-2.5 text-center transition-all ${
                  visibility === "PRIVATE"
                    ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 text-blue-600 font-bold"
                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                <Shield className="h-4 w-4 mx-auto mb-1" />
                <span className="text-xs">Private</span>
              </div>
            </div>
          </div>

          {/* Password Input if Password Protected */}
          {visibility === "PASSWORD_PROTECTED" && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3.5 dark:border-blue-900/60 dark:bg-blue-950/30 space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>{hasPassword ? "Change Password" : "Set Password"}</span>
                {hasPassword && (
                  <button
                    type="button"
                    onClick={() => setRemovePassword(!removePassword)}
                    className="text-[11px] text-rose-600 hover:underline font-normal"
                  >
                    {removePassword ? "Keep Password" : "Remove Password"}
                  </button>
                )}
              </label>

              {!removePassword && (
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={hasPassword ? "Leave blank to keep existing password" : "Min 4 characters"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={saving}
                    className="pr-10 text-xs bg-white dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Download Controls Toggle (Requirement 9) */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Download className="h-4 w-4 text-blue-600" />
                Allow File Downloads
              </div>
              <p className="text-[11px] text-slate-500">
                When turned off, recipients can only preview files in view-only mode.
              </p>
            </div>
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(e) => setAllowDownload(e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Saving...
                </>
              ) : (
                "Apply Settings"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
