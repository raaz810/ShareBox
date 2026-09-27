import Link from "next/link";
import { Shield, Clock, Lock, Trash2, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">Privacy & Data Governance</Badge>
          <span className="text-xs text-slate-400">Effective: September 2026</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          ShareBox Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          We believe in privacy by design, minimal data collection, and guaranteed automated deletion.
        </p>
      </div>

      <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              1. Ephemeral Data & Guaranteed Auto-Expiration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              ShareBox operates on an auto-expiry model. When a folder is created—whether by a registered member or an anonymous guest—an absolute expiration date (<code className="font-mono text-xs">expiresAt</code>) is stamped onto the record.
            </p>
            <p>
              Once that timestamp elapses, automated background cleanup workers (<code className="font-mono text-xs">CleanupJob</code>) purge both the metadata references from PostgreSQL and all associated object storage assets from our cloud buckets. No retention windows or shadow backups are kept after cleanup execution.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-600" />
              2. Encryption at Rest and in Transit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              All file transfers occur over strict Transport Layer Security (TLS 1.3). Files stored on object storage clusters are encrypted at rest using AES-256 server-side encryption. Folder passwords are never stored in plaintext; they are hashed using salted cryptographic algorithms.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              3. Guest & Anonymous Uploads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              Guest users are not required to provide personal identification, email addresses, or phone numbers to upload or receive files. A cryptographically random ownership token (<code className="font-mono text-xs">ownershipTokenHash</code>) is issued locally to allow the creator to delete their folder early without an account.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              4. Immediate Deletion Rights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              Folder owners can issue an immediate hard delete at any point before the expiration timer runs out. Upon deletion, storage keys are purged from the storage backend immediately.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to ShareBox
        </Link>
        <span>Questions? Contact privacy@sharebox.internal</span>
      </div>
    </div>
  );
}
