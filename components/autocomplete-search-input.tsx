"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareSearchResults, getSearchScore, normalizeSearchText } from "@/lib/search";

type SuggestionItem = {
  label: string;
  value: string;
  meta?: string;
  imageUrl?: string | null;
  accent?: string;
  searchText?: string;
};

type Props = {
  name: string;
  defaultValue?: string;
  placeholder: string;
  suggestions: SuggestionItem[];
  className?: string;
  fetchUrl?: string;
};

export function AutocompleteSearchInput({
  name,
  defaultValue = "",
  placeholder,
  suggestions,
  className,
  fetchUrl
}: Props) {
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<SuggestionItem[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!fetchUrl) return;

    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length < 1) {
      setRemoteSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const url = new URL(fetchUrl, window.location.origin);
        url.searchParams.set("q", query);
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          credentials: "same-origin"
        });
        if (!response.ok) return;
        const payload = await response.json();
        setRemoteSuggestions(Array.isArray(payload) ? payload : []);
      } catch {
        // Ignore aborted requests and transient network errors in typeahead
      }
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [fetchUrl, query]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (fetchUrl) return remoteSuggestions;

    const keyword = normalizeSearchText(query);
    if (keyword.length < 1) return [];

    return suggestions
      .map((item) => {
        const score = getSearchScore(item.searchText ?? `${item.label} ${item.value} ${item.meta ?? ""}`, keyword);
        return { item, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => compareSearchResults(
        { label: a.item.label, score: a.score, searchText: a.item.searchText },
        { label: b.item.label, score: b.score, searchText: b.item.searchText },
        keyword
      ))
      .map((entry) => entry.item)
      .slice(0, 100);
  }, [fetchUrl, query, remoteSuggestions, suggestions]);

  function submitClosestForm(nextValue: string) {
    setQuery(nextValue);
    setOpen(false);

    requestAnimationFrame(() => {
      const form = rootRef.current?.closest("form");
      form?.requestSubmit();
    });
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 flex-1 ${className ?? ""}`}>
      <input
        name={name}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base shadow-soft outline-none sm:h-14 sm:px-5 sm:text-xl"
      />

      {open && filteredSuggestions.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {filteredSuggestions.map((item) => (
            <button
              key={`${item.value}-${item.label}`}
              type="button"
              className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
              onClick={() => submitClosestForm(item.value)}
            >
              <div className="flex min-w-0 items-start gap-3">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.label} className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-xl bg-slate-100" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 sm:text-base">{item.label}</p>
                  {item.meta ? <p className="mt-1 truncate text-xs text-slate-500 sm:text-sm">{item.meta}</p> : null}
                </div>
              </div>
              {item.accent ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 sm:text-sm">
                  {item.accent}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
