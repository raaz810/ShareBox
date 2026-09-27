"use client";

import * as React from "react";
import {
  UploadCloud,
  File as FileIcon,
  FileText,
  FileImage,
  FileVideo,
  FileArchive,
  Download,
  Trash2,
  Edit2,
  X,
  RotateCcw,
  Loader2,
  HardDrive,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Play,
  ZoomIn,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { validateFileAttributes, STORAGE_LIMITS } from "@/lib/storage-config";
import { useToast } from "@/components/ui/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FolderFileItem {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: string;
  checksum?: string | null;
  status: string;
  createdAt: string;
  originalFileName?: string;
}

interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  progress: number;
  bytesUploaded: number;
  status: "queued" | "uploading" | "success" | "error" | "cancelled";
  errorMessage?: string;
  xhr?: XMLHttpRequest;
}

interface FileManagerProps {
  folderCode: string;
  isOwner: boolean;
  allowDownload: boolean;
  folderPassword?: string;
  onStatsUpdated?: () => void;
}

type ViewMode = "list" | "grid";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | string | bigint): string {
  const b = Number(bytes);
  if (isNaN(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getCategory(mimeType: string, name: string): "image" | "video" | "document" | "archive" | "other" {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) return "image";
  if (mimeType.startsWith("video/") || ["mp4", "webm", "mov", "mkv"].includes(ext)) return "video";
  if (["zip", "rar"].includes(ext) || mimeType.includes("zip") || mimeType.includes("rar")) return "archive";
  if (
    mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("excel") ||
    mimeType.includes("powerpoint") || mimeType.startsWith("text/") ||
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ext)
  ) return "document";
  return "other";
}

function FileTypeIcon({ mimeType, name, size = "md" }: { mimeType: string; name: string; size?: "sm" | "md" | "lg" }) {
  const cat = getCategory(mimeType, name);
  const cls = size === "lg" ? "h-10 w-10" : size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  if (cat === "image") return <FileImage className={`${cls} text-blue-500`} />;
  if (cat === "video") return <FileVideo className={`${cls} text-purple-500`} />;
  if (cat === "archive") return <FileArchive className={`${cls} text-amber-500`} />;
  if (cat === "document") return <FileText className={`${cls} text-emerald-500`} />;
  return <FileIcon className={`${cls} text-slate-500`} />;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function FileSkeleton() {
  return (
    <div className="animate-pulse space-y-2 p-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-2 bg-slate-100 dark:bg-slate-900 rounded w-1/4" />
          </div>
          <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

interface LightboxProps {
  files: FolderFileItem[];
  startIndex: number;
  onClose: () => void;
  onDownload: (file: FolderFileItem) => void;
  allowDownload: boolean;
  isOwner: boolean;
}

function Lightbox({ files, startIndex, onClose, onDownload, allowDownload, isOwner }: LightboxProps) {
  const [idx, setIdx] = React.useState(startIndex);
  const file = files[idx];

  const prev = () => setIdx((i) => (i - 1 + files.length) % files.length);
  const next = () => setIdx((i) => (i + 1) % files.length);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!file) return null;
  const isImage = getCategory(file.mimeType, file.fileName) === "image";
  const isVideo = getCategory(file.mimeType, file.fileName) === "video";

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white text-sm font-semibold truncate max-w-xs">{file.fileName}</span>
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs">{idx + 1} / {files.length}</span>
          {(allowDownload || isOwner) && (
            <button
              onClick={() => onDownload(file)}
              className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      {files.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 rounded-full p-2 hover:bg-black/60 transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Content */}
      <div className="max-w-5xl max-h-[80vh] w-full px-16" onClick={(e) => e.stopPropagation()}>
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${file.id}/preview`}
            alt={file.fileName}
            className="max-h-[80vh] max-w-full mx-auto object-contain rounded-lg shadow-2xl"
            onError={(e) => { (e.target as HTMLImageElement).src = ""; }}
          />
        )}
        {isVideo && (
          <video
            src={`/api/files/${file.id}/preview`}
            controls
            autoPlay
            className="max-h-[80vh] max-w-full mx-auto rounded-lg shadow-2xl"
          />
        )}
      </div>

      {/* Bottom meta */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center px-4 py-3 bg-gradient-to-t from-black/60 to-transparent">
        <span className="text-white/50 text-xs">{formatBytes(file.fileSize)} · {file.mimeType}</span>
      </div>
    </div>
  );
}

// ─── FileCard (Grid) ─────────────────────────────────────────────────────────

interface FileCardProps {
  file: FolderFileItem;
  isOwner: boolean;
  allowDownload: boolean;
  onDownload: (f: FolderFileItem) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onPreview: (f: FolderFileItem) => void;
  downloadingId: string | null;
}

function FileCard({ file, isOwner, allowDownload, onDownload, onDelete, onRename, onPreview, downloadingId }: FileCardProps) {
  const cat = getCategory(file.mimeType, file.fileName);
  const isPreviewable = cat === "image" || cat === "video";

  const bgColors: Record<string, string> = {
    image: "bg-blue-50 dark:bg-blue-950/40",
    video: "bg-purple-50 dark:bg-purple-950/40",
    document: "bg-emerald-50 dark:bg-emerald-950/40",
    archive: "bg-amber-50 dark:bg-amber-950/40",
    other: "bg-slate-100 dark:bg-slate-800",
  };

  return (
    <div className="group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:shadow-md transition-all overflow-hidden">
      {/* Thumbnail area */}
      <div
        className={`relative flex items-center justify-center h-36 ${bgColors[cat]} cursor-pointer`}
        onClick={() => isPreviewable ? onPreview(file) : undefined}
      >
        {cat === "image" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${file.id}/preview`}
              alt={file.fileName}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </>
        ) : cat === "video" ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-purple-600/20 flex items-center justify-center">
              <Play className="h-6 w-6 text-purple-600" />
            </div>
            <span className="text-[10px] text-purple-600 font-semibold uppercase tracking-wider">Video</span>
          </div>
        ) : (
          <FileTypeIcon mimeType={file.mimeType} name={file.fileName} size="lg" />
        )}
      </div>

      {/* File info */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate" title={file.fileName}>
          {file.fileName}
        </p>
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{formatBytes(file.fileSize)}</span>
          <span className="uppercase font-bold">{file.mimeType.split("/")[1]?.slice(0, 6) || "FILE"}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 pt-1">
          {(allowDownload || isOwner) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownload(file)}
              disabled={downloadingId === file.id}
              className="flex-1 h-7 text-[10px] gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              {downloadingId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Download
            </Button>
          )}
          {isOwner && (
            <>
              <button
                onClick={() => onRename(file.id, file.fileName)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Rename"
              >
                <Edit2 className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDelete(file.id)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FileManager (Main Component) ────────────────────────────────────────────

export function FileManager({ folderCode, isOwner, allowDownload, folderPassword, onStatsUpdated }: FileManagerProps) {
  const toast = useToast();
  const [files, setFiles] = React.useState<FolderFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = React.useState(true);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");

  // Upload queue
  const [queue, setQueue] = React.useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Rename
  const [editingFileId, setEditingFileId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [savingRename, setSavingRename] = React.useState(false);

  // Download state
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = React.useState(false);

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const previewableFiles = files.filter((f) => {
    const c = getCategory(f.mimeType, f.fileName);
    return c === "image" || c === "video";
  });

  // Delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  // ── Fetch Files ──
  const fetchFiles = React.useCallback(async () => {
    try {
      setLoadingFiles(true);
      const guestToken = localStorage.getItem(`sharebox_ownership_${folderCode}`);
      const headers: Record<string, string> = {};
      if (guestToken) headers["x-ownership-token"] = guestToken;
      if (folderPassword) headers["x-folder-password"] = folderPassword;
      const res = await fetch(`/api/folders/${folderCode}/files`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load files");
      setFiles(data.files || []);
      setFileError(null);
    } catch (err: unknown) {
      setFileError(err instanceof Error ? err.message : "Error loading files");
    } finally {
      setLoadingFiles(false);
    }
  }, [folderCode, folderPassword]);

  React.useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // ── Upload logic ──
  const handleSelectFiles = (selected: FileList | File[]) => {
    const fileList = Array.from(selected);
    if (!fileList.length) return;
    const items: UploadQueueItem[] = fileList.map((file) => {
      const v = validateFileAttributes(file.name, file.type, file.size);
      return {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file, name: file.name, size: file.size,
        mimeType: file.type || "application/octet-stream",
        progress: 0, bytesUploaded: 0,
        status: v.isValid ? "queued" : "error",
        errorMessage: v.error,
      };
    });
    if (items.some((i) => i.status === "error")) {
      items.filter((i) => i.status === "error").forEach((i) => toast.error(`${i.name}: ${i.errorMessage}`));
    }
    setQueue((prev) => [...prev, ...items]);
  };

  const uploadSingleItem = React.useCallback((item: UploadQueueItem) => {
    const guestToken = localStorage.getItem(`sharebox_ownership_${folderCode}`);
    const formData = new FormData();
    formData.append("file", item.file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/folders/${folderCode}/upload`);
    if (guestToken) xhr.setRequestHeader("x-ownership-token", guestToken);
    if (folderPassword) xhr.setRequestHeader("x-folder-password", folderPassword);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: pct, bytesUploaded: e.loaded } : q));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, progress: 100, status: "success", bytesUploaded: item.size } : q));
        toast.success(`${item.name} uploaded successfully`);
        fetchFiles();
        onStatsUpdated?.();
      } else {
        let errText = "Upload failed";
        try { errText = JSON.parse(xhr.responseText).error || errText; } catch { /* noop */ }
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "error", errorMessage: errText } : q));
        toast.error(`${item.name}: ${errText}`);
      }
    };
    xhr.onerror = () => {
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "error", errorMessage: "Network error" } : q));
      toast.error(`${item.name}: Network transfer failed`);
    };
    xhr.onabort = () => {
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "cancelled", errorMessage: "Cancelled" } : q));
    };
    setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "uploading", xhr } : q));
    xhr.send(formData);
  }, [folderCode, folderPassword, fetchFiles, onStatsUpdated, toast]);

  React.useEffect(() => {
    const active = queue.filter((q) => q.status === "uploading").length;
    const queued = queue.filter((q) => q.status === "queued");
    if (active < STORAGE_LIMITS.MAX_CONCURRENT_UPLOADS && queued.length > 0) {
      uploadSingleItem(queued[0]);
    }
  }, [queue, uploadSingleItem]);

  // ── Download ──
  const handleDownload = async (file: FolderFileItem) => {
    try {
      setDownloadingId(file.id);
      const guestToken = localStorage.getItem(`sharebox_ownership_${folderCode}`);
      const headers: Record<string, string> = {};
      if (guestToken) headers["x-ownership-token"] = guestToken;
      if (folderPassword) headers["x-folder-password"] = folderPassword;
      const res = await fetch(`/api/files/${file.id}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate download URL");
      const link = document.createElement("a");
      link.href = data.downloadUrl;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Download ZIP ──
  const handleDownloadZip = async () => {
    try {
      setDownloadingZip(true);
      toast.info("Preparing ZIP archive...");
      const guestToken = localStorage.getItem(`sharebox_ownership_${folderCode}`);
      const headers: Record<string, string> = {};
      if (guestToken) headers["x-ownership-token"] = guestToken;
      if (folderPassword) headers["x-folder-password"] = folderPassword;
      const res = await fetch(`/api/folders/${folderCode}/download-zip`, { headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "ZIP download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ShareBox-${folderCode}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("ZIP archive downloaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "ZIP download failed");
    } finally {
      setDownloadingZip(false);
    }
  };

  // ── Delete ──
  const handleDeleteFile = async (fileId: string) => {
    setConfirmDeleteId(null);
    try {
      const guestToken = localStorage.getItem(`sharebox_ownership_${folderCode}`);
      const headers: Record<string, string> = {};
      if (guestToken) headers["x-ownership-token"] = guestToken;
      const res = await fetch(`/api/files/${fileId}`, { method: "DELETE", headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete file");
      }
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("File deleted");
      onStatsUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Deletion failed");
    }
  };

  // ── Rename ──
  const handleSaveRename = async (fileId: string) => {
    if (!editingName.trim()) return;
    setSavingRename(true);
    try {
      const guestToken = localStorage.getItem(`sharebox_ownership_${folderCode}`);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (guestToken) headers["x-ownership-token"] = guestToken;
      const res = await fetch(`/api/files/${fileId}`, {
        method: "PATCH", headers,
        body: JSON.stringify({ fileName: editingName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      setFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, fileName: data.file.fileName } : f));
      setEditingFileId(null);
      toast.success("File renamed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not rename file");
    } finally {
      setSavingRename(false);
    }
  };

  // ── Open lightbox ──
  const openLightbox = (file: FolderFileItem) => {
    const idx = previewableFiles.findIndex((f) => f.id === file.id);
    if (idx >= 0) setLightboxIndex(idx);
  };

  // ── Stats ──
  const totalFolderBytes = files.reduce((acc, f) => acc + BigInt(f.fileSize || 0), BigInt(0));
  const activeAndDone = queue.filter((q) => q.status !== "error" && q.status !== "cancelled");
  const totalQueueBytes = activeAndDone.reduce((a, q) => a + q.size, 0);
  const totalUploadedBytes = activeAndDone.reduce((a, q) => a + q.bytesUploaded, 0);
  const overallProgress = totalQueueBytes > 0 ? Math.round((totalUploadedBytes / totalQueueBytes) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* ── Lightbox ── */}
      {lightboxIndex !== null && (
        <Lightbox
          files={previewableFiles}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={handleDownload}
          allowDownload={allowDownload}
          isOwner={isOwner}
        />
      )}

      {/* ── Delete Confirm Modal ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center">
              <Trash2 className="h-6 w-6 text-rose-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Delete this file?</p>
              <p className="text-xs text-slate-500 mt-1">This action is permanent and cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
              <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white" onClick={() => handleDeleteFile(confirmDeleteId)}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dropzone (owner only) ── */}
      {isOwner && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) handleSelectFiles(e.dataTransfer.files);
          }}
          className={`relative rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
            isDragging
              ? "border-blue-500 bg-blue-50/80 dark:border-blue-500 dark:bg-blue-950/40 scale-[1.01]"
              : "border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/30 dark:border-slate-800 dark:bg-slate-900/30"
          }`}
        >
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files) handleSelectFiles(e.target.files); e.target.value = ""; }}
          />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mb-3 shadow-sm">
            <UploadCloud className="h-7 w-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Drag files here, or{" "}
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400">
              browse your device
            </button>
          </h3>
          <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
            Images · Documents (PDF, DOCX, XLSX) · Videos (MP4, WEBM) · Archives (ZIP, RAR) — Max 100 MB per file, 250 MB for video
          </p>
        </div>
      )}

      {/* ── Upload Queue ── */}
      {queue.length > 0 && (
        <Card className="border-blue-200 dark:border-blue-900/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-blue-600" />
                  Upload Queue ({queue.filter((q) => q.status === "success").length}/{queue.length} done)
                </CardTitle>
                {totalQueueBytes > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Overall: {overallProgress}%</span>
                      <span>{formatBytes(totalUploadedBytes)} / {formatBytes(totalQueueBytes)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${overallProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
              {queue.some((q) => ["success", "error", "cancelled"].includes(q.status)) && (
                <Button variant="ghost" size="sm" onClick={() => setQueue((p) => p.filter((q) => ["uploading", "queued"].includes(q.status)))}
                  className="text-xs h-7">Clear done</Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {queue.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileTypeIcon mimeType={item.mimeType} name={item.name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-xs">{item.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatBytes(item.size)} ·{" "}
                        {item.status === "uploading" && <span className="text-blue-600">{item.progress}%</span>}
                        {item.status === "success" && <span className="text-emerald-600">Done</span>}
                        {item.status === "error" && <span className="text-rose-600">{item.errorMessage}</span>}
                        {item.status === "cancelled" && <span className="text-amber-600">Cancelled</span>}
                        {item.status === "queued" && <span>Queued</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.status === "uploading" && (
                      <Button variant="ghost" size="sm" onClick={() => { item.xhr?.abort(); }}
                        className="h-6 px-2 text-[10px] text-rose-600 hover:bg-rose-50">Cancel</Button>
                    )}
                    {["error", "cancelled"].includes(item.status) && (
                      <Button variant="outline" size="sm" onClick={() => setQueue((p) => p.map((q) => q.id === item.id ? { ...q, status: "queued", progress: 0, errorMessage: undefined } : q))}
                        className="h-6 px-2 text-[10px] gap-1">
                        <RotateCcw className="h-3 w-3" />Retry
                      </Button>
                    )}
                    <button onClick={() => setQueue((p) => p.filter((q) => q.id !== item.id))}
                      className="text-slate-400 hover:text-slate-600 p-0.5">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {item.status === "uploading" && (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div className="h-full bg-blue-600 transition-all duration-150" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Files Panel ── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-blue-600" />
              Files ({files.length})
            </CardTitle>
            <CardDescription className="text-xs">{formatBytes(totalFolderBytes)} stored</CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {/* Download all ZIP */}
            {(allowDownload || isOwner) && files.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownloadZip} disabled={downloadingZip}
                className="h-8 text-xs gap-1.5 hidden sm:flex">
                {downloadingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                Download All
              </Button>
            )}
            {!allowDownload && !isOwner && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">View Only</Badge>
            )}
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                <List className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setViewMode("grid")}
                className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchFiles} disabled={loadingFiles} className="h-8 px-2">
              <RotateCcw className={`h-3.5 w-3.5 ${loadingFiles ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loadingFiles ? (
            <FileSkeleton />
          ) : fileError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/50 p-4 text-center text-xs text-rose-700 dark:text-rose-300">
              {fileError}
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 mb-3">
                <FileIcon className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No files yet</p>
              <p className="text-xs text-slate-400 mt-1">
                {isOwner ? "Upload files above to start sharing." : "The owner hasn't uploaded any files yet."}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            /* ── Grid View ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {files.map((file) => {
                if (editingFileId === file.id) {
                  return (
                    <div key={file.id} className="rounded-2xl border border-blue-300 dark:border-blue-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                      <Input value={editingName} onChange={(e) => setEditingName(e.target.value)}
                        className="h-8 text-xs" autoFocus disabled={savingRename} />
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => handleSaveRename(file.id)} disabled={savingRename} className="flex-1 h-7 text-xs">Save</Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingFileId(null)} className="h-7 text-xs">×</Button>
                      </div>
                    </div>
                  );
                }
                return (
                  <FileCard key={file.id} file={file} isOwner={isOwner} allowDownload={allowDownload}
                    onDownload={handleDownload} onDelete={(id) => setConfirmDeleteId(id)}
                    onRename={(id, name) => { setEditingFileId(id); setEditingName(name); }}
                    onPreview={openLightbox} downloadingId={downloadingId} />
                );
              })}
            </div>
          ) : (
            /* ── List View ── */
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {files.map((file) => {
                const isEditing = editingFileId === file.id;
                const cat = getCategory(file.mimeType, file.fileName);
                const isPreviewable = cat === "image" || cat === "video";
                const dateStr = new Date(file.createdAt).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                });

                return (
                  <div key={file.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 px-2 hover:bg-slate-50/80 dark:hover:bg-slate-900/40 rounded-xl transition-colors">
                    {/* Icon / thumb */}
                    <div
                      className={`rounded-xl p-2.5 bg-slate-100 dark:bg-slate-800 shrink-0 ${isPreviewable ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                      onClick={() => isPreviewable ? openLightbox(file) : undefined}
                    >
                      <FileTypeIcon mimeType={file.mimeType} name={file.fileName} />
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input value={editingName} onChange={(e) => setEditingName(e.target.value)}
                            className="h-8 text-xs font-semibold flex-1" autoFocus disabled={savingRename} />
                          <Button size="sm" onClick={() => handleSaveRename(file.id)} disabled={savingRename} className="h-8 text-xs">Save</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingFileId(null)} className="h-8 text-xs">Cancel</Button>
                        </div>
                      ) : (
                        <p
                          className={`text-sm font-semibold text-slate-900 dark:text-white truncate ${isPreviewable ? "cursor-pointer hover:text-blue-600 transition-colors" : ""}`}
                          onClick={() => isPreviewable ? openLightbox(file) : undefined}
                        >
                          {file.fileName}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                        <span>{formatBytes(file.fileSize)}</span>
                        <span>·</span>
                        <span>{dateStr}</span>
                        <span>·</span>
                        <span className="uppercase font-bold text-[10px]">{file.mimeType.split("/")[1]?.slice(0, 8) || "FILE"}</span>
                        {isPreviewable && (
                          <span className="text-blue-500 font-medium">· Click to preview</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {(allowDownload || isOwner) ? (
                        <Button variant="outline" size="sm" onClick={() => handleDownload(file)}
                          disabled={downloadingId === file.id}
                          className="h-8 text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                          {downloadingId === file.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Download
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">View only</span>
                      )}
                      {isOwner && !isEditing && (
                        <>
                          <button onClick={() => { setEditingFileId(file.id); setEditingName(file.fileName); }}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Rename">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(file.id)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
