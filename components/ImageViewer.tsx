"use client";

import { useEffect, useRef } from "react";

const ALT_FALLBACK = "Attached image";

type ImageViewerProps = {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
  closeLabel?: string;
};

export function ImageViewer({ src, alt, open, onClose, closeLabel = "Close" }: ImageViewerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Body scroll lock: disable background scroll when viewer is open, restore on close/unmount
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Focus close button when modal opens; Escape key to close (listener removed when open becomes false)
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [open, onClose]);

  if (!open || !src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Content area: clicking image/content does NOT close; only X, backdrop, Escape close */}
      <div
        className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt ?? ALT_FALLBACK}
          className="max-h-[90vh] max-w-[90vw] object-contain"
          draggable={false}
        />
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label={closeLabel}
        >
          ×
        </button>
      </div>
    </div>
  );
}
