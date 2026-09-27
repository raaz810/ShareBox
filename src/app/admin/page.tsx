"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Activity,
  Settings,
  HardDrive,
  FileSearch,
  Users,
  FolderSync,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  AlertTriangle,
  ShieldCheck,
  UserX,
  UserCheck,
  FileText,
  Clock,
  RotateCcw,
  Sliders,
  Folder,
  Eye,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number;
  totalFolders: number;
  activeFolders: number;
  expiredFolders: number;
  expiredFoldersAwaitingCleanup: number;
  failedCleanupJobs: number;
  uploadFailures: number;
  guestFolders: number;
  registeredFolders: number;
  totalFiles: number;
  totalStorageBytes: string;
  lastCleanup: {
    id: string;
    status: string;
    itemsProcessed: number;
    bytesReclaimed: string;
    completedAt: string | null;
  } | null;
}

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  folderCount: number;
  fileCount: number;
  storageBytes: string;
}

interface FolderItem {
  id: string;
  folderCode: string;
  folderName: string;
  description: string | null;
  visibility: string;
  status: "ACTIVE" | "EXPIRED" | "DELETED";
  rawStatus: string;
  owner: {
    id?: string;
    email?: string;
    name?: string | null;
    isGuest: boolean;
    label?: string;
  };
  totalSize: string;
  fileCount: number;
  expiresAt: string;
  expiredAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  purgeAttempts: number;
  lastPurgeError: string | null;
}

interface FileMetadataItem {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: string;
  uploadStatus: string;
  checksum: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FolderDetail {
  id: string;
  folderCode: string;
  folderName: string;
  description: string | null;
  visibility: string;
  allowDownload: boolean;
  status: string;
  totalSize: string;
  fileCount: number;
  createdAt: string;
  expiresAt: string;
  owner: {
    id?: string;
    email?: string;
    name?: string | null;
    isGuest: boolean;
    label?: string;
  };
  files: FileMetadataItem[];
}

interface CleanupJobItem {
  id: string;
  jobType: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
  attempts: number;
  triggeredBy: string | null;
  itemsProcessed: number;
  foldersExpired: number;
  foldersPurged: number;
  filesPurged: number;
  failedDeletions: number;
  bytesReclaimed: string;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface UploadErrorItem {
  id: string;
  type: string;
  title: string;
  mimeType: string | null;
  sizeBytes: string;
  folderCode: string | null;
  folderName: string | null;
  status: string;
  details: string;
  timestamp: string;
}

interface OperationalErrorItem {
  id: string;
  category: string;
  title: string;
  status: string;
  attempts: number;
  error: string;
  timestamp: string;
  details?: string;
}

interface AuditLogItem {
  id: string;
  action: string;
  userEmail: string | null;
  userName: string | null;
  folderCode: string | null;
  folderName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface SystemSettingItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
  isPublic: boolean;
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number | string | bigint): string {
  const b = Number(bytes);
  if (isNaN(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = React.useState<
    "overview" | "users" | "folders" | "settings" | "cleanup" | "errors" | "audit"
  >("overview");

  // ─── Stats & Telemetry state ───
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [loadingTelemetry, setLoadingTelemetry] = React.useState(true);

  // ─── Users state ───
  const [users, setUsers] = React.useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(false);
  const [userSearch, setUserSearch] = React.useState("");
  const [userStatusFilter, setUserStatusFilter] = React.useState<"all" | "active" | "suspended">("all");
  const [userPage, setUserPage] = React.useState(1);
  const [userTotalPages, setUserTotalPages] = React.useState(1);
  const [suspendingUserId, setSuspendingUserId] = React.useState<string | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = React.useState<UserItem | null>(null);

  // ─── Folders state ───
  const [folders, setFolders] = React.useState<FolderItem[]>([]);
  const [foldersLoading, setFoldersLoading] = React.useState(false);
  const [folderSearch, setFolderSearch] = React.useState("");
  const [folderStatusFilter, setFolderStatusFilter] = React.useState<"ALL" | "ACTIVE" | "EXPIRED" | "DELETED">("ALL");
  const [folderPage, setFolderPage] = React.useState(1);
  const [folderTotalPages, setFolderTotalPages] = React.useState(1);
  const [selectedFolderDetail, setSelectedFolderDetail] = React.useState<FolderDetail | null>(null);
  const [loadingFolderDetail, setLoadingFolderDetail] = React.useState(false);

  // ─── Cleanup state ───
  const [cleanupJobs, setCleanupJobs] = React.useState<CleanupJobItem[]>([]);
  const [cleanupLoading, setCleanupLoading] = React.useState(false);
  const [isTriggeringCleanup, setIsTriggeringCleanup] = React.useState(false);
  const [isRetryingCleanup, setIsRetryingCleanup] = React.useState(false);
  const [cleanupModalResult, setCleanupModalResult] = React.useState<Record<string, unknown> | null>(null);

  // ─── Errors state ───
  const [uploadErrors, setUploadErrors] = React.useState<UploadErrorItem[]>([]);
  const [operationalErrors, setOperationalErrors] = React.useState<OperationalErrorItem[]>([]);
  const [errorsLoading, setErrorsLoading] = React.useState(false);
  const [errorSubTab, setErrorSubTab] = React.useState<"upload" | "operational">("upload");

  // ─── Settings state ───
  const [settings, setSettings] = React.useState<SystemSettingItem[]>([]);
  const [settingsLoading, setSettingsLoading] = React.useState(false);
  const [settingsForm, setSettingsForm] = React.useState<Record<string, string>>({});
  const [isSavingSettings, setIsSavingSettings] = React.useState(false);

  // ─── Audit logs state ───
  const [auditLogs, setAuditLogs] = React.useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [auditSearch, setAuditSearch] = React.useState("");
  const [auditPage, setAuditPage] = React.useState(1);
  const [auditTotalPages, setAuditTotalPages] = React.useState(1);
  const [selectedAuditLog, setSelectedAuditLog] = React.useState<AuditLogItem | null>(null);

  // ─── Expiration test runner state ───
  const [isRunningTests, setIsRunningTests] = React.useState(false);

  // Authorization check: route is protected, accessible only to ADMIN role
  React.useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.push("/login?callbackUrl=/admin");
      } else if (user?.role !== "ADMIN") {
        router.push("/dashboard?error=unauthorized_admin");
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  // Load stats
  const loadStats = React.useCallback(async () => {
    setLoadingTelemetry(true);
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
      toast.error("Could not load dashboard statistics");
    } finally {
      setLoadingTelemetry(false);
    }
  }, [toast]);

  // Load Users
  const loadUsers = React.useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(userPage),
        limit: "12",
        status: userStatusFilter,
      });
      if (userSearch.trim()) params.set("search", userSearch.trim());

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        if (data.pagination) setUserTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
      toast.error("Could not load users list");
    } finally {
      setUsersLoading(false);
    }
  }, [userPage, userSearch, userStatusFilter, toast]);

  // Load Folders
  const loadFolders = React.useCallback(async () => {
    setFoldersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(folderPage),
        limit: "12",
        status: folderStatusFilter,
      });
      if (folderSearch.trim()) params.set("search", folderSearch.trim());

      const res = await fetch(`/api/admin/folders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
        if (data.pagination) setFolderTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error("Failed to load folders:", err);
      toast.error("Could not load folder list");
    } finally {
      setFoldersLoading(false);
    }
  }, [folderPage, folderSearch, folderStatusFilter, toast]);

  // Inspect folder metadata
  const handleInspectFolder = async (folderCode: string) => {
    setLoadingFolderDetail(true);
    try {
      const res = await fetch(`/api/admin/folders/${folderCode}`);
      if (!res.ok) throw new Error("Failed to load folder details");
      const data = await res.json();
      setSelectedFolderDetail(data.folder);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not inspect folder");
    } finally {
      setLoadingFolderDetail(false);
    }
  };

  // Load Cleanup History
  const loadCleanupJobs = React.useCallback(async () => {
    setCleanupLoading(true);
    try {
      const res = await fetch("/api/admin/cleanup");
      if (res.ok) {
        const data = await res.json();
        setCleanupJobs(data.jobs || []);
      }
    } catch (err) {
      console.error("Failed to load cleanup history:", err);
      toast.error("Could not load cleanup jobs");
    } finally {
      setCleanupLoading(false);
    }
  }, [toast]);

  // Load Errors
  const loadErrors = React.useCallback(async () => {
    setErrorsLoading(true);
    try {
      const res = await fetch("/api/admin/errors");
      if (res.ok) {
        const data = await res.json();
        setUploadErrors(data.uploadErrors || []);
        setOperationalErrors(data.operationalErrors || []);
      }
    } catch (err) {
      console.error("Failed to load error logs:", err);
      toast.error("Could not load error records");
    } finally {
      setErrorsLoading(false);
    }
  }, [toast]);

  // Load Settings
  const loadSettings = React.useCallback(async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || []);
        const map: Record<string, string> = {};
        for (const s of data.settings || []) {
          map[s.key] = s.value;
        }
        setSettingsForm(map);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      toast.error("Could not load system settings");
    } finally {
      setSettingsLoading(false);
    }
  }, [toast]);

  // Load Audit logs
  const loadAuditLogs = React.useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(auditPage),
        limit: "15",
      });
      if (auditSearch.trim()) params.set("search", auditSearch.trim());

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
        if (data.pagination) setAuditTotalPages(data.pagination.totalPages);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
      toast.error("Could not load audit trail");
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditSearch, toast]);

  // Trigger loads on tab changes
  React.useEffect(() => {
    if (user?.role === "ADMIN") {
      loadStats();
    }
  }, [user, loadStats]);

  React.useEffect(() => {
    if (user?.role === "ADMIN") {
      if (activeTab === "users") loadUsers();
      if (activeTab === "folders") loadFolders();
      if (activeTab === "settings") loadSettings();
      if (activeTab === "cleanup") loadCleanupJobs();
      if (activeTab === "errors") loadErrors();
      if (activeTab === "audit") loadAuditLogs();
    }
  }, [user, activeTab, loadUsers, loadFolders, loadSettings, loadCleanupJobs, loadErrors, loadAuditLogs]);

  // Suspend / Reactivate account
  const handleToggleSuspendUser = async (targetUser: UserItem) => {
    const nextStatus = !targetUser.isActive;
    const confirmMsg = nextStatus
      ? `Reactivate account for ${targetUser.email}?`
      : `Suspend account for ${targetUser.email}? They will no longer be able to log in or create folders.`;

    if (!window.confirm(confirmMsg)) return;

    setSuspendingUserId(targetUser.id);
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: nextStatus,
          reason: nextStatus ? "Reactivated by admin" : "Suspended by admin for policy violation",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user status");

      toast.success(data.message || "User status updated");
      loadUsers();
      loadStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error updating user status");
    } finally {
      setSuspendingUserId(null);
    }
  };

  // Trigger Cleanup
  const handleTriggerCleanup = async (retryFailed: boolean = false) => {
    if (retryFailed) {
      setIsRetryingCleanup(true);
    } else {
      setIsTriggeringCleanup(true);
    }

    try {
      const res = await fetch("/api/admin/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryFailed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cleanup failed");

      if (data.result?.skipped) {
        toast.warning("A cleanup run is already in progress. Try again shortly.");
        return;
      }
      setCleanupModalResult(data.result);
      if (data.result?.failedDeletions > 0) {
        toast.warning(`${data.result.failedDeletions} storage deletion(s) failed and are queued for retry.`);
      } else {
        toast.success(retryFailed ? "Failed cleanups retried successfully!" : "Cleanup completed successfully!");
      }
      loadStats();
      loadCleanupJobs();
      loadErrors();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Cleanup execution error");
    } finally {
      setIsTriggeringCleanup(false);
      setIsRetryingCleanup(false);
    }
  };

  // Run Expiration Tests
  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const res = await fetch("/api/dev/expiration-test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || "Test run failed");
      const failed = (data.checks as { name: string; pass: boolean }[]).filter((c) => !c.pass);
      if (failed.length === 0) {
        toast.success(`All ${data.checks.length} expiration pipeline checks passed`);
      } else {
        toast.error(`Failed checks: ${failed.map((c) => c.name).join(", ")}`);
      }
      loadStats();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Test run failed");
    } finally {
      setIsRunningTests(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const updates = Object.entries(settingsForm).map(([key, value]) => ({ key, value }));
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Settings update failed");

      toast.success("System policies and settings updated successfully!");
      loadSettings();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (authLoading || (!user && isAuthenticated)) {
    return (
      <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-9 w-9 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-slate-500">Verifying administrative access...</p>
        </div>
      </div>
    );
  }

  if (user?.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* ── Cleanup Result Modal ── */}
      {cleanupModalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md shadow-2xl border-emerald-200 dark:border-emerald-900/60">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 mb-2">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg font-bold">Cleanup Operation Finished</CardTitle>
              <CardDescription>
                Execution completed in {String(cleanupModalResult.durationMs)} ms.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900">
                <span className="text-slate-500">Folders Purged:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {String(cleanupModalResult.foldersProcessed ?? cleanupModalResult.foldersPurged ?? 0)}
                </span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900">
                <span className="text-slate-500">Storage Files Deleted:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {String(cleanupModalResult.filesProcessed ?? cleanupModalResult.filesPurged ?? 0)}
                </span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900">
                <span className="text-slate-500">Storage Capacity Reclaimed:</span>
                <span className="font-bold text-emerald-600">
                  {formatBytes(String(cleanupModalResult.bytesReclaimed || 0))}
                </span>
              </div>
              <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900">
                <span className="text-slate-500">Failed Deletions (Backoff Retried):</span>
                <span className={`font-bold ${Number(cleanupModalResult.failedDeletions || 0) > 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>
                  {String(cleanupModalResult.failedDeletions || 0)}
                </span>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setCleanupModalResult(null)}>
                Dismiss
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* ── Folder Metadata Inspection Modal (Restricted Content Access) ── */}
      {selectedFolderDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Folder className="h-4 w-4 text-blue-600" />
                      Folder Metadata: {selectedFolderDetail.folderCode}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        selectedFolderDetail.status === "ACTIVE"
                          ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
                          : selectedFolderDetail.status === "EXPIRED"
                          ? "border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-950/20"
                          : "border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-950/20"
                      }`}
                    >
                      {selectedFolderDetail.status}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs mt-0.5">
                    {selectedFolderDetail.folderName} · {selectedFolderDetail.fileCount} files · {formatBytes(selectedFolderDetail.totalSize)}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-xs overflow-y-auto py-4">
              {/* Folder Details Box */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900">
                <div>
                  <span className="text-slate-500 block text-[11px]">Owner</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                    {selectedFolderDetail.owner.email || "Guest (Ephemeral)"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Visibility</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 block">
                    {selectedFolderDetail.visibility}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Created At</span>
                  <span className="text-slate-700 dark:text-slate-300 block">
                    {new Date(selectedFolderDetail.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Expires At</span>
                  <span className="text-slate-700 dark:text-slate-300 block font-mono">
                    {new Date(selectedFolderDetail.expiresAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Allow Downloads</span>
                  <span className="text-slate-700 dark:text-slate-300 block">
                    {selectedFolderDetail.allowDownload ? "Yes" : "Restricted"}
                  </span>
                </div>
              </div>

              {/* Security Banner: Restrict File-Content Access */}
              <div className="p-3 rounded-xl border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-[11px] text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Security Policy: Restricted Content Access.</span> Raw object download URLs and storage secrets are withheld. Only technical file metadata is displayed for audit and compliance.
                </div>
              </div>

              {/* Files Metadata Table */}
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                  Files Metadata ({selectedFolderDetail.files.length})
                </h4>
                {selectedFolderDetail.files.length === 0 ? (
                  <p className="text-slate-500 italic text-center p-4">No active files in this folder.</p>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 text-[10px] uppercase font-semibold">
                        <tr>
                          <th className="py-2 px-3">Filename</th>
                          <th className="py-2 px-3">MIME Type</th>
                          <th className="py-2 px-3">Size</th>
                          <th className="py-2 px-3">Status</th>
                          <th className="py-2 px-3">Checksum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedFolderDetail.files.map((file) => (
                          <tr key={file.id}>
                            <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200 max-w-[150px] truncate" title={file.originalFileName}>
                              {file.originalFileName}
                            </td>
                            <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                              {file.mimeType}
                            </td>
                            <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                              {formatBytes(file.fileSize)}
                            </td>
                            <td className="py-2 px-3">
                              <Badge variant="outline" className="text-[10px]">
                                {file.uploadStatus}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-mono text-[10px] text-slate-400 max-w-[90px] truncate" title={file.checksum || ""}>
                              {file.checksum ? file.checksum.slice(0, 10) + "..." : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-3">
              <Button size="sm" variant="outline" onClick={() => setSelectedFolderDetail(null)}>
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* ── User Metadata Inspection Modal ── */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-lg shadow-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  User Profile Metadata
                </CardTitle>
                <Badge
                  variant="outline"
                  className={selectedUserDetail.isActive ? "text-emerald-600 border-emerald-200" : "text-rose-600 border-rose-200"}
                >
                  {selectedUserDetail.isActive ? "ACTIVE" : "SUSPENDED"}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Account ID: <span className="font-mono">{selectedUserDetail.id}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900">
                <div>
                  <span className="text-slate-500 block text-[11px]">Email Address</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedUserDetail.email}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Full Name</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{selectedUserDetail.name || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">System Role</span>
                  <span className="font-mono font-bold text-blue-600">{selectedUserDetail.role}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Account Created</span>
                  <span>{new Date(selectedUserDetail.createdAt).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Total Folders Owned</span>
                  <span className="font-bold">{selectedUserDetail.folderCount}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Total Storage Used</span>
                  <span className="font-bold text-indigo-600">{formatBytes(selectedUserDetail.storageBytes)}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Security Notice: </span>
                Password hashes, salt parameters, and authentication tokens are strictly protected by server encryption policies and never transmitted to client endpoints.
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
              {selectedUserDetail.id !== user?.id && (
                <Button
                  size="sm"
                  variant={selectedUserDetail.isActive ? "destructive" : "default"}
                  onClick={() => {
                    handleToggleSuspendUser(selectedUserDetail);
                    setSelectedUserDetail(null);
                  }}
                  className="gap-1.5 text-xs"
                >
                  {selectedUserDetail.isActive ? (
                    <>
                      <UserX className="h-3.5 w-3.5" /> Suspend Account
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" /> Reactivate Account
                    </>
                  )}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setSelectedUserDetail(null)} className="ml-auto">
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* ── Audit Detail Modal ── */}
      {selectedAuditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-lg shadow-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-blue-600" />
                  Audit Event Details
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  {selectedAuditLog.action}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Timestamp: {new Date(selectedAuditLog.createdAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 block">User Email</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedAuditLog.userEmail || "Anonymous / System"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">IP Address</span>
                  <span className="font-mono">{selectedAuditLog.ipAddress || "N/A"}</span>
                </div>
              </div>
              {selectedAuditLog.folderCode && (
                <div>
                  <span className="text-slate-500 block">Target Folder</span>
                  <span className="font-mono font-bold text-blue-600">
                    {selectedAuditLog.folderCode} ({selectedAuditLog.folderName || "Unnamed"})
                  </span>
                </div>
              )}
              {selectedAuditLog.metadata && (
                <div>
                  <span className="text-slate-500 block mb-1">Payload Metadata</span>
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-48">
                    {JSON.stringify(selectedAuditLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-end pt-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedAuditLog(null)}>
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Admin Dashboard
            </h1>
            <Badge className="bg-rose-600 hover:bg-rose-700 text-white text-xs">
              Role: ADMIN
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time platform telemetry, user governance, folder metadata, system limits, and cleanup monitoring.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunTests}
            disabled={isRunningTests}
            className="gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            {isRunningTests ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Run Tests
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTriggerCleanup(false)}
            disabled={isTriggeringCleanup}
            className="gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            {isTriggeringCleanup ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Run Cleanup
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTriggerCleanup(true)}
            disabled={isRetryingCleanup}
            className="gap-1.5 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
            title="Reset backoffs and retry failed cleanups"
          >
            {isRetryingCleanup ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Retry Failed Cleanup
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadStats();
              if (activeTab === "users") loadUsers();
              if (activeTab === "folders") loadFolders();
              if (activeTab === "settings") loadSettings();
              if (activeTab === "cleanup") loadCleanupJobs();
              if (activeTab === "errors") loadErrors();
              if (activeTab === "audit") loadAuditLogs();
              toast.success("Refreshed real-time data");
            }}
            className="gap-1.5 text-xs"
            title="Refresh active view"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
            activeTab === "overview"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Activity className="h-4 w-4" />
          Overview & Telemetry
        </button>

        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
            activeTab === "users"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Users className="h-4 w-4" />
          Users
        </button>

        <button
          onClick={() => setActiveTab("folders")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
            activeTab === "folders"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <FolderSync className="h-4 w-4" />
          Folder Metadata
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
            activeTab === "settings"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Settings className="h-4 w-4" />
          System Settings
        </button>

        <button
          onClick={() => setActiveTab("cleanup")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
            activeTab === "cleanup"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Trash2 className="h-4 w-4" />
          Cleanup Monitoring
        </button>

        <button
          onClick={() => setActiveTab("errors")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
            activeTab === "errors"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Error Logs ({stats?.failedCleanupJobs ? (stats.failedCleanupJobs + (stats.uploadFailures || 0)) : (stats?.uploadFailures || 0)})
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
            activeTab === "audit"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <FileSearch className="h-4 w-4" />
          Audit Trail
        </button>
      </div>

      {/* ── TAB 1: OVERVIEW & DASHBOARD STATISTICS ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Main 7 Dashboard Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total Registered Users */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Registered Users
                </CardTitle>
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600">
                  <Users className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats?.totalUsers ?? 0}
                </div>
                <p className="text-xs text-slate-500 mt-1">Verified platform accounts</p>
              </CardContent>
            </Card>

            {/* 2. Active Folders */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Active Folders
                </CardTitle>
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
                  <FolderSync className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {stats?.activeFolders ?? 0}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {stats?.guestFolders ?? 0} guest · {stats?.registeredFolders ?? 0} registered
                </p>
              </CardContent>
            </Card>

            {/* 3. Total Files */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Files
                </CardTitle>
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600">
                  <FileText className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {stats?.totalFiles ?? 0}
                </div>
                <p className="text-xs text-slate-500 mt-1">Uploaded binary artifacts</p>
              </CardContent>
            </Card>

            {/* 4. Total Storage */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Storage
                </CardTitle>
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
                  <HardDrive className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {formatBytes(stats?.totalStorageBytes || 0)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Across all active objects</p>
              </CardContent>
            </Card>

            {/* 5. Expired Folders Awaiting Cleanup */}
            <Card className="shadow-sm border-amber-200 dark:border-amber-900/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Expired Awaiting Cleanup
                </CardTitle>
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600">
                  <Clock className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {stats?.expiredFoldersAwaitingCleanup ?? 0}
                </div>
                <p className="text-xs text-slate-500 mt-1">Queued for automated purge</p>
              </CardContent>
            </Card>

            {/* 6. Failed Cleanup Jobs */}
            <Card className={`shadow-sm ${(stats?.failedCleanupJobs || 0) > 0 ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/20" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Failed Cleanup Jobs
                </CardTitle>
                <div className={`p-2 rounded-xl ${(stats?.failedCleanupJobs || 0) > 0 ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}>
                  <Trash2 className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-black ${(stats?.failedCleanupJobs || 0) > 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>
                  {stats?.failedCleanupJobs ?? 0}
                </div>
                <p className="text-xs text-slate-500 mt-1">Requires admin retry or review</p>
              </CardContent>
            </Card>

            {/* 7. Upload Failures */}
            <Card className={`shadow-sm ${(stats?.uploadFailures || 0) > 0 ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/20" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Upload Failures
                </CardTitle>
                <div className={`p-2 rounded-xl ${(stats?.uploadFailures || 0) > 0 ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}>
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-black ${(stats?.uploadFailures || 0) > 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>
                  {stats?.uploadFailures ?? 0}
                </div>
                <p className="text-xs text-slate-500 mt-1">Failed file uploads recorded</p>
              </CardContent>
            </Card>

            {/* Operational Status / Last Run */}
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cleanup Engine Status
                </CardTitle>
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600">
                  <Activity className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-semibold text-emerald-600 border-emerald-200">
                    {stats?.lastCleanup?.status || "HEALTHY"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-2 truncate">
                  Reclaimed {formatBytes(stats?.lastCleanup?.bytesReclaimed || 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Action Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/10 via-indigo-900/10 to-transparent border border-blue-200 dark:border-blue-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white flex-shrink-0">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Automated Lifecycle & Storage Management
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Guest ephemeral folders automatically expire in 24 hours. Purge workers periodically reclaim storage.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setActiveTab("cleanup")} className="text-xs">
                Inspect Cleanup Jobs
              </Button>
              <Button size="sm" onClick={() => handleTriggerCleanup(false)} disabled={isTriggeringCleanup} className="text-xs gap-1.5">
                {isTriggeringCleanup && <Loader2 className="h-3 w-3 animate-spin" />}
                Purge Expired Now
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: USER MANAGEMENT ── */}
      {activeTab === "users" && (
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  User Governance & Account Status
                </CardTitle>
                <CardDescription className="text-xs">
                  List registered users, inspect metadata, and suspend abusive accounts
                </CardDescription>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search by email or name..."
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setUserPage(1);
                    }}
                    className="pl-9 h-8 text-xs rounded-xl"
                  />
                </div>

                <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 text-xs bg-slate-50 dark:bg-slate-900">
                  <button
                    onClick={() => {
                      setUserStatusFilter("all");
                      setUserPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${userStatusFilter === "all" ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs" : "text-slate-500"}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      setUserStatusFilter("active");
                      setUserPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${userStatusFilter === "active" ? "bg-white dark:bg-slate-800 text-emerald-600 shadow-xs" : "text-slate-500"}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => {
                      setUserStatusFilter("suspended");
                      setUserPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all ${userStatusFilter === "suspended" ? "bg-white dark:bg-slate-800 text-rose-600 shadow-xs" : "text-slate-500"}`}
                  >
                    Suspended
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                <p className="text-xs text-slate-500">Loading user records...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 border border-dashed rounded-xl">
                No users found matching query.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">User</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Folders</th>
                      <th className="py-2.5 px-4">Storage Used</th>
                      <th className="py-2.5 px-4">Created Date</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {u.name || "Anonymous User"}
                          </div>
                          <div className="text-[11px] text-slate-500">{u.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              u.role === "ADMIN"
                                ? "border-purple-200 text-purple-700 bg-purple-50 dark:bg-purple-950/20"
                                : "border-slate-200 text-slate-600"
                            }`}
                          >
                            {u.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              u.isActive
                                ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
                                : "border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-950/20"
                            }`}
                          >
                            {u.isActive ? "ACTIVE" : "SUSPENDED"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {u.folderCount} folders
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                          {formatBytes(u.storageBytes)}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedUserDetail(u)}
                              className="h-7 text-xs px-2"
                            >
                              <Eye className="h-3 w-3 mr-1" /> Inspect
                            </Button>

                            {u.id !== user?.id && (
                              <Button
                                size="sm"
                                variant={u.isActive ? "outline" : "default"}
                                onClick={() => handleToggleSuspendUser(u)}
                                disabled={suspendingUserId === u.id}
                                className={`h-7 text-xs px-2 ${
                                  u.isActive
                                    ? "text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                }`}
                              >
                                {suspendingUserId === u.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : u.isActive ? (
                                  <>
                                    <UserX className="h-3 w-3 mr-1" /> Suspend
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3 w-3 mr-1" /> Activate
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {userTotalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span>Page {userPage} of {userTotalPages}</span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                    disabled={userPage <= 1 || usersLoading}
                    className="h-7 text-xs"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                    disabled={userPage >= userTotalPages || usersLoading}
                    className="h-7 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB 3: FOLDER METADATA ── */}
      {activeTab === "folders" && (
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FolderSync className="h-4 w-4 text-blue-600" />
                  Folder Metadata & Storage Auditing
                </CardTitle>
                <CardDescription className="text-xs">
                  Inspect folder codes, lifecycles, owners, sizes, and expiration schedules
                </CardDescription>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Search folder code or name..."
                    value={folderSearch}
                    onChange={(e) => {
                      setFolderSearch(e.target.value);
                      setFolderPage(1);
                    }}
                    className="pl-9 h-8 text-xs rounded-xl"
                  />
                </div>

                <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 text-xs bg-slate-50 dark:bg-slate-900">
                  {(["ALL", "ACTIVE", "EXPIRED", "DELETED"] as const).map((statusKey) => (
                    <button
                      key={statusKey}
                      onClick={() => {
                        setFolderStatusFilter(statusKey);
                        setFolderPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                        folderStatusFilter === statusKey
                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-500"
                      }`}
                    >
                      {statusKey}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {foldersLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                <p className="text-xs text-slate-500">Loading folder metadata...</p>
              </div>
            ) : folders.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 border border-dashed rounded-xl">
                No folders matching query.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">Folder Code</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Owner</th>
                      <th className="py-2.5 px-4">Size & Files</th>
                      <th className="py-2.5 px-4">Expiration</th>
                      <th className="py-2.5 px-4">Created Date</th>
                      <th className="py-2.5 px-4 text-right">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {folders.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-blue-600 text-[13px]">
                            {f.folderCode}
                          </span>
                          <span className="block text-[11px] text-slate-500 max-w-[180px] truncate">
                            {f.folderName}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              f.status === "ACTIVE"
                                ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
                                : f.status === "EXPIRED"
                                ? "border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-950/20"
                                : "border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-950/20"
                            }`}
                          >
                            {f.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                          {f.owner.isGuest ? (
                            <span className="text-slate-400 italic">Guest (Ephemeral)</span>
                          ) : (
                            <span className="font-medium text-slate-900 dark:text-white">
                              {f.owner.email}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatBytes(f.totalSize)}
                          </div>
                          <div className="text-[10px] text-slate-500">{f.fileCount} file(s)</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {new Date(f.expiresAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(f.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleInspectFolder(f.folderCode)}
                            disabled={loadingFolderDetail}
                            className="h-7 text-xs px-2 gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" /> Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Folder Pagination */}
            {folderTotalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span>Page {folderPage} of {folderTotalPages}</span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFolderPage((p) => Math.max(1, p - 1))}
                    disabled={folderPage <= 1 || foldersLoading}
                    className="h-7 text-xs"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFolderPage((p) => Math.min(folderTotalPages, p + 1))}
                    disabled={folderPage >= folderTotalPages || foldersLoading}
                    className="h-7 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB 4: SYSTEM SETTINGS ── */}
      {activeTab === "settings" && (
        <Card className="shadow-sm">
          <form onSubmit={handleSaveSettings}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="h-4 w-4 text-blue-600" />
                    Global Platform Configuration & Limits
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Fine-tune storage quotas, concurrent uploads, video thresholds, and retention policies
                  </CardDescription>
                </div>
                <Button type="submit" size="sm" disabled={isSavingSettings} className="gap-1.5 h-8">
                  {isSavingSettings ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" /> Save Changes
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsLoading ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                  <p className="text-xs text-slate-500">Loading system settings...</p>
                </div>
              ) : settings.length === 0 ? (
                <p className="text-xs text-slate-500">No settings available.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {settings.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                          {s.key}
                        </label>
                        {s.isPublic && (
                          <Badge variant="outline" className="text-[10px]">
                            Public
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {s.description}
                      </p>
                      <Input
                        value={settingsForm[s.key] ?? s.value}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({ ...prev, [s.key]: e.target.value }))
                        }
                        className="h-9 text-xs font-mono mt-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
              <Button type="submit" size="sm" disabled={isSavingSettings} className="gap-1.5">
                {isSavingSettings ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Save Policy Changes
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* ── TAB 5: CLEANUP MONITORING ── */}
      {activeTab === "cleanup" && (
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-blue-600" />
                  Automated Cleanup Worker Engine
                </CardTitle>
                <CardDescription className="text-xs">
                  Runs background storage reclamation and purges expired folders
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTriggerCleanup(true)}
                  disabled={isRetryingCleanup}
                  className="gap-1.5 text-xs h-8 text-amber-600 hover:text-amber-700"
                >
                  {isRetryingCleanup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Retry Failed Purge
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleTriggerCleanup(false)}
                  disabled={isTriggeringCleanup}
                  className="gap-1.5 text-xs h-8"
                >
                  {isTriggeringCleanup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Trigger Purge
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {cleanupLoading ? (
                <div className="flex flex-col items-center justify-center p-12">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                  <p className="text-xs text-slate-500">Loading cleanup job logs...</p>
                </div>
              ) : cleanupJobs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 rounded-xl border border-dashed">
                  No cleanup jobs recorded. Click &quot;Trigger Purge&quot; above to execute an initial cycle.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4">Job Type</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Items Purged</th>
                        <th className="py-2.5 px-4">Storage Reclaimed</th>
                        <th className="py-2.5 px-4">Failures</th>
                        <th className="py-2.5 px-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {cleanupJobs.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">
                            {job.jobType}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                job.status === "COMPLETED"
                                  ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
                                  : job.status === "FAILED"
                                  ? "border-rose-200 text-rose-700 bg-rose-50 dark:bg-rose-950/20"
                                  : job.status === "PARTIAL"
                                  ? "border-amber-200 text-amber-700 bg-amber-50 dark:bg-amber-950/20"
                                  : "border-blue-200 text-blue-700 bg-blue-50"
                              }`}
                            >
                              {job.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                            {job.foldersPurged} folders · {job.filesPurged} files
                          </td>
                          <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatBytes(job.bytesReclaimed)}
                          </td>
                          <td className="py-3 px-4">
                            {job.failedDeletions > 0 ? (
                              <span className="font-bold text-rose-600">{job.failedDeletions} failed</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {new Date(job.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TAB 6: ERROR LOGS (UPLOAD & OPERATIONAL) ── */}
      {activeTab === "errors" && (
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  Operational Failures & Upload Errors
                </CardTitle>
                <CardDescription className="text-xs">
                  Real database logs of upload interruptions, storage purge errors, and failed cleanup jobs
                </CardDescription>
              </div>

              {/* Sub-tabs */}
              <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 text-xs bg-slate-50 dark:bg-slate-900">
                <button
                  onClick={() => setErrorSubTab("upload")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    errorSubTab === "upload"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500"
                  }`}
                >
                  Upload Errors ({uploadErrors.length})
                </button>
                <button
                  onClick={() => setErrorSubTab("operational")}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    errorSubTab === "operational"
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500"
                  }`}
                >
                  Operational Errors ({operationalErrors.length})
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {errorsLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                <p className="text-xs text-slate-500">Loading error traces...</p>
              </div>
            ) : errorSubTab === "upload" ? (
              uploadErrors.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500 border border-dashed rounded-xl">
                  No upload failures recorded. File upload pipeline is healthy!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4">Artifact / Entity</th>
                        <th className="py-2.5 px-4">Target Folder</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4">Size</th>
                        <th className="py-2.5 px-4">Details</th>
                        <th className="py-2.5 px-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {uploadErrors.map((err) => (
                        <tr key={err.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            {err.title}
                          </td>
                          <td className="py-3 px-4 font-mono text-blue-600">
                            {err.folderCode || "-"}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="border-rose-200 text-rose-700 bg-rose-50 text-[10px]">
                              {err.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {formatBytes(err.sizeBytes)}
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={err.details}>
                            {err.details}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px]">
                            {new Date(err.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : operationalErrors.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 border border-dashed rounded-xl">
                No operational errors or purge failures detected. Background workers running smoothly!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Title / Context</th>
                      <th className="py-2.5 px-4">Attempts</th>
                      <th className="py-2.5 px-4">Error Message</th>
                      <th className="py-2.5 px-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {operationalErrors.map((err) => (
                      <tr key={err.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {err.category}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {err.title}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {err.attempts}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-rose-600 max-w-sm truncate" title={err.error}>
                          {err.error}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(err.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TAB 7: AUDIT TRAIL STREAM ── */}
      {activeTab === "audit" && (
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-blue-600" />
                  Security & Activity Audit Log
                </CardTitle>
                <CardDescription className="text-xs">
                  Immutable record of user authentication, folder lifecycles, and cleanup operations
                </CardDescription>
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Filter by action, email, code..."
                  value={auditSearch}
                  onChange={(e) => {
                    setAuditSearch(e.target.value);
                    setAuditPage(1);
                  }}
                  className="pl-9 h-8 text-xs rounded-xl"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mb-2" />
                <p className="text-xs text-slate-500">Loading audit records...</p>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 border border-dashed rounded-xl">
                No audit log entries matching criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">User</th>
                      <th className="py-2.5 px-4">Target Folder</th>
                      <th className="py-2.5 px-4">IP Address</th>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {log.userEmail || <span className="text-slate-400 italic">System / Anonymous</span>}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-blue-600">
                          {log.folderCode || "-"}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                          {log.ipAddress || "-"}
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedAuditLog(log)}
                            className="h-7 text-xs px-2"
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Audit Pagination */}
            {auditTotalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span>Page {auditPage} of {auditTotalPages}</span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    disabled={auditPage <= 1 || auditLoading}
                    className="h-7 text-xs"
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage >= auditTotalPages || auditLoading}
                    className="h-7 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
