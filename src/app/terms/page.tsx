import Link from "next/link";
import { AlertTriangle, CheckCircle, Scale, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">Legal Agreement</Badge>
          <span className="text-xs text-slate-400">Effective: September 2026</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Please read these terms carefully before utilizing the ShareBox platform.
        </p>
      </div>

      <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              1. Acceptance of Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              By accessing ShareBox, creating a folder, generating a QR code, or downloading any file payload, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, you must discontinue platform use immediately.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              2. Prohibited Content & Abuse
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              ShareBox must not be used to transmit or host malicious software, pirated media, illicit content, or materials violating intellectual property or copyright laws. We reserve the right to terminate upload sessions and purge folders found in violation of our integrity policies.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-indigo-600" />
              3. Ephemeral Nature & No Permanent Archiving
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>
              ShareBox is designed as a temporary file sharing and transit solution, NOT a permanent cloud backup service. Once the folder expiration timer finishes, files are irrevocably purged. ShareBox is not liable for data lost due to scheduled expiration.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to ShareBox
        </Link>
        <span>Legal inquiries: legal@sharebox.internal</span>
      </div>
    </div>
  );
}
