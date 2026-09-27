import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats byte values into human-readable strings (KB, MB, GB)
 */
export function formatBytes(bytes: number | bigint, decimals: number = 2): string {
  const numericBytes = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (numericBytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(numericBytes) / Math.log(k));
  return `${parseFloat((numericBytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Serializes objects containing BigInt for JSON responses
 */
export function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}
