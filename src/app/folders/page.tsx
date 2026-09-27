"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FolderSearch,
  Search,
  FolderPlus,
  Clock,
  Lock,
  Loader2,
  Calendar,
  ExternalLink,
  Copy,
  Check,
  QrCode,
  Edit2,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  X,
  Files,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { QrModal } from "@/components/folder/qr-modal";
import { ShareModal } from "@/components/folder/share-modal";
import { PrivacyModal } from "@/components/folder/privacy-modal";
import { AppLoader } from "@/components/ui/loader";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserFolder {
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

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface FolderStatsMeta {
  total: number;
  active: number;
  expired: number;
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

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FoldersPage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const toast = useToast();

  // Folders state
  const [folders, setFolders] = React.useState<UserFolder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pagination, setPagination] = React.useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 9,
    totalPages: 1,
  });
  const [stats, setStats] = React.useState<FolderStatsMeta>({
    total: 0,
    active: 0,
    expired: 0,
  });

  // Query state
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "expired">("all");
  const [sortOption, setSortOption] = React.useState<string>("createdAt_desc");
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = React.useState(1);

  // Selected folder for modals
  const [selectedFolder, setSelectedFolder] = React.useState<UserFolder | null>(null);
  const [showQrModal, setShowQrModal] = React.useState(false);
  const [showShareModal, setShowShareModal] = React.useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = React.useState(false);

  // Rename modal
  const [renameFolder, setRenameFolder] = React.useState<UserFolder | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [isRenaming, setIsRenaming] = React.useState(false);

  // Delete modal
  const [deleteFolder, setDeleteFolder] = React.useState<UserFolder | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Copy feedback
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  // Authentication check
  React.useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login?callbackUrl=/folders");
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch folders with search, filter, sort, and pagination
  const fetchFolders = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);

    const [sortBy, sortOrder] = sortOption.split("_");
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: "9",
      status: statusFilter,
      sortBy: sortBy || "createdAt",
      sortOrder: sortOrder || "desc",
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    try {
      const res = await fetch(`/api/folders?${params.toString()}`);
      if (res.status === 401) {
        router.push("/login?callbackUrl=/folders");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setFolders(data.folders || []);
        if (data.pagination) setPagination(data.pagination);
        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Error loading folders:", err);
      toast.error("Failed to load folders");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, currentPage, statusFilter, sortOption, search, router, toast]);

  // Debounced search trigger
  React.useEffect(() => {
    const timer = setTimeout(() => {
      fetchFolders();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchFolders]);

  // ── Actions ──

  const handleCopyLink = (folder: UserFolder, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigator.clipboard.writeText(folder.shareUrl);
    setCopiedCode(folder.folderCode);
    setTimeout(() => setCopiedCode(null), 2000);
    toast.success(`Share link for ${folder.folderCode} copied!`);
  };

  const handleOpenQr = (folder: UserFolder, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setSelectedFolder(folder);
    setShowQrModal(true);
  };

  const handleOpenSettings = (folder: UserFolder, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setSelectedFolder(folder);
    setShowPrivacyModal(true);
  };

  const handleStartRename = (folder: UserFolder, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setRenameFolder(folder);
    setRenameName(folder.folderName);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameFolder || !renameName.trim()) return;

    setIsRenaming(true);
    try {
      const res = await fetch(`/api/folders/${renameFolder.folderCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName: renameName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rename folder");

      toast.success("Folder renamed successfully");
      setRenameFolder(null);
      fetchFolders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setIsRenaming(false);
    }
  };

  const handleStartDelete = (folder: UserFolder, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setDeleteFolder(folder);
  };

  const handleConfirmDelete = async () => {
    if (!deleteFolder) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/folders/${deleteFolder.folderCode}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete folder");
      }
      toast.success("Folder deleted");
      setDeleteFolder(null);
      fetchFolders();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setIsDeleting(false);
    }
  };

  if (authLoading) {
    return (
      <AppLoader 
        title="Loading Folders" 
        subtitle="Retrieving your active folders and shares..." 
      />
    );
  }

  if (!isAuthenticated) return null;

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
          <PrivacyModal
            isOpen={showPrivacyModal}
            onClose={() => {
              setShowPrivacyModal(false);
              setSelectedFolder(null);
            }}
            folderCode={selectedFolder.folderCode}
            initialVisibility={selectedFolder.visibility}
            initialAllowDownload={selectedFolder.allowDownload}
            hasPassword={selectedFolder.hasPassword}
            onUpdated={() => {
              toast.success("Folder privacy settings updated");
              fetchFolders();
            }}
          />
        </>
      )}

      {/* ── Rename Modal ── */}
      {renameFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md shadow-2xl">
            <form onSubmit={handleConfirmRename}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Edit2 className="h-4 w-4 text-blue-600" />
                  Rename Folder
                </CardTitle>
                <CardDescription>
                  Enter a new title for folder <span className="font-mono font-semibold">{renameFolder.folderCode}</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Folder Name
                  </label>
                  <Input
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    required
                    maxLength={100}
                    autoFocus
                    disabled={isRenaming}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRenameFolder(null)}
                  disabled={isRenaming}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isRenaming || !renameName.trim()}>
                  {isRenaming ? "Saving..." : "Save Name"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md shadow-2xl border-rose-200 dark:border-rose-900/60">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 mb-2">
                <Trash2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Delete Folder?</CardTitle>
              <CardDescription>
                Are you sure you want to delete <span className="font-bold text-slate-800 dark:text-slate-200">{deleteFolder.folderName}</span> ({deleteFolder.folderCode})?
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-xs text-slate-500">
              This will permanently delete the folder and all its associated files from object storage. This action cannot be undone.
            </CardContent>
            <CardFooter className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteFolder(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isDeleting ? "Deleting..." : "Delete Forever"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              My Folders
            </h1>
            <Badge variant="outline" className="text-xs">
              {stats.total} total
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage your registered 15-day folders, inspect storage usage, modify permissions, or share links.
          </p>
        </div>

        <Link href="/create">
          <Button className="gap-2 shadow-sm bg-blue-600 hover:bg-blue-700">
            <FolderPlus className="h-4 w-4" />
            New Folder
          </Button>
        </Link>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by folder name, code, or description..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 h-10 rounded-xl"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Pills & Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Pills */}
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
              <button
                onClick={() => {
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  statusFilter === "all"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                All ({stats.total})
              </button>
              <button
                onClick={() => {
                  setStatusFilter("active");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  statusFilter === "active"
                    ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Active ({stats.active})
              </button>
              <button
                onClick={() => {
                  setStatusFilter("expired");
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  statusFilter === "expired"
                    ? "bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                Expired ({stats.expired})
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortOption}
                onChange={(e) => {
                  setSortOption(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="createdAt_desc">Newest Created</option>
                <option value="createdAt_asc">Oldest Created</option>
                <option value="expiresAt_asc">Expiring Soonest</option>
                <option value="expiresAt_desc">Expiring Latest</option>
                <option value="folderName_asc">Name (A to Z)</option>
                <option value="totalSize_desc">Largest Storage</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === "grid"
                    ? "bg-slate-100 dark:bg-slate-800 text-blue-600"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === "list"
                    ? "bg-slate-100 dark:bg-slate-800 text-blue-600"
                    : "text-slate-400 hover:text-slate-700"
                }`}
                title="List view"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Folders Display ── */}
      {loading ? (
        <AppLoader 
          variant="inline"
          title="Loading Folders" 
          subtitle="Fetching your latest folders and files..." 
        />
      ) : folders.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 dark:border-slate-800 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mb-3">
            <FolderSearch className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {search ? `No folders match "${search}"` : "No folders found"}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? "Try adjusting your search criteria or clearing filters."
              : "You haven't created any folders matching the selected filter."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {search && (
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear Search
              </Button>
            )}
            <Link href="/create">
              <Button size="sm" className="gap-1.5">
                <FolderPlus className="h-4 w-4" />
                Create Folder
              </Button>
            </Link>
          </div>
        </Card>
      ) : viewMode === "grid" ? (
        /* ── Grid View ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {folders.map((folder) => {
            const rem = getTimeRemaining(folder.remainingMs);
            const createdStr = new Date(folder.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const expiresStr = new Date(folder.expiresAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <div
                key={folder.id}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:border-blue-400 dark:hover:border-blue-700 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-lg border border-blue-200/50 dark:border-blue-900/50">
                        {folder.folderCode}
                      </span>
                      <button
                        onClick={(e) => handleCopyLink(folder, e)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        title="Copy Code"
                      >
                        {copiedCode === folder.folderCode ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>

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
                            ? "border-amber-200 text-amber-700 dark:border-amber-900/60 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
                            : "border-emerald-200 text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
                        }`}
                      >
                        {folder.isExpired ? (
                          "Expired"
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {rem.label}
                          </span>
                        )}
                      </Badge>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <Link href={`/${folder.folderCode}`} className="block">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 transition-colors">
                      {folder.folderName}
                    </h3>
                    {folder.description ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                        {folder.description}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic mt-1">No description.</p>
                    )}
                  </Link>

                  {/* Metadata Stats */}
                  <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Files className="h-3.5 w-3.5 text-slate-400" />
                      <span>{folder.fileCount} {folder.fileCount === 1 ? "file" : "files"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="h-3.5 w-3.5 text-slate-400" />
                      <span>{formatBytes(folder.totalSizeBytes)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>Created {createdStr}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>Expires {expiresStr}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                  <Link href={`/${folder.folderCode}`}>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 text-blue-600 hover:text-blue-700">
                      Open <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleCopyLink(folder, e)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Copy Share Link"
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
                      title="View QR Code"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleStartRename(folder, e)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Rename"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleOpenSettings(folder, e)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                      title="Privacy & Settings"
                    >
                      <Settings className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleStartDelete(folder, e)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── List / Table View ── */
        <Card className="overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Folder</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Files / Size</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4">Status & Expiration</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {folders.map((folder) => {
                  const rem = getTimeRemaining(folder.remainingMs);
                  const createdStr = new Date(folder.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <tr
                      key={folder.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Name */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white max-w-[200px]">
                        <Link href={`/${folder.folderCode}`} className="hover:text-blue-600 block truncate">
                          {folder.folderName}
                        </Link>
                        {folder.description && (
                          <span className="text-[11px] text-slate-400 block truncate font-normal">
                            {folder.description}
                          </span>
                        )}
                      </td>

                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {folder.folderCode}
                      </td>

                      {/* Files & Size */}
                      <td className="py-3.5 px-4 text-slate-500">
                        {folder.fileCount} files · {formatBytes(folder.totalSizeBytes)}
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-4 text-slate-500">
                        {createdStr}
                      </td>

                      {/* Status & Expiry */}
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            folder.isExpired
                              ? "border-amber-200 text-amber-700 dark:border-amber-900/60 dark:text-amber-400"
                              : "border-emerald-200 text-emerald-700 dark:border-emerald-900/60 dark:text-emerald-400"
                          }`}
                        >
                          {folder.isExpired ? "Expired" : rem.label}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/${folder.folderCode}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                              Open
                            </Button>
                          </Link>
                          <button
                            onClick={(e) => handleCopyLink(folder, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="Copy Link"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleOpenQr(folder, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="QR Code"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleStartRename(folder, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="Rename"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleOpenSettings(folder, e)}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                            title="Settings"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleStartDelete(folder, e)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Pagination ── */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500">
          <div>
            Showing{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-slate-900 dark:text-white">
              {pagination.total}
            </span>{" "}
            folders
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1 || loading}
              className="h-8 gap-1 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>

            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                disabled={loading}
                className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all ${
                  p === pagination.page
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {p}
              </button>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages || loading}
              className="h-8 gap-1 text-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
