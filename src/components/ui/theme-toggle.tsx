"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme">
        <Sun className="h-5 w-5 text-slate-500" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 transition-all text-amber-400" />
      ) : (
        <Moon className="h-5 w-5 transition-all text-slate-600" />
      )}
    </Button>
  );
}
