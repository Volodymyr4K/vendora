"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

const LS_KEY = "am_berlin_search_history_v1";
const CLOSE_DELAY_MS = 420;

type Labels = {
    search: string;
    recentSearches: string;
    clearHistory: string;
    emptyArchive: string;
    trending: string;
    quickLinks: {
        philosophy: string;
        art: string;
        newest: string;
    };
};

type QuickLink = { id: string; label: string; query: string };

function IconSearch(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
        </svg>
    );
}

function IconClose(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
    );
}

function IconArrowRight(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M5 12h14M13 5l6 7-6 7" />
        </svg>
    );
}

export function AmHeaderSearch(props: {
    catalogHref: string;
    labels: Labels;
    className?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const [renderOverlay, setRenderOverlay] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [history, setHistory] = React.useState<string[]>([]);
    const [mounted, setMounted] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const closeTimerRef = React.useRef<number | null>(null);

    const quickLinks: QuickLink[] = React.useMemo(
        () => [
            { id: "philosophy", label: props.labels.quickLinks.philosophy, query: props.labels.quickLinks.philosophy },
            { id: "art", label: props.labels.quickLinks.art, query: props.labels.quickLinks.art },
            { id: "new", label: props.labels.quickLinks.newest, query: props.labels.quickLinks.newest },
        ],
        [props.labels.quickLinks.philosophy, props.labels.quickLinks.art, props.labels.quickLinks.newest]
    );

    React.useEffect(() => {
        setMounted(true);
    }, []);

    const openOverlay = React.useCallback(() => {
        if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
        setRenderOverlay(true);
        setOpen(true);
    }, []);

    const closeOverlay = React.useCallback(() => {
        setOpen(false);
        if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current);
        }
        closeTimerRef.current = window.setTimeout(() => {
            setRenderOverlay(false);
            closeTimerRef.current = null;
        }, CLOSE_DELAY_MS);
    }, []);

    React.useEffect(() => {
        if (!renderOverlay) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeOverlay();
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
        };
    }, [renderOverlay, closeOverlay]);

    React.useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(id);
    }, [open]);

    React.useEffect(() => {
        return () => {
            if (closeTimerRef.current) {
                window.clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setHistory(parsed.filter((item) => typeof item === "string"));
            }
        } catch {
            // ignore
        }
    }, []);

    const persistHistory = (next: string[]) => {
        setHistory(next);
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(next));
        } catch {
            // ignore
        }
    };

    const addHistory = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        const next = [trimmed, ...history.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6);
        persistHistory(next);
    };

    const clearHistory = () => {
        persistHistory([]);
    };

    const navigateToSearch = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        addHistory(trimmed);
        const url = `${props.catalogHref}?search=${encodeURIComponent(trimmed)}`;
        router.push(url);
        setOpen(false);
    };

    return (
        <>
            <div
                className={`w-[60px] md:w-[80px] flex items-center justify-center transition-colors duration-500 ease-out group relative overflow-hidden ${
                    open ? "bg-ink" : "bg-bg"
                } ${props.className ?? ""}`}
            >
                <button
                    type="button"
                    onClick={() => (open ? closeOverlay() : openOverlay())}
                    className={`relative z-10 flex items-center justify-center w-full h-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                        open ? "text-paper" : "text-ink/80 group-hover:text-paper"
                    }`}
                    aria-expanded={open}
                    aria-label={props.labels.search}
                >
                    <span className="sr-only">{props.labels.search}</span>
                    {open ? <IconClose className="w-[15px] h-[15px]" /> : <IconSearch className="w-[15px] h-[15px]" />}
                </button>
                <div
                    className={`absolute inset-0 bg-ink berlin-press-ink-noise transition-transform duration-500 ease-out-quart ${
                        open ? "translate-y-0" : "translate-y-full group-hover:translate-y-0"
                    }`}
                />
            </div>

            {mounted && renderOverlay
                ? createPortal(
                  <div className="berlin-press-lite">
                      <button
                          type="button"
                          aria-label="Close search"
                          onClick={closeOverlay}
                          className={`fixed inset-0 z-[998] bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 ${
                              open ? "opacity-100" : "opacity-0 pointer-events-none"
                          }`}
                      />
                      <div
                          className={`fixed inset-x-0 top-[60px] md:top-[80px] h-[clamp(280px,32vh,420px)] berlin-press-ink-surface text-paper z-[999] border-b border-paper/20 shadow-2xl overflow-hidden ${
                              open ? "animate-berlin-press-search-slide-in" : "animate-berlin-press-search-slide-out"
                          }`}
                      >
                          <button
                              type="button"
                              onClick={closeOverlay}
                              className="absolute right-3 top-3 md:right-6 md:top-6 p-2 text-paper/70 hover:text-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                              aria-label="Close search"
                          >
                              <IconClose className="w-4 h-4" />
                          </button>
                          <div className="max-w-6xl mx-auto h-full grid grid-cols-1 md:grid-cols-12 min-h-0">
                              <div className="md:col-span-8 p-6 md:p-12 border-b md:border-b-0 md:border-r border-paper/10 min-h-0 overflow-y-auto">
                                  <form
                                      onSubmit={(event) => {
                                          event.preventDefault();
                                          navigateToSearch(query);
                                      }}
                                  >
                                      <div className="relative">
                                          <input
                                              ref={inputRef}
                                              type="text"
                                              value={query}
                                              onChange={(event) => setQuery(event.target.value)}
                                              placeholder={props.labels.search}
                                              className="w-full bg-transparent text-4xl md:text-6xl font-serif uppercase text-paper placeholder:text-paper/20 outline-none pb-4 border-b border-paper/30 focus:border-accent transition-colors"
                                          />
                                          <button type="submit" className="absolute right-0 bottom-6 text-accent hover:text-paper transition-colors">
                                              <IconArrowRight className="w-10 h-10" />
                                          </button>
                                      </div>
                                  </form>

                                  <div className="mt-8">
                                      <p className="text-xs uppercase tracking-widest text-paper/40 mb-4">{props.labels.recentSearches}</p>
                                      <div className="flex flex-wrap gap-3">
                                          {history.length > 0 ? (
                                              history.map((term) => (
                                                  <button
                                                      key={term}
                                                      type="button"
                                                      onClick={() => navigateToSearch(term)}
                                                      className="flex items-center gap-2 px-4 py-2 border border-paper/20 hover:bg-paper hover:text-ink transition-colors text-sm font-mono"
                                                  >
                                                      {term}
                                                  </button>
                                              ))
                                          ) : (
                                              <span className="text-sm font-mono text-paper/20 italic">{props.labels.emptyArchive}</span>
                                          )}
                                      </div>
                                      {history.length > 0 ? (
                                          <button
                                              type="button"
                                              onClick={clearHistory}
                                              className="mt-6 flex items-center gap-2 text-xs text-accent hover:text-paper"
                                          >
                                              {props.labels.clearHistory}
                                          </button>
                                      ) : null}
                                  </div>
                              </div>

                              <div className="md:col-span-4 p-6 md:p-10 bg-paper/5 min-h-0 overflow-y-auto">
                                  <h3 className="font-bold text-xs uppercase tracking-widest mb-8 text-accent">{props.labels.trending}</h3>
                                  <ul className="space-y-4">
                                      {quickLinks.map((link, index) => (
                                          <li key={link.id}>
                                              <button
                                                  type="button"
                                                  onClick={() => navigateToSearch(link.query)}
                                                  className="w-full text-left text-2xl font-serif hover:text-accent transition-all flex justify-between group"
                                              >
                                                  <span>{link.label}</span>
                                                  <span className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity">0{index + 1}</span>
                                              </button>
                                          </li>
                                      ))}
                                  </ul>
                              </div>
                          </div>
                      </div>
                  </div>,
                      document.body
                  )
                : null}
        </>
    );
}
