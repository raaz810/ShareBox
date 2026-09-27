"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FolderAccessForm() {
  const router = useRouter();
  const [code, setCode] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean) {
      router.push(`/${clean}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter 8-character Folder Code (e.g. AB7K9X2P)"
        maxLength={12}
        className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono tracking-wider uppercase text-slate-900 placeholder:normal-case placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
        required
      />
      <Button type="submit" size="lg" className="gap-2 sm:w-auto w-full">
        Access Folder
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}
