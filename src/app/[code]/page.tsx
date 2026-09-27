"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Copy, Check, Clock, Lock, Unlock, AlertCircle, Loader2, Trash2,
  Edit3, KeyRound, ArrowLeft, Calendar, Share2, QrCode, FolderX,
  ShieldCheck, Files, HardDrive, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { FolderQrCard } from "@/components/folder/qr-card";
import { FileManager } from "@/components/folder/file-manager";
import { QrModal } from "@/components/folder/qr-modal";
import { ShareModal } from "@/components/folder/share-modal";
import { PrivacyModal } from "@/components/folder/privacy-modal";
import { useToast } from "@/components/ui/toast";
import { ExpirationState, formatRemaining } from "@/lib/expiration-state";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolderDetails {
  id: string;
  folderCode: string;
  folderName: string;
  description: string | null;
  visibility: "PUBLIC" | "PASSWORD_PROTECTED" | "PRIVATE";
  allowDownload: boolean;
  hasPassword: boolean;
  fileCount: number;
  totalSizeBytes: string;
  createdAt: string;
  expiresAt: string;
  remainingTime: string;
  // Server-authoritative expiration data (Part 7); the client only renders it
  serverTime: string;
  remainingMs: number;
  expirationState: ExpirationState;
  shareUrl: string;
  isGuest: boolean;
  isRegistered: boolean;
  creatorName?: string;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function FolderHeaderSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-4">
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="h-8 w-2/3 rounded-lg bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
      <div className="flex gap-4 pt-2">
        <div className="h-4 w-28 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatBytes(bytes: number | string | bigint): string {
  const b = Number(bytes);
  if (isNaN(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FolderViewPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const codeParam = typeof params?.code === "string" ? params.code.toUpperCase() : "";

  // Core state
  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<{ code: string; message: string } | null>(null);
  const [folderData, setFolderData] = React.useState<FolderDetails | null>(null);
  const [isOwner, setIsOwner] = React.useState(false);
  const [requiresPassword, setRequiresPassword] = React.useState(false);

  // Password unlock
  const [passwordInput, setPasswordInput] = React.useState("");
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [unlocking, setUnlocking] = React.useState(false);
  // Store unlocked password so FileManager can pass it to signed URLs
  const [unlockedPassword, setUnlockedPassword] = React.useState<string>("");

  // Copy feedback
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState(false);

  // Live countdown (display only — the server decides expiry)
  const [countdownString, setCountdownString] = React.useState("");
  const [liveRemainingMs, setLiveRemainingMs] = React.useState<number | null>(null);
  const clockSkewMsRef = React.useRef(0);

  // Claim folder
  const [claiming, setClaiming] = React.useState(false);

  // Folder actions
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editAllowDownload, setEditAllowDownload] = React.useState(true);
  const [isSavingEdit, setIsSavingEdit] = React.useState(false);

  // Modals
  const [showShareModal, setShowShareModal] = React.useState(false);
  const [showQrModal, setShowQrModal] = React.useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = React.useState(false);

  // ── Fetch folder ──
  // `silent` re-checks with the server without swapping the page for the loading skeleton
  const fetchFolder = React.useCallback(async (suppliedPassword?: string, silent = false) => {
    if (!codeParam) return;
    if (!silent) {
      setLoading(true);
      setErrorStatus(null);
    }

    try {
      const guestToken =
        typeof window !== "undefined"
          ? localStorage.getItem(`sharebox_ownership_${codeParam}`)
          : null;

      const headers: Record<string, string> = {};
      if (guestToken) headers["x-ownership-token"] = guestToken;
      if (suppliedPassword) headers["x-folder-password"] = suppliedPassword;

      const res = await fetch(`/api/folders/${codeParam}`, { headers });
      const data = await res.json();
      // Correct for a wrong device clock: count down against server time, not Date.now()
      const serverTime = data.folder?.serverTime || data.serverTime;
      if (serverTime) clockSkewMsRef.current = new Date(serverTime).getTime() - Date.now();

      if (!res.ok) {
        setErrorStatus({ code: data.code || "ERROR", message: data.error || "Failed to load folder" });
        return;
      }

      if (data.requiresPassword && !data.isUnlocked) {
        setRequiresPassword(true);
        setFolderData(data.folder);
        return;
      }

      setRequiresPassword(false);
      setFolderData(data.folder);
      setIsOwner(Boolean(data.isOwner));
      setEditName(data.folder.folderName);
      setEditDescription(data.folder.description || "");
      setEditAllowDownload(data.folder.allowDownload);
    } catch {
      if (!silent) {
        setErrorStatus({
          code: "NETWORK_ERROR",
          message: "Could not connect to the server. Please check your internet connection.",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [codeParam]);

  React.useEffect(() => { fetchFolder(); }, [fetchFolder]);

  // ── Live countdown ──
  // Display only. When it reaches zero we ask the server, which returns 410 once the
  // folder is really expired; the client never hides or blocks content by itself.
  React.useEffect(() => {
    if (!folderData?.expiresAt) return;
    let lastCheck = 0;
    const update = () => {
      const diff = new Date(folderData.expiresAt).getTime() - (Date.now() + clockSkewMsRef.current);
      setLiveRemainingMs(Math.max(0, diff));
      setCountdownString(formatRemaining(diff, true));
      // Re-ask the server (at most every 5s) until it confirms expiry with a 410
      if (diff <= 0 && Date.now() - lastCheck > 5000) {
        lastCheck = Date.now();
        fetchFolder(unlockedPassword || undefined, true);
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [folderData?.expiresAt, fetchFolder, unlockedPassword]);

  // Server-provided state; only the countdown hitting zero overrides it locally (pending server confirmation)
  const expirationState: ExpirationState | undefined =
    liveRemainingMs === 0 ? "EXPIRED" : folderData?.expirationState;

  // ── Password unlock ──
  const handleUnlockPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setUnlocking(true);
    try {
      const res = await fetch(`/api/folders/${codeParam}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Incorrect password");
      setUnlockedPassword(passwordInput);
      setRequiresPassword(false);
      setFolderData(data.folder);
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Password verification failed");
    } finally {
      setUnlocking(false);
    }
  };

  // ── Claim folder ──
  const handleClaimFolder = async () => {
    if (!isAuthenticated) { router.push(`/login?callbackUrl=/${codeParam}`); return; }
    const guestToken = localStorage.getItem(`sharebox_ownership_${codeParam}`);
    if (!guestToken) { toast.error("No ownership token found on this device."); return; }
    setClaiming(true);
    try {
      const res = await fetch(`/api/folders/${codeParam}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownershipToken: guestToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to claim");
      toast.success("Folder claimed! Expiration extended to 15 days.");
      fetchFolder();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not claim folder");
    } finally {
      setClaiming(false);
    }
  };

  // ── Delete folder ──
  const handleDeleteFolder = async () => {
    setIsDeleting(true);
    try {
      const guestToken = localStorage.getItem(`sharebox_ownership_${codeParam}`);
      const headers: Record<string, string> = {};
      if (guestToken) headers["x-ownership-token"] = guestToken;
      const res = await fetch(`/api/folders/${codeParam}`, { method: "DELETE", headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
      localStorage.removeItem(`sharebox_ownership_${codeParam}`);
      toast.success("Folder deleted");
      router.push("/");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
      setIsDeleting(false);
    }
  };

  // ── Edit folder ──
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingEdit(true);
    try {
      const guestToken = localStorage.getItem(`sharebox_ownership_${codeParam}`);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (guestToken) headers["x-ownership-token"] = guestToken;
      const res = await fetch(`/api/folders/${codeParam}`, {
        method: "PATCH", headers,
        body: JSON.stringify({
          folderName: editName.trim(),
          description: editDescription.trim() || null,
          allowDownload: editAllowDownload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setShowEditModal(false);
      toast.success("Folder settings saved");
      fetchFolder();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── Copy helpers ──
  const copyCode = () => {
    if (!folderData) return;
    navigator.clipboard.writeText(folderData.folderCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.success("Folder code copied!");
  };
  const copyUrl = () => {
    if (!folderData) return;
    navigator.clipboard.writeText(folderData.shareUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
    toast.success("Share link copied!");
  };

  // ─── RENDER STATES ────────────────────────────────────────────────────────

  // 1. Loading
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
        <FolderHeaderSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 animate-pulse space-y-4">
            <div className="h-32 rounded-3xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-64 rounded-3xl bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="animate-pulse space-y-4">
            <div className="h-64 rounded-3xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-32 rounded-3xl bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      </div>
    );
  }

  // 2. Error states
  if (errorStatus) {
    const icons: Record<string, React.ReactNode> = {
      DELETED: <Trash2 className="h-8 w-8" />,
      EXPIRED: <Clock className="h-8 w-8" />,
      PRIVATE_FOLDER: <Lock className="h-8 w-8" />,
      NOT_FOUND: <FolderX className="h-8 w-8" />,
    };
    const labels: Record<string, string> = {
      DELETED: "Folder Deleted",
      EXPIRED: "Folder Expired",
      PRIVATE_FOLDER: "Access Restricted",
      NOT_FOUND: "Not Found",
    };
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
            {icons[errorStatus.code] || <FolderX className="h-8 w-8" />}
          </div>
          <Badge variant="outline" className="text-xs">{labels[errorStatus.code] || "Error"}</Badge>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">
            {errorStatus.code === "NOT_FOUND" ? `"${codeParam}" Not Found` :
             errorStatus.code === "DELETED" ? "This Folder Was Deleted" :
             errorStatus.code === "EXPIRED" ? "This Folder Has Expired" : "Access Denied"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{errorStatus.message}</p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to Home
              </Button>
            </Link>
            <Link href="/create" className="flex-1">
              <Button className="w-full">Create New Folder</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Password gate
  if (requiresPassword && folderData) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Card className="shadow-lg border-blue-100 dark:border-slate-800">
          <form onSubmit={handleUnlockPassword}>
            <CardHeader className="text-center pb-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mb-3">
                <Lock className="h-7 w-7" />
              </div>
              <CardTitle className="text-xl">Password Protected</CardTitle>
              <CardDescription>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{folderData.folderName}</span> requires a password to view files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {passwordError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/50 p-3 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{passwordError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Folder Password</label>
                <Input type="password" placeholder="Enter folder password" value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)} required disabled={unlocking} autoFocus className="h-11" />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span>Code: <span className="font-mono font-semibold">{folderData.folderCode}</span></span>
                <span>{folderData.remainingTime || "Active"}</span>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2 pt-2">
              <Button type="submit" disabled={unlocking} className="w-full gap-2">
                {unlocking ? <><Loader2 className="h-4 w-4 animate-spin" />Unlocking...</> : <><Unlock className="h-4 w-4" />Unlock Folder</>}
              </Button>
              <Link href="/" className="w-full text-center text-xs text-slate-500 hover:text-slate-800 pt-2">Cancel and return home</Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  // 4. Main view
  if (!folderData) return null;

  const expiresDateFormatted = new Date(folderData.expiresAt).toLocaleString("en-US", {
    dateStyle: "medium", timeStyle: "short",
  });
  const createdDateFormatted = new Date(folderData.createdAt).toLocaleDateString("en-US", {
    dateStyle: "medium",
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">

      {/* ── Modals ── */}
      <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)}
        folderCode={folderData.folderCode} shareUrl={folderData.shareUrl}
        folderName={folderData.folderName} onOpenQr={() => { setShowShareModal(false); setShowQrModal(true); }} />

      <QrModal isOpen={showQrModal} onClose={() => setShowQrModal(false)}
        folderCode={folderData.folderCode} shareUrl={folderData.shareUrl} folderName={folderData.folderName} />

      {isOwner && (
        <PrivacyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)}
          folderCode={folderData.folderCode} initialVisibility={folderData.visibility}
          initialAllowDownload={folderData.allowDownload} hasPassword={folderData.hasPassword}
          onUpdated={() => { fetchFolder(); toast.success("Privacy settings updated"); }} />
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg shadow-2xl">
            <form onSubmit={handleSaveEdit}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Edit3 className="h-5 w-5 text-blue-600" /> Edit Folder
                </CardTitle>
                <CardDescription>Update folder name, description, and permissions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Folder Name</label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} required disabled={isSavingEdit} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">Description</label>
                  <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                    disabled={isSavingEdit}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-white resize-none" />
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-xs">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Allow File Downloads</p>
                    <p className="text-slate-500">Recipients can download individual files</p>
                  </div>
                  <input type="checkbox" checked={editAllowDownload} onChange={(e) => setEditAllowDownload(e.target.checked)}
                    disabled={isSavingEdit} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)} disabled={isSavingEdit}>Cancel</Button>
                <Button type="submit" disabled={isSavingEdit}>{isSavingEdit ? "Saving..." : "Save Changes"}</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {isDeleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 px-6 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-rose-600" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Deleting folder...</span>
          </div>
        </div>
      )}

      {/* ── Top Nav ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowShareModal(true)} className="gap-1.5 text-xs h-8">
            <Share2 className="h-3.5 w-3.5" /> Share
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowQrModal(true)} className="gap-1.5 text-xs h-8">
            <QrCode className="h-3.5 w-3.5" /> QR Code
          </Button>

          {isOwner && (
            <>
              <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-xs">Owner</Badge>
              <Button variant="outline" size="sm" onClick={() => setShowEditModal(true)} className="gap-1.5 text-xs h-8">
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPrivacyModal(true)} className="gap-1.5 text-xs h-8">
                <ShieldCheck className="h-3.5 w-3.5" /> Privacy
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeleteFolder} disabled={isDeleting}
                className="gap-1.5 text-xs h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </>
          )}

          {folderData.isGuest && isOwner && isAuthenticated && (
            <Button size="sm" onClick={handleClaimFolder} disabled={claiming}
              className="gap-1.5 text-xs h-8 bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-sm">
              <KeyRound className="h-3.5 w-3.5" />
              {claiming ? "Claiming..." : "Claim (15 Days)"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Expiration Alert Banner (Requirement 10, 11, 12) ── */}
      {/* Guests always see exactly when the folder disappears */}
      {folderData.isGuest && expirationState === "ACTIVE" && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 dark:border-blue-900/60 dark:bg-blue-950/30 p-4 flex items-center gap-2.5 text-xs text-blue-900 dark:text-blue-200">
          <Clock className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>
            <span className="font-bold uppercase tracking-wider mr-1.5">Guest folder:</span>
            This folder and all its files will be permanently deleted on{" "}
            <strong>{expiresDateFormatted}</strong>{" "}
            <span className="font-mono text-[10px] opacity-75">({new Date(folderData.expiresAt).toUTCString()})</span>
            {" "}&mdash; <strong className="font-mono">{countdownString}</strong> left.
            {isOwner && (isAuthenticated ? " Claim it to keep it for 15 days." : " Sign in and claim it to keep it for 15 days.")}
          </span>
        </div>
      )}

      {(() => {
        if (expirationState !== "EXPIRING_SOON") return null;

        return (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/40 p-4 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
              <div>
                <span className="font-bold uppercase tracking-wider mr-1.5">Expiring Soon:</span>
                {folderData.isGuest ? (
                  <span>
                    This guest folder will permanently expire in <strong className="font-mono">{countdownString}</strong>
                    {" "}({new Date(folderData.expiresAt).toUTCString()}).
                    {isOwner && " Claim this folder to your account to retain it for 15 days."}
                  </span>
                ) : (
                  <span>
                    This folder will reach its 15-day lifecycle limit in <strong className="font-mono">{countdownString}</strong>.
                    Files will be permanently purged from object storage upon expiration.
                  </span>
                )}
              </div>
            </div>

            {folderData.isGuest && isOwner && isAuthenticated && (
              <Button
                size="sm"
                onClick={handleClaimFolder}
                disabled={claiming}
                className="shrink-0 text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <KeyRound className="h-3.5 w-3.5 mr-1" />
                {claiming ? "Claiming..." : "Claim Folder"}
              </Button>
            )}
          </div>
        );
      })()}

      {/* ── Hero Header ── */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-blue-50/20 to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          {/* Left: Info */}
          <div className="space-y-3 max-w-2xl">
            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                if (expirationState === "EXPIRED") {
                  return (
                    <Badge variant="outline" className="border-rose-200 text-rose-700 dark:border-rose-900/60 dark:text-rose-400 bg-rose-50/50">
                      Expired
                    </Badge>
                  );
                }
                if (expirationState === "EXPIRING_SOON") {
                  return (
                    <Badge variant="outline" className="border-amber-200 text-amber-700 dark:border-amber-900/60 dark:text-amber-400 bg-amber-50/50 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expiring Soon
                    </Badge>
                  );
                }
                return (
                  <Badge variant="outline" className="border-emerald-200 text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-400 bg-emerald-50/50 flex items-center gap-1.5">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </Badge>
                );
              })()}

              <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider">
                {folderData.visibility.replace("_", " ")}
              </Badge>
              {folderData.hasPassword && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Lock className="h-3 w-3" /> Protected
                </Badge>
              )}
              {folderData.allowDownload ? (
                <Badge variant="outline" className="border-emerald-200 text-emerald-700 dark:text-emerald-300 text-xs">Downloads On</Badge>
              ) : (
                <Badge variant="outline" className="border-slate-300 text-slate-500 text-xs">View Only</Badge>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {folderData.folderName}
            </h1>

            {folderData.description ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {folderData.description}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">No description.</p>
            )}

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Files className="h-3.5 w-3.5 text-slate-400" />
                <span>{folderData.fileCount} file{folderData.fileCount !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                <span>{formatBytes(folderData.totalSizeBytes)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Created {createdDateFormatted}</span>
              </div>
              {folderData.creatorName && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span>{folderData.creatorName}</span>
                </div>
              )}
            </div>

            {/* Expiry + countdown + UTC timestamp */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Expires {expiresDateFormatted}</span>
                <span className="font-mono text-[10px] text-slate-400">
                  ({new Date(folderData.expiresAt).toUTCString()})
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
                <Clock className="h-3.5 w-3.5" />
                <span>{countdownString || folderData.remainingTime}</span>
              </div>
            </div>
          </div>

          {/* Right: Folder Code Card */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-blue-200/80 dark:border-blue-900/60 bg-white dark:bg-slate-950 p-5 shadow-sm shrink-0 min-w-[190px]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Folder Code</span>
            <div className="font-mono text-3xl font-black tracking-widest text-blue-600 dark:text-blue-400 my-1">
              {folderData.folderCode}
            </div>
            <button onClick={copyCode}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mt-1">
              {copiedCode ? <><Check className="h-3 w-3 text-emerald-600" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy Code</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: File Manager */}
        <div className="lg:col-span-2">
          <FileManager
            folderCode={folderData.folderCode}
            isOwner={isOwner}
            allowDownload={folderData.allowDownload}
            folderPassword={unlockedPassword || undefined}
            onStatsUpdated={fetchFolder}
          />
        </div>

        {/* Right: Share Panel */}
        <div className="space-y-4">
          {/* QR Card */}
          <FolderQrCard
            folderCode={folderData.folderCode}
            shareUrl={folderData.shareUrl}
            folderName={folderData.folderName}
          />

          {/* Share URL Box */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Share2 className="h-4 w-4 text-blue-600" /> Share Link
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 font-mono text-xs text-slate-700 dark:text-slate-300 break-all">
                {folderData.shareUrl}
              </div>
              <Button onClick={copyUrl} variant="outline" size="sm" className="w-full gap-2">
                {copiedUrl ? <><Check className="h-3.5 w-3.5 text-emerald-600" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy Link</>}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowShareModal(true)} className="gap-1.5 text-xs h-8">
                  <Share2 className="h-3.5 w-3.5" /> Share
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowQrModal(true)} className="gap-1.5 text-xs h-8">
                  <QrCode className="h-3.5 w-3.5" /> QR
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Owner quick actions */}
          {isOwner && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-purple-600" /> Owner Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" size="sm" onClick={() => setShowEditModal(true)} className="w-full justify-start gap-2 text-xs">
                  <Edit3 className="h-3.5 w-3.5" /> Edit Folder Info
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowPrivacyModal(true)} className="w-full justify-start gap-2 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" /> Privacy & Access
                </Button>
                {folderData.isGuest && isAuthenticated && (
                  <Button size="sm" onClick={handleClaimFolder} disabled={claiming}
                    className="w-full justify-start gap-2 text-xs bg-gradient-to-r from-amber-500 to-indigo-600 text-white">
                    <KeyRound className="h-3.5 w-3.5" /> Claim to Account
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleDeleteFolder} disabled={isDeleting}
                  className="w-full justify-start gap-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                  <Trash2 className="h-3.5 w-3.5" /> Delete Folder
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Folder meta card */}
          <Card className="shadow-sm">
            <CardContent className="pt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Type</span>
                <span className="font-semibold">{folderData.isGuest ? "Guest Folder" : "Account Folder"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Files</span>
                <span className="font-semibold">{folderData.fileCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Size</span>
                <span className="font-semibold">{formatBytes(folderData.totalSizeBytes)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Expires</span>
                <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 text-[10px]">{countdownString || folderData.remainingTime}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
