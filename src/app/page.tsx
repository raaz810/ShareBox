import Link from "next/link";
import { 
  ShieldCheck, 
  Clock, 
  Lock, 
  Layers, 
  UploadCloud,
  FileCheck2,
  Share2,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderAccessForm } from "@/components/folder/folder-access-form";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center">
      {/* Hero Section */}
      <section className="relative w-full overflow-hidden border-b border-slate-200/60 bg-gradient-to-b from-white via-blue-50/20 to-slate-50 dark:from-slate-950 dark:via-slate-900/40 dark:to-slate-950 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-300 mb-6 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
            ShareBox Architecture — Foundation & Database Ready
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl dark:text-white max-w-4xl mx-auto leading-tight">
            Effortless File Sharing with{" "}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 bg-clip-text text-transparent">
              Temporary Folders & QR Codes
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Create a folder, drop your files, and instantly share via a 6-character code, short URL, or dynamic QR code. Built with auto-expiration, end-to-end security, and guest support.
          </p>

          {/* Quick Access Card */}
          <div className="mt-10 mx-auto max-w-xl">
            <Card className="p-3 shadow-lg border-blue-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
              <FolderAccessForm />
            </Card>
          </div>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/create">
              <Button size="lg" className="gap-2 shadow-md">
                <UploadCloud className="h-5 w-5" />
                Create New Folder
              </Button>
            </Link>
            <Link href="/folders">
              <Button variant="outline" size="lg" className="gap-2">
                <Layers className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                Browse Folders
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Core Architectural Highlights */}
      <section className="w-full py-16 sm:py-24 bg-white dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Engineered for Frictionless & Protected Transfers
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400">
              Designed from the database up to support guest uploads, tokenized folder management, and reliable automated cleanups.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1 */}
            <Card className="hover:shadow-card transition-shadow">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/80 dark:text-blue-400 mb-2">
                  <Share2 className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg">Folder Code & QR Sharing</CardTitle>
                <CardDescription>
                  Share multiple files at once under a unique 6-character code, short link, or mobile-friendly QR code.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 space-y-1">
                <span className="font-mono text-blue-600 dark:text-blue-400">Folder.folderCode</span> unique index ensures instant lookup.
              </CardContent>
            </Card>

            {/* Card 2 */}
            <Card className="hover:shadow-card transition-shadow">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 mb-2">
                  <Clock className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg">Automated Lifecycle & Expiry</CardTitle>
                <CardDescription>
                  Folders automatically expire and clean up files based on configurable TTLs (1 hour to 30 days).
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 space-y-1">
                <span className="font-mono text-indigo-600 dark:text-indigo-400">Folder.expiresAt</span> index drives the automated cleanup engine.
              </CardContent>
            </Card>

            {/* Card 3 */}
            <Card className="hover:shadow-card transition-shadow">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400 mb-2">
                  <Lock className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg">Password & Access Controls</CardTitle>
                <CardDescription>
                  Protect sensitive folders with argon2/bcrypt password hashing, disable downloads, or set permission scopes.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 space-y-1">
                Supports <span className="font-mono text-emerald-600 dark:text-emerald-400">FolderPermission</span> and guest token validation.
              </CardContent>
            </Card>

            {/* Card 4 */}
            <Card className="hover:shadow-card transition-shadow">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 mb-2">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg">Guest & User Flexibility</CardTitle>
                <CardDescription>
                  Anonymous guests can upload and manage folders via secure cryptographic ownership tokens without forced registration.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 space-y-1">
                <span className="font-mono text-amber-600 dark:text-amber-400">Folder.ownershipTokenHash</span> secures guest ownership.
              </CardContent>
            </Card>

            {/* Card 5 */}
            <Card className="hover:shadow-card transition-shadow">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950/80 dark:text-purple-400 mb-2">
                  <Database className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg">Production PostgreSQL ORM</CardTitle>
                <CardDescription>
                  Full relational schema containing 9 dedicated models covering folders, sessions, settings, jobs, and audits.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 space-y-1">
                Typed models with BigInt sizes, UUID internal keys, and cascades.
              </CardContent>
            </Card>

            {/* Card 6 */}
            <Card className="hover:shadow-card transition-shadow">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 mb-2">
                  <FileCheck2 className="h-6 w-6" />
                </div>
                <CardTitle className="text-lg">Resilient Upload Sessions</CardTitle>
                <CardDescription>
                  Direct chunking and multi-part upload sessions track progress and verify file integrity with SHA-256 checksums.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 space-y-1">
                <span className="font-mono text-rose-600 dark:text-rose-400">UploadSession</span> handles staged multi-file payloads.
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
