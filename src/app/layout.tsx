import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "ShareBox - Secure & Ephemeral Multi-File Sharing Platform",
  description:
    "ShareBox is a high-performance secure file sharing platform. Create temporary folders, upload multiple files, and share securely via unique folder codes, direct URLs, or dynamic QR codes.",
  keywords: [
    "file sharing",
    "secure upload",
    "ephemeral storage",
    "folder code",
    "QR code file share",
    "ShareBox",
  ],
  authors: [{ name: "ShareBox Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen flex flex-col bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <ToastProvider>
              <Navbar />
              <main className="flex-1 flex flex-col w-full">
                {children}
              </main>
              <Footer />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
