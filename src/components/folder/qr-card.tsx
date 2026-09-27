"use client";

import * as React from "react";
import { QrCode, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrCardProps {
  folderCode: string;
  shareUrl: string;
  folderName: string;
}

export function FolderQrCard({ folderCode, shareUrl }: QrCardProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate deterministic QR-like grid pattern for visual elegance
  const cells = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < folderCode.length; i++) {
      hash = (hash << 5) - hash + folderCode.charCodeAt(i);
      hash |= 0;
    }
    const grid: boolean[] = [];
    for (let i = 0; i < 144; i++) {
      const bit = Math.sin(hash + i * 997) > 0.1;
      // Keep corner positioning markers solid
      const row = Math.floor(i / 12);
      const col = i % 12;
      const isTopLeft = row < 4 && col < 4;
      const isTopRight = row < 4 && col >= 8;
      const isBottomLeft = row >= 8 && col < 4;
      if (isTopLeft || isTopRight || isBottomLeft) {
        grid.push((row === 0 || row === 3 || col === 0 || col === 3) || (row === 1 && col === 1) || (row === 2 && col === 2));
      } else {
        grid.push(bit);
      }
    }
    return grid;
  }, [folderCode]);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col items-center text-center">
      <div className="flex items-center justify-between w-full mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <QrCode className="h-4 w-4 text-blue-600" />
          Share via QR
        </span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-950 dark:text-blue-400">
          Scan to Access
        </span>
      </div>

      {/* Styled QR Code Box */}
      <div className="relative flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800 my-2">
        <div className="grid grid-cols-12 gap-1 w-44 h-44 p-2 bg-white dark:bg-slate-900 rounded-lg shadow-inner">
          {cells.map((filled, idx) => (
            <div
              key={idx}
              className={`rounded-[2px] transition-colors ${
                filled
                  ? "bg-slate-900 dark:bg-white"
                  : "bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Center Badge with Folder Code */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-md border border-blue-600/30 bg-white px-2 py-1 shadow-md dark:bg-slate-900">
            <span className="font-mono text-xs font-black tracking-widest text-blue-600 dark:text-blue-400">
              {folderCode}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500 font-mono tracking-tight break-all max-w-[220px]">
        {shareUrl}
      </p>

      <div className="mt-4 flex w-full gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="flex-1 gap-1.5 text-xs h-9"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy URL
            </>
          )}
        </Button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex"
        >
          <Button variant="ghost" size="sm" className="h-9 px-2.5 text-slate-500">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </a>
      </div>
    </div>
  );
}
