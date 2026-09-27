import * as React from "react";
import Link from "next/link";
import { FolderSync, Shield, Lock } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand & Mission */}
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <FolderSync className="h-4 w-4" />
              </div>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Share<span className="text-blue-600 dark:text-blue-400">Box</span>
              </span>
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Frictionless and secure multi-file sharing platform. Share files via unique folder codes, direct URLs, or dynamic QR codes with automated auto-expiry and granular access controls.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              All systems operational
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-200">
              Product
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/create" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Create Folder
                </Link>
              </li>
              <li>
                <Link href="/folders" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Explore Folders
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  User Dashboard
                </Link>
              </li>
              <li>
                <Link href="/profile" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Account Profile
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Trust */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-200">
              Legal & Trust
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/privacy" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Contact Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Governance & Admin */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-200">
              Platform
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/admin" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Admin Console
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Member Login
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Register Account
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-slate-200/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-500">
          <p>© {new Date().getFullYear()} ShareBox Inc. All rights reserved. Secure, end-to-end multi-file transfer.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-blue-600" />
              256-Bit Encrypted
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Lock className="h-3.5 w-3.5 text-blue-600" />
              Auto-Expiry Enforced
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
