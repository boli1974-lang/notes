"use client";

import { Locale } from "@/lib/i18n";

type LanguageToggleProps = {
  locale: Locale;
  onChange: (locale: Locale) => void;
};

export function LanguageToggle({ locale, onChange }: LanguageToggleProps) {
  return (
    <div className="inline-flex items-center rounded-md border border-slate-300 bg-white p-1 text-xs">
      <button
        onClick={() => onChange("en")}
        className={`rounded px-2 py-1 ${
          locale === "en" ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        EN
      </button>
      <button
        onClick={() => onChange("zh")}
        className={`rounded px-2 py-1 ${
          locale === "zh" ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        中文
      </button>
    </div>
  );
}
