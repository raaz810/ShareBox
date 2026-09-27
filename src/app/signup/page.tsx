"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  FolderSync, 
  ArrowRight, 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle,
  CheckCircle2, 
  Loader2, 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { AppLoader } from "@/components/ui/loader";
import { evaluatePasswordStrength, PasswordStrengthResult } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [termsAccepted, setTermsAccepted] = React.useState(false);

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [errorDetails, setErrorDetails] = React.useState<string[]>([]);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Live password strength calculation
  const strength: PasswordStrengthResult = React.useMemo(() => {
    return evaluatePasswordStrength(password);
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorDetails([]);
    setSuccessMessage(null);

    // Client-side quick validations
    if (!name.trim()) {
      setErrorMessage("Please enter your full name");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Please enter your email address");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter.");
      return;
    }

    if (!strength.isValid) {
      setErrorMessage("Password does not meet the complexity requirements.");
      setErrorDetails(strength.errors);
      return;
    }

    if (!termsAccepted) {
      setErrorMessage("You must accept the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
          termsAccepted,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || "Failed to create account. Please try again.");
        if (Array.isArray(data.errors)) {
          setErrorDetails(data.errors);
        }
        return;
      }

      setSuccessMessage("Account created successfully! Redirecting to your dashboard...");
      await refreshUser();
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1000);
    } catch {
      setErrorMessage("Network connection error. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const strengthColor = () => {
    switch (strength.score) {
      case 0:
      case 1:
        return "bg-rose-500";
      case 2:
        return "bg-amber-500";
      case 3:
        return "bg-blue-500";
      case 4:
        return "bg-emerald-500";
      default:
        return "bg-slate-200";
    }
  };

  if (successMessage) {
    return (
      <AppLoader 
        title="Account Created Successfully" 
        subtitle="Setting up your secure workspace and redirecting..." 
      />
    );
  }

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
            Create Your Account
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Sign up to manage persistent folders and access transfer history
          </p>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Registration</CardTitle>
            <CardDescription>
              All fields are required to secure your ShareBox account
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {/* Alert: Error Message */}
              {errorMessage && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{errorMessage}</span>
                  </div>
                  {errorDetails.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 space-y-0.5 text-rose-700 dark:text-rose-400">
                      {errorDetails.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Alert: Success Message */}
              {successMessage && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="alex@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password.length > 0 && (
                  <div className="pt-1 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Strength:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {strength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                      <div
                        className={`h-full transition-all duration-300 ${strengthColor()}`}
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Terms Checkbox */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    disabled={loading}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    I agree to the{" "}
                    <Link href="/terms" className="text-blue-600 hover:underline dark:text-blue-400">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="text-blue-600 hover:underline dark:text-blue-400">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 border-t border-slate-100 dark:border-slate-800/80 pt-6">
              <Button type="submit" disabled={loading} className="w-full gap-2 shadow-sm">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-slate-500">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
