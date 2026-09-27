"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderSync,
  FolderPlus,
  HardDrive,
  Files,
  Clock,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Share2,
  QrCode,
  Copy,
  Check,
  Folder as FolderIcon,
  Lock,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { QrModal } from "@/components/folder/qr-modal";
import { ShareModal } from "@/components/folder/share-modal";
import { AppLoader } from "@/components/ui/loader";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DashboardFolder {
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
  shareUrl: string;
  isExpired: boolean;
  remainingMs: number;
  expirationState: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";
}

interface DashboardStatsData {
  totalFolders: number;
  activeFolders: number;
  expiredFolders: number;
  totalFiles: number;
  totalStorageBytes: string;
  quotaBytes: string;
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number | string | bigint): string {
  const b = Number(bytes);
  if (isNaN(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Display only: remainingMs comes from the server (as of page load), never from the device clock
function getTimeRemaining(remainingMs: number): { label: string; urgent: boolean } {
  const diff = remainingMs;
  if (diff <= 0) return { label: "Expired", urgent: false };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  if (days > 1) return { label: `${days}d ${remHours}h left`, urgent: false };
  if (days === 1) return { label: `1d ${remHours}h left`, urgent: false };
  if (hours > 0) return { label: `${hours}h left`, urgent: hours < 12 };
  const mins = Math.max(1, Math.floor(diff / (1000 * 60)));
  return { label: `${mins}m left`, urgent: true };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8 animate-pulse">
      <div className="h-16 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-96 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-96 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState<DashboardStatsData | null>(null);
  const [recentFolders, setRecentFolders] = React.useState<DashboardFolder[]>([]);
  const [expiringSoon, setExpiringSoon] = React.useState<DashboardFolder[]>([]);

  // Selected folder for modals
  const [selectedFolder, setSelectedFolder] = React.useState<DashboardFolder | null>(null);
  const [showQrModal, setShowQrModal] = React.useState(false);
  const [showShareModal, setShowShareModal] = React.useState(false);

  // Copy feedback
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  // Authentication check
  React.useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login?callbackUrl=/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load real data from backend
  const loadDashboardData = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/stats");
      if (res.status === 401) {
        router.push("/login?callbackUrl=/dashboard");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setRecentFolders(data.recentFolders || []);
        setExpiringSoon(data.expiringSoon || []);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, router, toast]);

  React.useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated, loadDashboardData]);

  const handleCopyLink = (folder: DashboardFolder, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(folder.shareUrl);
    setCopiedCode(folder.folderCode);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success(`Share link for ${folder.folderCode} copied!`);
  };

  const handleOpenQr = (folder: DashboardFolder, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFolder(folder);
    setShowQrModal(true);
  };

  const handleOpenShare = (folder: DashboardFolder, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFolder(folder);
    setShowShareModal(true);
  };

  if (authLoading || (loading && !stats)) {
    return (
      <AppLoader 
        title="Loading Dashboard" 
        subtitle="Analyzing ephemeral storage and active folders..." 
      />
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const storageUsed = Number(stats?.totalStorageBytes || 0);
  const quota = Number(stats?.quotaBytes || 25 * 1024 * 1024 * 1024);
  const quotaPercent = Math.min(100, Math.max(0, Math.round((storageUsed / quota) * 100)));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* ── Modals ── */}
      {selectedFolder && (
        <>
          <QrModal
            isOpen={showQrModal}
            onClose={() => {
              setShowQrModal(false);
              setSelectedFolder(null);
            }}
            folderCode={selectedFolder.folderCode}
            shareUrl={selectedFolder.shareUrl}
            folderName={selectedFolder.folderName}
          />
          <ShareModal
            isOpen={showShareModal}
            onClose={() => {
              setShowShareModal(false);
              setSelectedFolder(null);
            }}
            folderCode={selectedFolder.folderCode}
            shareUrl={selectedFolder.shareUrl}
            folderName={selectedFolder.folderName}
            onOpenQr={() => {
              setShowShareModal(false);
              setShowQrModal(true);
            }}
          />
        </>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {user?.name ? `Welcome back, ${user.name}` : "User Dashboard"}
            </h1>
            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {user?.role === "ADMIN" ? "Admin" : "Verified Account"}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time analytics, ephemeral storage utilization, and folder health for{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{user?.email}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/folders">
            <Button variant="outline" className="gap-2">
              <FolderSync className="h-4 w-4" />
              All My Folders
            </Button>
          </Link>
          <Link href="/create">
            <Button className="gap-2 shadow-sm bg-blue-600 hover:bg-blue-700">
              <FolderPlus className="h-4 w-4" />
              Create Folder
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Expiration warning for registered users (server-computed state) ── */}
      {(() => {
        const soon = expiringSoon.filter((f) => f.expirationState === "EXPIRING_SOON");
        if (soon.length === 0) return null;
        return (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/40 p-4 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="font-bold uppercase tracking-wider">
                {soon.length === 1 ? "1 folder expires" : `${soon.length} folders expire`} within 24 hours
              </p>
              <p className="mt-1">
                {soon.map((f, i) => (
                  <React.Fragment key={f.id}>
                    {i > 0 && ", "}
                    <Link href={`/${f.folderCode}`} className="font-semibold underline underline-offset-2">{f.folderName}</Link>
                    {" "}({getTimeRemaining(f.remainingMs).label})
                  </React.Fragment>
                ))}
                . Files are permanently deleted from storage at expiry. Download anything you need to keep.
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Metric Cards Grid (5 Key Indicators) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Total Folders */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-400 dark:hover:border-blue-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Folders
            </CardTitle>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/80 p-2 text-blue-600 dark:text-blue-400">
              <FolderIcon className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {stats?.totalFolders ?? 0}
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span>Under account</span>
            </p>
          </CardContent>
        </Card>

        {/* 2. Active Folders */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-400 dark:hover:border-emerald-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Folders
            </CardTitle>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/80 p-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {stats?.activeFolders ?? 0}
            </div>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-1 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live & accessible
            </p>
          </CardContent>
        </Card>

        {/* 3. Expired Folders */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-amber-400 dark:hover:border-amber-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-bl-full pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Expired Folders
            </CardTitle>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/80 p-2 text-amber-600 dark:text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-amber-600 dark:text-amber-400">
              {stats?.expiredFolders ?? 0}
            </div>
            <p className="text-xs text-slate-500 mt-1">Lifecycle finished</p>
          </CardContent>
        </Card>

        {/* 4. Total Files */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-400 dark:hover:border-purple-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-bl-full pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Files
            </CardTitle>
            <div className="rounded-xl bg-purple-50 dark:bg-purple-950/80 p-2 text-purple-600 dark:text-purple-400">
              <Files className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {stats?.totalFiles ?? 0}
            </div>
            <p className="text-xs text-slate-500 mt-1">Uploaded across folders</p>
          </CardContent>
        </Card>

        {/* 5. Total Storage Used */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-indigo-400 dark:hover:border-indigo-700 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Storage Used
            </CardTitle>
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/80 p-2 text-indigo-600 dark:text-indigo-400">
              <HardDrive className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {formatBytes(stats?.totalStorageBytes || 0)}
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, quotaPercent)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{formatBytes(stats?.quotaBytes || 0)} quota</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Recently Created Folders (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderIcon className="h-5 w-5 text-blue-600" />
                Recently Created Folders
              </h2>
              <p className="text-xs text-slate-500">
                Latest shared repositories registered to your account
              </p>
            </div>
            <Link href="/folders" className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {recentFolders.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mb-3">
                <FolderPlus className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                No folders created yet
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Create a folder to generate custom 8-character codes, upload files, and share QR codes.
              </p>
              <div className="mt-4">
                <Link href="/create">
                  <Button size="sm" className="gap-1.5">
                    <FolderPlus className="h-4 w-4" />
                    Create Your First Folder
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {recentFolders.map((folder) => {
                const remaining = getTimeRemaining(folder.remainingMs);
                const createdDate = new Date(folder.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });

                return (
                  <div
                    key={folder.id}
                    className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:border-blue-400 dark:hover:border-blue-700 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Bar */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs font-black tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-lg border border-blue-200/50 dark:border-blue-900/50">
                          {folder.folderCode}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {folder.hasPassword && (
                            <span title="Password Protected">
                              <Lock className="h-3.5 w-3.5 text-slate-400" />
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              folder.isExpired
                                ? "border-amber-200 text-amber-700 dark:border-amber-900/60 dark:text-amber-400"
                                : "border-emerald-200 text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-400"
                            }`}
                          >
                            {folder.isExpired ? "Expired" : remaining.label}
                          </Badge>
                        </div>
                      </div>

                      {/* Folder Name & Description */}
                      <Link href={`/${folder.folderCode}`} className="block">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {folder.folderName}
                        </h3>
                        {folder.description && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                            {folder.description}
                          </p>
                        )}
                      </Link>

                      {/* Meta Stats */}
                      <div className="flex items-center gap-3 pt-3 text-[11px] text-slate-400">
                        <span>{folder.fileCount} {folder.fileCount === 1 ? "file" : "files"}</span>
                        <span>·</span>
                        <span>{formatBytes(folder.totalSizeBytes)}</span>
                        <span>·</span>
                        <span>Created {createdDate}</span>
                      </div>
                    </div>

                    {/* Quick Action Footer */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                      <Link
                        href={`/${folder.folderCode}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleCopyLink(folder, e)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Copy Link"
                        >
                          {copiedCode === folder.folderCode ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleOpenQr(folder, e)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="QR Code"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleOpenShare(folder, e)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Share"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Folders Expiring Soon + Storage Card */}
        <div className="space-y-6">
          {/* Expiring Soon Card */}
          <Card className="shadow-sm border-amber-100 dark:border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-slate-900 dark:text-white">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Expiring Soon
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">
                  Priority
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Folders reaching their 15-day lifecycle soonest
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {expiringSoon.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 rounded-xl bg-slate-50 dark:bg-slate-900/60">
                  No active folders expiring soon.
                </div>
              ) : (
                expiringSoon.map((f) => {
                  const rem = getTimeRemaining(f.remainingMs);
                  return (
                    <div
                      key={f.id}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/${f.folderCode}`}
                          className="text-xs font-bold text-slate-900 dark:text-white hover:text-blue-600 truncate max-w-[150px]"
                        >
                          {f.folderName}
                        </Link>
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                            rem.urgent
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 font-bold"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                          }`}
                        >
                          {rem.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/50 dark:border-slate-800/50 text-[11px] text-slate-500">
                        <span className="font-mono text-[10px]">{f.folderCode}</span>
                        <Link
                          href={`/${f.folderCode}`}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium inline-flex items-center gap-0.5"
                        >
                          View <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Storage Quota Summary */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-blue-600" />
                Account Storage Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Consumed</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatBytes(stats?.totalStorageBytes || 0)}
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all"
                  style={{ width: `${Math.max(1, quotaPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{quotaPercent}% utilized</span>
                <span>Max {formatBytes(stats?.quotaBytes || 0)}</span>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                Ephemeral storage automatically purges files when a folder expires or is deleted by its creator.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
