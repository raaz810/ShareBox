"use client";

import * as React from "react";
import Link from "next/link";
import { 
  FolderSync, 
  ArrowLeft, 
  Mail, 
  KeyRound, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ExternalLink 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setDevResetUrl(null);

    if (!email.trim()) {
      setErrorMessage("Please enter the email address associated with your account.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || "Unable to process password reset request.");
        return;
      }

      setSuccessMessage(data.message);
      if (data.debug?.resetUrl) {
        setDevResetUrl(data.debug.resetUrl);
      }
    } catch {
      setErrorMessage("Network error connecting to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-14rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <FolderSync className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Share<span className="text-blue-600 dark:text-blue-400">Box</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Reset Password
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            We will send you a secure one-time link to create a new password
          </p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recovery Request</CardTitle>
            <CardDescription>
              Enter your email address to receive password reset instructions
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {errorMessage && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Instructions Dispatched</span>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed">
                    {successMessage}
                  </p>
                </div>
              )}

              {/* Dev Test Link Helper */}
              {devResetUrl && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400">
                    <KeyRound className="h-4 w-4" />
                    <span>Local Development Test Link:</span>
                  </div>
                  <p className="text-[11px] text-blue-600 dark:text-blue-300">
                    Since SMTP is simulated in local development, you can open your reset link directly:
                  </p>
                  <Link
                    href={devResetUrl}
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-700 underline hover:text-blue-800 dark:text-blue-300 break-all"
                  >
                    Open Password Reset Page
                    <ExternalLink className="h-3 w-3 inline" />
                  </Link>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
              <Button type="submit" disabled={loading} className="w-full gap-2 shadow-sm">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Dispatching Link...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Sign In
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
