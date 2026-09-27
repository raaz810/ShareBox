"use client";

import * as React from "react";
import QRCode from "qrcode";
import { QrCode, Download, RefreshCw, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderCode: string;
  shareUrl: string;
  folderName: string;
}

export function QrModal({ isOpen, onClose, folderCode, shareUrl, folderName }: QrModalProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Generate QR Code from clean folder share URL (NEVER encodes ownership token) (Requirement 10)
  const generateQr = React.useCallback(async () => {
    setIsGenerating(true);
    try {
      // 1. Generate high-res Data URL for direct download
      const url = await QRCode.toDataURL(shareUrl, {
        width: 600,
        margin: 2,
        errorCorrectionLevel: "H",
        color: {
          dark: "#0f172a", // Slate-900
          light: "#ffffff",
        },
      });
      setDataUrl(url);

      // 2. Render to canvas in DOM
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, shareUrl, {
          width: 260,
          margin: 1,
          errorCorrectionLevel: "H",
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });
      }
    } catch (err) {
      console.error("QR Code generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [shareUrl]);

  React.useEffect(() => {
    if (isOpen) {
      generateQr();
    }
  }, [isOpen, generateQr]);

  if (!isOpen) return null;

  // Download QR Code as PNG (Requirement 10)
  const handleDownloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `ShareBox-${folderCode}-QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mb-3 shadow-sm">
          <QrCode className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">
          Scan to Access Folder
        </h3>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
          {folderName}
        </p>

        {/* QR Code Container */}
        <div className="my-5 flex flex-col items-center justify-center">
          <div className="rounded-2xl border-4 border-slate-100 bg-white p-3 shadow-inner dark:border-slate-800">
            <canvas ref={canvasRef} className="rounded-lg shadow-sm" />
          </div>

          <div className="mt-3 flex items-center gap-1.5 font-mono text-xs font-bold tracking-widest text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-full border border-blue-200/60 dark:border-blue-900/60">
            <span>CODE:</span>
            <span>{folderCode}</span>
          </div>

          <p className="mt-2 text-[11px] text-slate-400 max-w-[240px] truncate">
            {shareUrl}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <Button
            onClick={handleDownloadPng}
            disabled={!dataUrl || isGenerating}
            className="w-full gap-2 shadow-sm"
          >
            <Download className="h-4 w-4" />
            Download QR as PNG
          </Button>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="flex-1 gap-1.5 text-xs h-9"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Link
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={generateQr}
              disabled={isGenerating}
              className="h-9 px-3 text-xs gap-1"
              title="Regenerate QR Code"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
