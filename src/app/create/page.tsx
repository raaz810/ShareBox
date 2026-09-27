"use client";

import * as React from "react";
import Link from "next/link";
import {
  FolderPlus,
  Clock,
  Lock,
  Download,
  Eye,
  EyeOff,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Globe,
  KeyRound,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { FolderQrCard } from "@/components/folder/qr-card";

interface CreatedFolderResponse {
  id: string;
  folderCode: string;
  folderName: string;
  description: string | null;
  visibility: "PUBLIC" | "PASSWORD_PROTECTED" | "PRIVATE";
  allowDownload: boolean;
  hasPassword: boolean;
  createdAt: string;
  expiresAt: string;
  shareUrl: string;
  isRegistered: boolean;
}

export default function CreateFolderPage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // Form State
  const [folderName, setFolderName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<"PUBLIC" | "PASSWORD_PROTECTED" | "PRIVATE">("PUBLIC");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [allowDownload, setAllowDownload] = React.useState(true);

  // UI State
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [createdData, setCreatedData] = React.useState<{
    folder: CreatedFolderResponse;
    ownershipToken?: string;
  } | null>(null);

  // Clipboard copy state for success screen
  const [copiedCode, setCopiedCode] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!folderName.trim()) {
      setErrorMsg("Please enter a folder name.");
      return;
    }

    if (visibility === "PASSWORD_PROTECTED" && (!password || password.length < 4)) {
      setErrorMsg("Password-protected folders require a password of at least 4 characters.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderName: folderName.trim(),
          description: description.trim() || undefined,
          visibility,
          password: password.trim() || undefined,
          allowDownload,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create folder");
      }

      // If guest folder, store ownership token in client storage
      if (data.ownershipToken && data.folder?.folderCode) {
        try {
          localStorage.setItem(`sharebox_ownership_${data.folder.folderCode}`, data.ownershipToken);
          // Also set cookie so standard requests carry ownership authorization
          document.cookie = `sharebox_owner_${data.folder.folderCode}=${data.ownershipToken}; path=/; max-age=86400; SameSite=Lax`;
        } catch (storageErr) {
          console.warn("Could not save ownership token to localStorage:", storageErr);
        }
      }

      setCreatedData({
        folder: data.folder,
        ownershipToken: data.ownershipToken,
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = () => {
    if (!createdData) return;
    navigator.clipboard.writeText(createdData.folder.folderCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyUrl = () => {
    if (!createdData) return;
    navigator.clipboard.writeText(createdData.folder.shareUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // SUCCESS SCREEN: Shows folder name, folder code, share URL, expiration, copy link, and QR placeholder
  if (createdData) {
    const { folder, ownershipToken } = createdData;
    const expiresFormatted = new Date(folder.expiresAt).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCreatedData(null);
              setFolderName("");
              setDescription("");
              setPassword("");
            }}
          >
            Create Another Folder
          </Button>
        </div>

        <div className="space-y-6">
          {/* Header */}
          <div className="rounded-3xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-blue-50/60 p-6 dark:border-emerald-900/60 dark:bg-emerald-950/20 sm:p-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                Folder Active
              </Badge>
              {folder.isRegistered ? (
                <Badge variant="outline" className="border-blue-300 text-blue-700 dark:text-blue-300">
                  Registered Account (15 Days)
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
                  Guest Folder (24 Hours)
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {folder.folderName}
            </h1>
            {folder.description && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                {folder.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Info Card */}
            <div className="md:col-span-2 space-y-4">
              {/* Folder Code Banner */}
              <Card className="shadow-sm border-blue-200 dark:border-blue-900/60 bg-white dark:bg-slate-900">
                <CardHeader className="pb-3">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Unique Folder Code
                  </CardDescription>
                  <div className="mt-1 flex items-center justify-between gap-4">
                    <span className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-blue-600 dark:text-blue-400">
                      {folder.folderCode}
                    </span>
                    <Button onClick={copyCode} variant="outline" size="sm" className="gap-1.5 font-sans">
                      {copiedCode ? (
                        <>
                          <Check className="h-4 w-4 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy Code
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Share URL Card */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Share Link
                  </CardDescription>
                  <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs sm:text-sm text-slate-800 break-all dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                      {folder.shareUrl}
                    </div>
                    <Button onClick={copyUrl} className="gap-1.5 shrink-0">
                      {copiedUrl ? (
                        <>
                          <Check className="h-4 w-4 text-white" />
                          Copied Link
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy Link
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Expiration and Privacy Details */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Auto-Expiration
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                        {expiresFormatted}
                      </p>
                      <p className="text-xs text-slate-500">
                        {folder.isRegistered ? "15-day lifecycle" : "24-hour guest window"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Access Control
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                        {folder.hasPassword
                          ? "Password Protected"
                          : folder.visibility === "PRIVATE"
                          ? "Private Folder"
                          : "Public Access"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {folder.allowDownload ? "Downloads enabled" : "View-only mode"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Guest ownership notification */}
              {ownershipToken && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                  <div className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                    <KeyRound className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-bold">Guest Ownership Token Saved to Browser</p>
                      <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                        We have securely saved your ownership authorization token on this device. You can edit or delete this folder anytime. You can also sign in to claim this folder and extend its duration to 15 days.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action: Open Folder */}
              <div className="pt-2">
                <Link href={`/${folder.folderCode}`}>
                  <Button size="lg" className="w-full gap-2 shadow-md">
                    Open Folder Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* QR Card Column */}
            <div>
              <FolderQrCard
                folderCode={folder.folderCode}
                shareUrl={folder.shareUrl}
                folderName={folder.folderName}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CREATION FORM SCREEN
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
      </div>

      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Create New ShareBox Folder
            </h1>
            <Badge variant="outline" className="text-xs">
              Part 3 System
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Set up your shared folder parameters, privacy flags, and generate a unique code and QR.
          </p>
        </div>

        {/* Dynamic Context Banner: Guest vs Authenticated User */}
        {isAuthenticated && user ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="text-xs">
                <p className="font-semibold text-blue-900 dark:text-blue-100">
                  Signed in as {user.name || user.email}
                </p>
                <p className="text-blue-700 dark:text-blue-300">
                  Folders created will be saved to your account and automatically expire after <span className="font-bold">15 Days</span>.
                </p>
              </div>
            </div>
            <Badge className="bg-blue-600 hover:bg-blue-600 text-white shrink-0">
              15-Day Storage
            </Badge>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className="rounded-xl bg-slate-200 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Clock className="h-5 w-5" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Creating as Guest (24-Hour Expiration)
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  Guest folders expire in 24 hours. A secure ownership token will be issued for management.
                </p>
              </div>
            </div>
            <Link href="/login?callbackUrl=/create" className="shrink-0">
              <Button variant="outline" size="sm" className="text-xs gap-1">
                Sign In for 15 Days
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}

        {/* Create Folder Card */}
        <Card className="shadow-sm">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-blue-600" />
                Folder Configuration
              </CardTitle>
              <CardDescription>
                Every folder receives a cryptographically secure 8-character code, short link, and QR code.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Error banner */}
              {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Folder Name */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Folder Name <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-xs text-slate-400">{folderName.length}/100</span>
                </div>
                <Input
                  placeholder="e.g. Project Assets, Marketing Collateral, Meeting Notes"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value.slice(0, 100))}
                  required
                  disabled={submitting}
                  className="h-11 text-base sm:text-sm"
                />
              </div>

              {/* Folder Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Description <span className="text-xs text-slate-400">(Optional)</span>
                  </label>
                  <span className="text-xs text-slate-400">{description.length}/1000</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Add notes, context, or instructions for recipients..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
                  disabled={submitting}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>

              {/* Visibility Options */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Folder Visibility & Access
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Public Option */}
                  <div
                    onClick={() => {
                      setVisibility("PUBLIC");
                      setPassword("");
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      visibility === "PUBLIC"
                        ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-600"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Globe className={`h-4 w-4 ${visibility === "PUBLIC" ? "text-blue-600" : "text-slate-400"}`} />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Public</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Anyone with the 8-character code or share link can access files.
                    </p>
                  </div>

                  {/* Password Protected Option */}
                  <div
                    onClick={() => setVisibility("PASSWORD_PROTECTED")}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      visibility === "PASSWORD_PROTECTED"
                        ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-600"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Lock className={`h-4 w-4 ${visibility === "PASSWORD_PROTECTED" ? "text-blue-600" : "text-slate-400"}`} />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Password</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Recipients must enter a password to view and download files.
                    </p>
                  </div>

                  {/* Private Option */}
                  <div
                    onClick={() => {
                      setVisibility("PRIVATE");
                      setPassword("");
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      visibility === "PRIVATE"
                        ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40 ring-1 ring-blue-600"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Shield className={`h-4 w-4 ${visibility === "PRIVATE" ? "text-blue-600" : "text-slate-400"}`} />
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Private</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Restricted strictly to the folder creator only.
                    </p>
                  </div>
                </div>
              </div>

              {/* Password Input (if Password Protected) */}
              {visibility === "PASSWORD_PROTECTED" && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900/60 dark:bg-blue-950/30 space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-blue-600" />
                    Set Folder Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimum 4 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      className="pr-10 bg-white dark:bg-slate-900"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Recipients will be prompted to enter this password before any files are displayed.
                  </p>
                </div>
              )}

              {/* Allow Download & Expiration Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Download Controls */}
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      <Download className="h-4 w-4 text-blue-600" />
                      Allow File Downloads
                    </div>
                    <input
                      type="checkbox"
                      id="allowDownload"
                      checked={allowDownload}
                      onChange={(e) => setAllowDownload(e.target.checked)}
                      disabled={submitting}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    When enabled, recipients can download individual files or bulk ZIP bundles.
                  </p>
                </div>

                {/* Expiration Notice */}
                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                    <Clock className="h-4 w-4 text-blue-600" />
                    Expiration Lifespan
                  </div>
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {isAuthenticated ? "15 Days (Registered Account)" : "24 Hours (Guest User)"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Folders are automatically purged after expiration to safeguard data privacy.
                  </p>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
              <p className="text-xs text-slate-500">
                Unique 8-character folder code is generated with cryptographic entropy.
              </p>
              <Button
                type="submit"
                disabled={submitting || authLoading}
                size="lg"
                className="w-full sm:w-auto gap-2 shadow-md"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Folder...
                  </>
                ) : (
                  <>
                    <FolderPlus className="h-4 w-4" />
                    Create Folder
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
