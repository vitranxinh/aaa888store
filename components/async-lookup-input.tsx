"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type LookupOption = {
  id: string;
  label: string;
  meta?: string;
};

type Props = {
  value: string;
  onChange: (nextValue: string, option?: LookupOption) => void;
  fetchUrl: string;
  placeholder: string;
  initialLabel?: string;
  disabled?: boolean;
};

export function AsyncLookupInput({
  value,
  onChange,
  fetchUrl,
  placeholder,
  initialLabel = "",
  disabled = false
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(initialLabel);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState<LookupOption[]>([]);

  useEffect(() => {
    setQuery(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    if (!open || disabled) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setIsLoading(true);
        const url = new URL(fetchUrl, window.location.origin);
        url.searchParams.set("q", query.trim());
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          credentials: "same-origin"
        });
        if (!response.ok) return;
        const payload = await response.json();
        setOptions(Array.isArray(payload) ? payload : []);
      } catch {
        // ignore aborted lookup requests
      } finally {
        setIsLoading(false);
      }
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [disabled, fetchUrl, open, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canShowMenu = open && !disabled;
  const hasOptions = options.length > 0;
  const emptyState = !isLoading && query.trim().length > 0 && !hasOptions;

  const helperText = useMemo(() => {
    if (disabled) return "Không áp dụng với loại phiếu hiện tại";
    if (isLoading) return "Đang tìm...";
    if (emptyState) return "Không có kết quả phù hợp";
    return "";
  }, [disabled, emptyState, isLoading]);

  return (
    <div ref={rootRef} className="relative">
      <input
        value={query}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          setOpen(true);
          if (!nextValue.trim() && value) {
            onChange("", undefined);
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-xl disabled:bg-slate-100 disabled:text-slate-400"
      />
      {helperText ? <p className="mt-2 px-1 text-sm text-slate-500">{helperText}</p> : null}

      {canShowMenu && hasOptions ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
              onClick={() => {
                setQuery(option.label);
                setOpen(false);
                onChange(option.id, option);
              }}
            >
              <p className="text-base font-semibold text-slate-900">{option.label}</p>
              {option.meta ? <p className="mt-1 text-sm text-slate-500">{option.meta}</p> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
