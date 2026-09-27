import Link from "next/link";
import { Mail, MessageSquare, Send, ArrowLeft, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">Support & Inquiries</Badge>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Contact ShareBox Support
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Have questions regarding folder security, storage quotas, or platform architecture? We are here to help.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact Info Card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Support Channels</CardTitle>
            <CardDescription>Direct contact points</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Email</p>
                <p>support@sharebox.internal</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Response Time</p>
                <p>Within 24 business hours</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Live Assistance</p>
                <p>Available on Part 2 rollout</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Card */}
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Send Us a Message</CardTitle>
            <CardDescription>Fill out the form below</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Your Name
                </label>
                <Input placeholder="Jane Doe" disabled className="bg-slate-50 dark:bg-slate-900" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <Input placeholder="jane@example.com" disabled className="bg-slate-50 dark:bg-slate-900" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Subject
              </label>
              <Input placeholder="Inquiry about custom storage limits" disabled className="bg-slate-50 dark:bg-slate-900" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Message
              </label>
              <textarea
                rows={4}
                placeholder="How can our engineering team assist you?"
                disabled
                className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-500 cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 focus:outline-none"
              />
            </div>
          </CardContent>
          <CardFooter className="border-t border-slate-100 dark:border-slate-800/80 pt-4 flex justify-end">
            <Button disabled size="sm" className="gap-2">
              <Send className="h-4 w-4" />
              Send Message (Part 2)
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
        <Link href="/" className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to ShareBox
        </Link>
      </div>
    </div>
  );
}
