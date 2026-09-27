"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  FolderSync, 
  PlusCircle, 
  FolderSearch, 
  LayoutDashboard, 
  Menu, 
  X, 
  Search, 
  ArrowRight,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/create", label: "Create Folder", icon: PlusCircle },
  { href: "/folders", label: "My Folders", icon: FolderSearch },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = React.useState(false);
  const [quickCode, setQuickCode] = React.useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleQuickLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickCode.trim()) {
      window.location.href = `/folders?code=${encodeURIComponent(quickCode.trim().toUpperCase())}`;
    }
  };

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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
              <FolderSync className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Share<span className="text-blue-600 dark:text-blue-400">Box</span>
              </span>
              <span className="text-[10px] -mt-1 font-medium tracking-widest uppercase text-slate-400 dark:text-slate-500">
                Secure Sharing
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Quick Folder Code Lookup + Actions */}
        <div className="hidden lg:flex items-center gap-3">
          <form onSubmit={handleQuickLookup} className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Enter folder code..."
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value)}
              className="h-9 w-44 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-mono tracking-wider uppercase placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:focus:bg-slate-950 dark:focus:border-blue-500"
            />
          </form>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

          <ThemeToggle />

          {/* Auth State: Loading */}
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="h-9 w-16 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
              <div className="h-9 w-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            </div>
          ) : user ? (
            /* Logged In State: User Menu Dropdown */
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 py-1.5 pl-2 pr-3 text-left transition-all hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-800"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold text-white shadow-xs">
                  {getInitials(user.name, user.email)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white max-w-[110px] truncate leading-none">
                    {user.name || user.email.split("@")[0]}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-none">
                    {user.role}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-950 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {user.name || "ShareBox User"}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {user.email}
                    </p>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/dashboard"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <LayoutDashboard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Dashboard
                    </Link>
                    <Link
                      href="/profile"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <UserIcon className="h-4 w-4 text-slate-500" />
                      Account Profile
                    </Link>
                    {user.role === "ADMIN" && (
                      <Link
                        href="/admin"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Admin Console
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-800/80 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Logged Out State: Sign In + Sign Up */
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="gap-1.5 shadow-sm">
                  Get Started
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu trigger */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">
          <form onSubmit={handleQuickLookup} className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Enter folder code (e.g. SB-8492)..."
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
          </form>

          {/* User Status in Mobile */}
          {user && (
            <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold text-white">
                  {getInitials(user.name, user.email)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {user.name || user.email}
                  </span>
                  <span className="text-[10px] text-slate-500">{user.role}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="text-rose-600 dark:text-rose-400 text-xs gap-1"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </div>
          )}

          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {item.label}
                </Link>
              );
            })}

            {user && (
              <Link
                href="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                <UserIcon className="h-4 w-4 text-slate-500" />
                Account Profile
              </Link>
            )}

            {!user && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-900 flex flex-col gap-2">
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" className="w-full justify-center">
                    Sign In
                  </Button>
                </Link>
                <Link href="/signup" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full justify-center">
                    Create Account
                  </Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
