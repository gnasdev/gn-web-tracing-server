import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type {
  ConsoleLogEntry,
  RemoteObjectValue,
  ObjectPreviewValue,
  PropertyPreviewValue,
} from "../types";

interface Props {
  entries: ConsoleLogEntry[];
  startTime: number;
  currentTimeMs: number;
}

const FILTER_LEVELS = [
  "all",
  "log",
  "warn",
  "error",
  "info",
  "debug",
  "exception",
  "browser",
] as const;

function formatTime(relativeMs: number): string {
  const ms = Math.max(0, relativeMs);
  const totalSec = Math.floor(ms / 1000);
  const millis = String(Math.floor(ms % 1000)).padStart(3, "0");
  const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const sec = String(totalSec % 60).padStart(2, "0");
  return `${min}:${sec}.${millis}`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isNewFormat(entry: ConsoleLogEntry): boolean {
  return entry.source !== undefined;
}

function getLevel(entry: ConsoleLogEntry): string {
  if (isNewFormat(entry)) {
    if (entry.source === "exception") return "error";
    if (entry.source === "browser") return entry.level || "info";
    return entry.level || "log";
  }
  return entry.level || "log";
}

function getLevelLabel(entry: ConsoleLogEntry): string {
  if (isNewFormat(entry)) {
    if (entry.source === "exception") return "EXCEPTION";
    if (entry.source === "browser") return "BROWSER";
  }
  return (getLevel(entry) || "log").toUpperCase();
}

function getFilterLevel(entry: ConsoleLogEntry): string {
  if (isNewFormat(entry)) {
    if (entry.source === "exception") return "exception";
    if (entry.source === "browser") return "browser";
  }
  return getLevel(entry);
}

// HTML rendering helpers (used via dangerouslySetInnerHTML for performance with complex object rendering)

function renderRemoteObject(obj: RemoteObjectValue): string {
  if (!obj) return "undefined";

  switch (obj.type) {
    case "undefined":
      return '<span class="text-gh-secondary">undefined</span>';
    case "boolean":
      return `<span class="text-gh-blue-num">${obj.value}</span>`;
    case "number":
      return `<span class="text-gh-blue-num">${obj.description || obj.value}</span>`;
    case "bigint":
      return `<span class="text-gh-blue-num">${obj.description || obj.value}n</span>`;
    case "string":
      return `<span class="text-gh-blue-str">${escapeHtml(obj.value != null ? String(obj.value) : obj.description || "")}</span>`;
    case "symbol":
      return `<span class="text-gh-purple">${escapeHtml(obj.description || "Symbol()")}</span>`;
    case "function":
      return `<span class="text-gh-purple italic">\u0192 ${escapeHtml(obj.description || "anonymous")}</span>`;
    case "object":
      return renderObjectPreview(obj);
    default:
      return escapeHtml(obj.description || String(obj.value));
  }
}

function renderObjectPreview(obj: RemoteObjectValue): string {
  if (obj.subtype === "null")
    return '<span class="text-gh-secondary">null</span>';
  if (obj.subtype === "error")
    return `<span class="text-gh-error whitespace-pre-wrap">${escapeHtml(obj.description || "Error")}</span>`;
  if (obj.subtype === "regexp")
    return `<span class="text-gh-orange">${escapeHtml(obj.description || "")}</span>`;
  if (obj.subtype === "date")
    return `<span class="text-gh-blue-str">${escapeHtml(obj.description || "")}</span>`;
  if (obj.preview) return renderPreview(obj.preview, obj.className);
  return `<span class="text-gh-secondary">${escapeHtml(obj.description || obj.className || "Object")}</span>`;
}

function renderPreview(
  preview: ObjectPreviewValue,
  className?: string,
): string {
  if (!preview.properties || preview.properties.length === 0) {
    if (preview.subtype === "array") return "[]";
    return className ? `${className} {}` : "{}";
  }

  const isArray = preview.subtype === "array";
  const open = isArray
    ? "["
    : className && className !== "Object"
      ? `${className} {`
      : "{";
  const close = isArray ? "]" : "}";

  const props = preview.properties
    .map((p) => {
      const val = renderPreviewValue(p);
      if (isArray) return val;
      return `<span class="text-gh-purple">${escapeHtml(p.name)}</span>: ${val}`;
    })
    .join(", ");

  const overflow = preview.overflow ? ", ..." : "";
  return `${open}${props}${overflow}${close}`;
}

function renderPreviewValue(prop: PropertyPreviewValue): string {
  if (prop.valuePreview)
    return renderPreview(prop.valuePreview, prop.valuePreview.description);

  switch (prop.type) {
    case "string":
      return `<span class="text-gh-blue-str">"${escapeHtml(prop.value || "")}"</span>`;
    case "number":
    case "bigint":
      return `<span class="text-gh-blue-num">${prop.value}</span>`;
    case "boolean":
      return `<span class="text-gh-blue-num">${prop.value}</span>`;
    case "undefined":
      return '<span class="text-gh-secondary">undefined</span>';
    case "function":
      return '<span class="text-gh-purple italic">\u0192</span>';
    case "object":
      if (prop.subtype === "null")
        return '<span class="text-gh-secondary">null</span>';
      return `<span class="text-gh-secondary">${escapeHtml(prop.value || "Object")}</span>`;
    default:
      return escapeHtml(prop.value || "");
  }
}

function renderArgs(entry: ConsoleLogEntry): string {
  if (isNewFormat(entry)) {
    if (entry.source === "exception" || entry.source === "browser") {
      const msg = entry.message || "";
      const firstStackLine = msg.search(/\n\s+at /);
      return escapeHtml(
        firstStackLine >= 0 ? msg.substring(0, firstStackLine) : msg,
      );
    }
    if (!Array.isArray(entry.args)) return String(entry.args || "");
    return entry.args.map((arg) => renderRemoteObject(arg)).join(" ");
  }

  if (!Array.isArray(entry.args)) return escapeHtml(String(entry.args));
  return entry.args
    .map((arg) => {
      if (arg === null) return "null";
      if (arg === undefined || arg === ("undefined" as unknown))
        return "undefined";
      if (typeof arg === "object") {
        if ((arg as RemoteObjectValue).type === "Error")
          return escapeHtml(
            `${(arg as RemoteObjectValue & { message?: string }).message}\n${(arg as RemoteObjectValue & { stack?: string }).stack || ""}`,
          );
        try {
          return escapeHtml(JSON.stringify(arg));
        } catch {
          return String(arg);
        }
      }
      return escapeHtml(String(arg));
    })
    .join(" ");
}

function renderFullRemoteObject(obj: RemoteObjectValue): string {
  if (!obj) return '<span class="text-gh-secondary">undefined</span>';

  if (obj.type === "object" && obj.preview && obj.preview.properties) {
    const isArray = obj.preview.subtype === "array";
    const label = isArray ? "Array" : obj.className || "Object";
    let html = `<div class="inline"><span class="text-gh-secondary italic">${escapeHtml(label)}</span>`;
    html += `<div class="pl-4">`;
    for (const prop of obj.preview.properties) {
      html += `<div class="leading-relaxed"><span class="text-gh-purple">${escapeHtml(prop.name)}</span>: ${renderPreviewValue(prop)}</div>`;
    }
    if (obj.preview.overflow) {
      html += `<div class="leading-relaxed text-gh-muted">...</div>`;
    }
    html += `</div></div>`;
    return html;
  }

  return renderRemoteObject(obj);
}

// Detail panel

function ConsoleDetail({ entry }: { entry: ConsoleLogEntry }) {
  const levelLabel = getLevelLabel(entry);
  const sourceLabel = entry.source ? ` (${entry.source})` : "";

  return (
    <div
      className="w-full py-2 border-t border-gh-border font-mono text-[11px] leading-relaxed"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2">
        <h4 className="text-gh-accent text-[11px] mb-0.5">Time</h4>
        <pre className="text-gh-secondary whitespace-pre-wrap break-all">
          {formatTime(entry.relativeMs)}
        </pre>
      </div>

      <div className="mb-2">
        <h4 className="text-gh-accent text-[11px] mb-0.5">Level</h4>
        <pre className="text-gh-secondary whitespace-pre-wrap break-all">
          {levelLabel}
          {sourceLabel}
        </pre>
      </div>

      {isNewFormat(entry) && Array.isArray(entry.args) ? (
        <div className="mb-2">
          <h4 className="text-gh-accent text-[11px] mb-0.5">Arguments</h4>
          {entry.args.map((arg, i) => (
            <div key={i} className="py-0.5">
              <span className="text-gh-muted text-[10px]">[{i}]</span>{" "}
              <span
                dangerouslySetInnerHTML={{
                  __html: renderFullRemoteObject(arg),
                }}
              />
            </div>
          ))}
        </div>
      ) : entry.message ? (
        <div className="mb-2">
          <h4 className="text-gh-accent text-[11px] mb-0.5">Message</h4>
          <pre className="text-gh-secondary whitespace-pre-wrap break-all">
            {entry.message}
          </pre>
        </div>
      ) : null}

      {(entry.originalSource || entry.url) && (
        <div className="mb-2">
          <h4 className="text-gh-accent text-[11px] mb-0.5">Source</h4>
          <pre className="text-gh-secondary whitespace-pre-wrap break-all">
            {entry.originalSource
              ? `${entry.originalSource}${entry.originalLine != null ? `:${entry.originalLine + 1}` : ""}${entry.originalColumn != null ? `:${entry.originalColumn + 1}` : ""}`
              : `${entry.url}${entry.lineNumber != null ? `:${entry.lineNumber + 1}` : ""}${entry.columnNumber != null ? `:${entry.columnNumber + 1}` : ""}`}
          </pre>
        </div>
      )}

      {entry.stackTrace && entry.stackTrace.length > 0 && (
        <div className="mb-2">
          <h4 className="text-gh-accent text-[11px] mb-1">Stack Trace</h4>
          <div className="py-1 pl-3 text-[11px] leading-relaxed">
            {entry.stackTrace.map((frame, i) => {
              if (frame.asyncBoundary) {
                return (
                  <div key={i} className="text-[#3d444d] italic">
                    --- {frame.asyncBoundary} ---
                  </div>
                );
              }
              const fnName =
                frame.originalName || frame.functionName || "(anonymous)";
              const location = frame.originalSource
                ? `${frame.originalSource}:${(frame.originalLine ?? 0) + 1}:${(frame.originalColumn ?? 0) + 1}`
                : frame.url
                  ? `${frame.url}:${(frame.lineNumber ?? 0) + 1}:${(frame.columnNumber ?? 0) + 1}`
                  : "";
              const src = frame.originalSource || frame.url || "";
              const isVendor = src.includes("node_modules");
              return (
                <div key={i} className={isVendor ? "text-[#3d444d]" : "text-gh-muted"}>
                  at <span className={isVendor ? "text-[#3d444d]" : "text-gh-purple"}>{fnName}</span>
                  {location && (
                    <span className={isVendor ? "text-[#3d444d]" : "text-gh-muted"}> ({location})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Main component

export function ConsoleViewer({ entries, currentTimeMs }: Props) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrolledToRef = useRef(-1);

  const processedEntries = useMemo(
    () =>
      entries.map((e, i) => ({
        entry: e,
        index: i,
        level: getLevel(e),
        filterLevel: getFilterLevel(e),
      })),
    [entries],
  );

  // Find closest entry and determine visibility
  const { closestIndex, visibleEntries } = useMemo(() => {
    let closestIdx = -1;
    let closestDist = Infinity;

    const visible = processedEntries.filter((pe) => {
      const inTime = pe.entry.relativeMs <= currentTimeMs;
      if (!inTime) return false;
      const dist = Math.abs(pe.entry.relativeMs - currentTimeMs);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = pe.index;
      }
      return true;
    });

    // Only highlight if within 1.5s
    if (closestDist >= 1500) closestIdx = -1;

    const filtered =
      activeFilter === "all"
        ? visible
        : visible.filter((pe) => pe.filterLevel === activeFilter);

    return { closestIndex: closestIdx, visibleEntries: filtered };
  }, [processedEntries, currentTimeMs, activeFilter]);

  // Auto-scroll to last visible entry
  const lastVisibleIndex =
    visibleEntries.length > 0
      ? visibleEntries[visibleEntries.length - 1].index
      : -1;

  const scrollToRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el && lastVisibleIndex !== lastScrolledToRef.current) {
        lastScrolledToRef.current = lastVisibleIndex;
        el.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    },
    [lastVisibleIndex],
  );

  // Reset scroll tracking when entries change
  useEffect(() => {
    lastScrolledToRef.current = -1;
  }, [entries]);

  const handleEntryClick = useCallback((index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  const levelColorClass: Record<string, string> = {
    log: "text-gh-bright",
    warn: "text-gh-warning",
    error: "text-gh-error",
    info: "text-gh-accent",
    debug: "text-gh-secondary",
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filters */}
      <div className="flex justify-between items-center px-3 py-2 bg-gh-panel border-b border-gh-border shrink-0 flex-wrap gap-1.5">
        <div className="flex gap-1 flex-wrap">
          {FILTER_LEVELS.map((level) => (
            <button
              key={level}
              className={`px-2 py-0.5 border rounded text-[11px] cursor-pointer ${
                activeFilter === level
                  ? "bg-gh-accent-bg border-gh-accent-bg text-white"
                  : "bg-transparent border-gh-border text-gh-secondary hover:border-gh-accent hover:text-gh-text"
              }`}
              onClick={() => setActiveFilter(level)}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      <div
        ref={containerRef}
        className="entries-scroll flex-1 overflow-y-auto overflow-x-hidden"
      >
        {visibleEntries.map((pe, vi) => {
          const { entry, index, level } = pe;
          const isActive = index === closestIndex;
          const isExpanded = index === expandedIndex;
          const isLast = vi === visibleEntries.length - 1;

          return (
            <div
              key={index}
              ref={isLast ? scrollToRef : undefined}
              className={`flex gap-2 px-3 py-1 border-b border-gh-hover cursor-pointer font-mono text-xs leading-normal hover:bg-gh-panel ${
                entry.source === "exception"
                  ? "bg-[rgba(248,81,73,0.08)] border-l-[3px] border-l-gh-error pl-[9px] hover:bg-[rgba(248,81,73,0.15)]"
                  : entry.source === "browser"
                    ? "bg-[rgba(88,166,255,0.05)] hover:bg-[rgba(88,166,255,0.1)]"
                    : ""
              } ${isActive ? "bg-gh-highlight border-l-[3px] border-l-gh-accent pl-[9px]" : ""} ${isExpanded ? "bg-gh-panel flex-wrap" : ""}`}
              onClick={() => handleEntryClick(index)}
            >
              <span className="text-gh-muted whitespace-nowrap shrink-0 tabular-nums">
                {formatTime(entry.relativeMs)}
              </span>
              <span
                className={`font-semibold whitespace-nowrap shrink-0 min-w-[70px] ${levelColorClass[level] || "text-gh-bright"}`}
              >
                {getLevelLabel(entry)}
              </span>
              <span className="break-all flex-1 min-w-0">
                <span dangerouslySetInnerHTML={{ __html: renderArgs(entry) }} />
                {(entry.originalSource || entry.url) &&
                  (entry.source === "exception" ||
                    entry.source === "browser") && (
                    <span className="block mt-0.5 text-[10px] text-gh-muted overflow-hidden text-ellipsis whitespace-nowrap">
                      {entry.originalSource
                        ? `${entry.originalSource}${entry.originalLine != null ? `:${entry.originalLine + 1}` : ""}${entry.originalColumn != null ? `:${entry.originalColumn + 1}` : ""}`
                        : `${entry.url}${entry.lineNumber != null ? `:${entry.lineNumber + 1}` : ""}${entry.columnNumber != null ? `:${entry.columnNumber + 1}` : ""}`}
                    </span>
                  )}
              </span>
              {isExpanded && <ConsoleDetail entry={entry} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
