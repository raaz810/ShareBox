"use client";

import * as React from "react";
import {
  Share2,
  Copy,
  Check,
  QrCode,
  Mail,
  MessageCircle,
  X,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderCode: string;
  shareUrl: string;
  folderName: string;
  onOpenQr: () => void;
}

export function ShareModal({
  isOpen,
  onClose,
  folderCode,
  shareUrl,
  folderName,
  onOpenQr,
}: ShareModalProps) {
  const [copied, setCopied] = React.useState(false);
  const [hasWebShare, setHasWebShare] = React.useState(false);

  React.useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setHasWebShare(true);
    }
  }, []);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Web Share API (Requirement 11)
  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `ShareBox: ${folderName}`,
          text: `Access shared folder "${folderName}" (Code: ${folderCode}) on ShareBox:`,
          url: shareUrl,
        });
      } catch (err) {
        // User aborted or unallowed
        console.log("Share cancelled or not allowed:", err);
      }
    }
  };

  // WhatsApp share link (Requirement 11)
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
    `Access "${folderName}" (Code: ${folderCode}) on ShareBox: ${shareUrl}`
  )}`;

  // Email share link (Requirement 11)
  const emailSubject = `Shared Folder: ${folderName}`;
  const emailBody = `Hi,\n\nI have shared files with you on ShareBox in the folder "${folderName}".\n\nFolder Code: ${folderCode}\nAccess Link: ${shareUrl}\n\nAccess the link or enter the folder code on ShareBox to view and download files.`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  // Telegram share link
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Access "${folderName}" on ShareBox`)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
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
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 shadow-sm">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Share Folder
            </h3>
            <p className="text-xs text-slate-500 line-clamp-1">{folderName}</p>
          </div>
        </div>

        {/* Copy Link Field */}
        <div className="space-y-2 mb-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Shareable URL
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 select-all"
            />
            <Button onClick={handleCopy} size="sm" className="gap-1.5 shrink-0 text-xs h-9">
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-white" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Native Web Share API Button if supported */}
        {hasWebShare && (
          <div className="mb-4">
            <Button onClick={handleNativeShare} className="w-full gap-2 shadow-sm">
              <Share2 className="h-4 w-4" />
              Share via System / Nearby Devices
            </Button>
          </div>
        )}

        {/* Sharing Channel Buttons */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Quick Channels
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {/* WhatsApp */}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/70 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 transition-colors"
            >
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              <span>WhatsApp</span>
            </a>

            {/* Email */}
            <a
              href={mailtoUrl}
              className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs font-semibold text-blue-800 hover:bg-blue-100/70 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 transition-colors"
            >
              <Mail className="h-4 w-4 text-blue-600" />
              <span>Email</span>
            </a>

            {/* Telegram */}
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-xs font-semibold text-sky-800 hover:bg-sky-100/70 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300 transition-colors"
            >
              <Send className="h-4 w-4 text-sky-600" />
              <span>Telegram</span>
            </a>

            {/* QR Code trigger */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenQr();
              }}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-200 transition-colors"
            >
              <QrCode className="h-4 w-4 text-blue-600" />
              <span>View QR Code</span>
            </button>
          </div>
        </div>

        {/* Notice */}
        <p className="mt-5 text-center text-[11px] text-slate-400">
          Folder Code: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{folderCode}</span>. Anyone with this link or code can access public files.
        </p>
      </div>
    </div>
  );
}
