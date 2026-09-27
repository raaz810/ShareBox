"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  ShieldCheck,
  HardDrive,
  KeyRound,
  LogOut,
  Loader2,
  FolderIcon,
  Files,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileData {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: "USER" | "ADMIN";
    isActive: boolean;
    createdAt: string;
  };
  stats: {
    totalFolders: number;
    totalFiles: number;
    totalStorageBytes: string;
    quotaBytes: string;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | string | bigint): string {
  const b = Number(bytes);
  if (isNaN(b) || b <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, logout, refreshUser } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = React.useState(true);
  const [profileData, setProfileData] = React.useState<ProfileData | null>(null);

  // Name editing
  const [displayName, setDisplayName] = React.useState("");
  const [isSavingName, setIsSavingName] = React.useState(false);

  // Password editing
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = React.useState(false);

  // Auth redirection
  React.useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login?callbackUrl=/profile");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load profile data from API
  const loadProfile = React.useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch("/api/user/profile");
      if (res.status === 401) {
        router.push("/login?callbackUrl=/profile");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setProfileData(data);
        setDisplayName(data.user.name || "");
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
      toast.error("Could not load account profile");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, router, toast]);

  React.useEffect(() => {
    if (isAuthenticated) {
      loadProfile();
    }
  }, [isAuthenticated, loadProfile]);

  // Handle name update
  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingName(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile name");

      toast.success("Name updated successfully!");
      await refreshUser();
      loadProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error updating name");
    } finally {
      setIsSavingName(false);
    }
  };

  // Handle password update
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");

      setPasswordSuccess("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed!");
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Error changing password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (authLoading || (loading && !profileData)) {
    return (
      <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthenticated || !profileData) return null;

  const getInitials = (name?: string | null, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "SB";
  };

  const memberSinceStr = new Date(profileData.user.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const storageUsed = Number(profileData.stats.totalStorageBytes || 0);
  const quota = Number(profileData.stats.quotaBytes || 25 * 1024 * 1024 * 1024);
  const quotaPercent = Math.min(100, Math.max(0, Math.round((storageUsed / quota) * 100)));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-300">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Account Profile
            </h1>
            <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {profileData.user.role === "ADMIN" ? "Admin" : "Verified User"}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            View your verified credentials, manage your storage quota, and update account settings.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={logout}
          className="gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50 self-start sm:self-auto"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ── Left Column: User Summary Card ── */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="text-center pb-3">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-2xl font-black shadow-md mb-3">
                {getInitials(profileData.user.name, profileData.user.email)}
              </div>
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-white">
                {profileData.user.name || "ShareBox User"}
              </CardTitle>
              <CardDescription className="truncate max-w-full text-xs font-mono">
                {profileData.user.email}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-slate-500 space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span>Account Status</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Member Since</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {memberSinceStr}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Account Type</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase">
                  {profileData.user.role} (15-Day Folders)
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats Summary Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Resource Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <FolderIcon className="h-3.5 w-3.5 text-blue-500" /> Total Folders
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {profileData.stats.totalFolders}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Files className="h-3.5 w-3.5 text-purple-500" /> Total Files
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {profileData.stats.totalFiles}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <HardDrive className="h-3.5 w-3.5 text-indigo-500" /> Storage Used
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatBytes(profileData.stats.totalStorageBytes)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column: Account Settings & Forms ── */}
        <div className="md:col-span-2 space-y-6">
          {/* Storage Quota Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-indigo-600" />
                  Ephemeral Storage Allocation
                </CardTitle>
                <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                  {formatBytes(profileData.stats.totalStorageBytes)} / {formatBytes(profileData.stats.quotaBytes)}
                </span>
              </div>
              <CardDescription className="text-xs">
                Object storage footprint calculated in real-time from active and archived files.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(1, quotaPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{quotaPercent}% consumed</span>
                <span>{formatBytes(Math.max(0, quota - storageUsed))} remaining</span>
              </div>
            </CardContent>
          </Card>

          {/* Personal Information & Name Form */}
          <Card className="shadow-sm">
            <form onSubmit={handleSaveName}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-blue-600" />
                  Personal Information
                </CardTitle>
                <CardDescription className="text-xs">
                  Update your public display name shown to recipients of shared folders.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Display Name
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={60}
                    disabled={isSavingName}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Email Address
                  </label>
                  <Input
                    value={profileData.user.email}
                    disabled
                    className="h-10 bg-slate-50 dark:bg-slate-900 cursor-not-allowed text-slate-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Email address is verified and permanently linked to your session.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-4">
                <Button type="submit" size="sm" disabled={isSavingName} className="gap-1.5">
                  {isSavingName ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" /> Save Changes
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* Password Security Form */}
          <Card className="shadow-sm">
            <form onSubmit={handleSavePassword}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-emerald-600" />
                  Change Password
                </CardTitle>
                <CardDescription className="text-xs">
                  Update your password to keep your shared folders and ownership tokens secure.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {passwordError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/50 p-3 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{passwordError}</span>
                  </div>
                )}
                {passwordSuccess && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/50 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Current Password
                  </label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    disabled={isSavingPassword}
                    className="h-10"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      New Password
                    </label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      minLength={8}
                      disabled={isSavingPassword}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Confirm New Password
                    </label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      required
                      minLength={8}
                      disabled={isSavingPassword}
                      className="h-10"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800 pt-4">
                <Link
                  href="/forgot-password"
                  className="text-xs text-slate-500 hover:text-blue-600 transition-colors"
                >
                  Forgot your password?
                </Link>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingPassword || !currentPassword || !newPassword}
                  className="gap-1.5"
                >
                  {isSavingPassword ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating...
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" /> Update Password
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
