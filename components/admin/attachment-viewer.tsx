"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AdminAttachmentItem = {
  url: string;
  title: string;
  filename?: string | null;
  mimeType?: string | null;
};

type ViewerRequest = {
  items: AdminAttachmentItem[];
  index: number;
};

const EVENT_NAME = "accabad:open-attachment";

export function openAdminAttachment(item: AdminAttachmentItem | AdminAttachmentItem[], index = 0) {
  if (typeof window === "undefined") return;
  const items = Array.isArray(item) ? item : [item];
  if (!items.length) return;
  window.dispatchEvent(new CustomEvent<ViewerRequest>(EVENT_NAME, {
    detail: { items, index: Math.max(0, Math.min(index, items.length - 1)) },
  }));
}

function filenameFromDisposition(value: string | null) {
  if (!value) return null;
  const utf = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf) {
    try { return decodeURIComponent(utf); } catch { return utf; }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

export function AdminAttachmentViewer() {
  const [request, setRequest] = useState<ViewerRequest | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [resolvedMime, setResolvedMime] = useState<string | null>(null);
  const [resolvedFilename, setResolvedFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = request?.items[request.index] ?? null;

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<ViewerRequest>).detail;
      if (!detail?.items?.length) return;
      setRequest({ items: detail.items, index: Math.max(0, Math.min(detail.index ?? 0, detail.items.length - 1)) });
    };
    window.addEventListener(EVENT_NAME, listener);
    return () => window.removeEventListener(EVENT_NAME, listener);
  }, []);

  useEffect(() => {
    if (!current) {
      setObjectUrl(null);
      setResolvedMime(null);
      setResolvedFilename(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let nextObjectUrl: string | null = null;
    setObjectUrl(null);
    setResolvedMime(current.mimeType ?? null);
    setResolvedFilename(current.filename ?? null);
    setError(null);

    fetch(current.url, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load attachment (HTTP ${response.status}).`);
        const blob = await response.blob();
        if (cancelled) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
        setResolvedMime(blob.type || response.headers.get("content-type") || current.mimeType || "application/octet-stream");
        setResolvedFilename(current.filename || filenameFromDisposition(response.headers.get("content-disposition")) || "attachment");
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load attachment.");
      });

    return () => {
      cancelled = true;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [current]);

  const kind = useMemo(() => {
    const mime = resolvedMime?.toLowerCase() ?? "";
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf") return "pdf";
    return "file";
  }, [resolvedMime]);

  const move = (delta: number) => {
    setRequest((value) => {
      if (!value) return value;
      const index = Math.max(0, Math.min(value.index + delta, value.items.length - 1));
      return { ...value, index };
    });
  };

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) setRequest(null); }}>
      <DialogContent className="flex max-h-[92vh] w-[min(94vw,1100px)] max-w-none flex-col overflow-hidden rounded-[24px] border-[#e5e2ee] p-0">
        {current && <>
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{current.title}</DialogTitle>
            <DialogDescription>
              {resolvedFilename ?? current.filename ?? "Attachment"}
              {resolvedMime ? ` · ${resolvedMime}` : ""}
              {request && request.items.length > 1 ? ` · ${request.index + 1} of ${request.items.length}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto bg-[#f6f5f9] p-4 sm:p-6">
            {!objectUrl && !error && <div className="grid min-h-[420px] place-items-center"><div className="flex items-center gap-2 text-sm text-[#777287]"><LoaderCircle className="size-5 animate-spin" />Loading attachment…</div></div>}
            {error && <div className="grid min-h-[420px] place-items-center text-center"><div><FileText className="mx-auto mb-3 size-10 text-[#9692a3]" /><p className="font-semibold text-[#353146]">Attachment unavailable</p><p className="mt-1 text-sm text-[#777287]">{error}</p></div></div>}
            {objectUrl && kind === "image" && <div className="flex min-h-[420px] items-center justify-center"><Image unoptimized src={objectUrl} alt={current.title} width={1800} height={1400} className="max-h-[72vh] h-auto w-auto max-w-full rounded-xl object-contain shadow-sm" /></div>}
            {objectUrl && kind === "pdf" && <iframe src={objectUrl} title={current.title} className="h-[70vh] min-h-[520px] w-full rounded-xl border bg-white" />}
            {objectUrl && kind === "file" && <div className="grid min-h-[420px] place-items-center text-center"><div><FileText className="mx-auto mb-3 size-12 text-[#777287]" /><p className="font-semibold">Preview is not available for this file type.</p><p className="mt-1 text-sm text-[#9692a3]">Use Download file below.</p></div></div>}
          </div>

          <DialogFooter className="flex-row items-center justify-between border-t px-6 py-4 sm:justify-between">
            <div className="flex gap-2">
              {request && request.items.length > 1 && <>
                <Button variant="outline" size="sm" disabled={request.index === 0} onClick={() => move(-1)}><ChevronLeft className="size-4" />Previous</Button>
                <Button variant="outline" size="sm" disabled={request.index === request.items.length - 1} onClick={() => move(1)}>Next<ChevronRight className="size-4" /></Button>
              </>}
            </div>
            <div className="flex gap-2">
              {objectUrl && <a href={objectUrl} download={resolvedFilename ?? current.filename ?? "attachment"}><Button variant="outline"><Download className="size-4" />Download file</Button></a>}
              <Button onClick={() => setRequest(null)}>Close</Button>
            </div>
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  );
}
