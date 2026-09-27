"use client";

import * as React from "react";
import { FolderSync } from "lucide-react";

interface AppLoaderProps {
  title?: string;
  subtitle?: string;
  variant?: "page" | "fullscreen" | "inline";
  className?: string;
}

export function AppLoader({
  title = "Loading...",
  subtitle = "Please wait a moment",
  variant = "page",
  className = "",
}: AppLoaderProps) {
  const containerClasses = {
    page: "flex min-h-[calc(100vh-14rem)] w-full items-center justify-center p-4",
    fullscreen: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4",
    inline: "flex w-full items-center justify-center py-12 px-4",
  }[variant];

  return (
    <div className={`${containerClasses} ${className} animate-in fade-in duration-300`}>
      <div className="relative flex flex-col items-center">
        {/* Ambient atmospheric glow */}
        <div className="absolute -inset-8 bg-gradient-to-tr from-blue-600/20 via-indigo-500/20 to-cyan-400/20 rounded-full blur-2xl pointer-events-none animate-pulse" />

        {/* Center Card with Glassmorphism */}
        <div className="relative flex flex-col items-center rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 p-8 sm:p-10 shadow-xl backdrop-blur-xl max-w-sm w-full text-center transition-all">
          
          {/* Animated Spinner Icon Graphic */}
          <div className="relative flex items-center justify-center mb-6">
            {/* Outer rotating dashed gradient ring */}
            <div className="absolute h-20 w-20 rounded-full border-2 border-dashed border-blue-500/40 dark:border-blue-400/40 animate-[spin_10s_linear_infinite]" />
            
            {/* Inner fast smooth gradient ring */}
            <div className="h-16 w-16 rounded-full border-2 border-transparent border-t-blue-600 border-r-indigo-500 border-b-cyan-400 animate-spin" />

            {/* Glowing Brand Icon in Center */}
            <div className="absolute flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
              <FolderSync className="h-5 w-5 animate-pulse text-white" />
            </div>

            {/* Orbiting particle */}
            <div className="absolute h-20 w-20 animate-[spin_3s_linear_infinite]">
              <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] -top-1 left-1/2 -translate-x-1/2" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h3>

          {/* Subtitle */}
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium max-w-[260px]">
            {subtitle}
          </p>

          {/* Sleek Gradient Laser Shimmer Bar */}
          <div className="mt-6 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80 p-0.5">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full">
              <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 animate-[shimmer_1.8s_ease-in-out_infinite]" />
            </div>
          </div>

          {/* Subtle animated dots */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}
export default AppLoader;
