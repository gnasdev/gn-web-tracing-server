import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type {
  NetworkLogEntry,
  HeaderItem,
  ContentInfo,
  InitiatorInfo,
  StackInfo,
  StackFrameInfo,
  RedirectInfo,
  WsLogEntry,
  WsFrame,
} from "../types";

interface Props {
  entries: NetworkLogEntry[];
  startTime: number;
  currentTimeMs: number;
  webSocketLogs: WsLogEntry[];
}

const FILTER_TYPES = [
  "all",
  "fetch",
  "js",
  "css",
  "img",
  "doc",
  "font",
  "media",
  "ws",
  "other",
] as const;

const FILTER_LABELS: Record<string, string> = {
  all: "All",
  fetch: "Fetch/XHR",
  js: "JS",
  css: "CSS",
  img: "Img",
  doc: "Doc",
  font: "Font",
  media: "Media",
  ws: "WS",
  other: "Other",
};

const TYPE_MAP: Record<string, string[]> = {
  fetch: ["XHR", "Fetch"],
  js: ["Script"],
  css: ["Stylesheet"],
  img: ["Image"],
  doc: ["Document"],
  font: ["Font"],
  media: ["Media"],
  ws: ["WebSocket"],
};

const STATIC_EXT_MAP: Record<string, string> = {
  ".js": "js", ".mjs": "js", ".cjs": "js", ".map": "js",
  ".css": "css",
  ".png": "img", ".jpg": "img", ".jpeg": "img", ".gif": "img", ".svg": "img", ".webp": "img", ".ico": "img", ".avif": "img",
  ".woff": "font", ".woff2": "font", ".ttf": "font", ".eot": "font", ".otf": "font",
  ".mp4": "media", ".webm": "media", ".mp3": "media", ".ogg": "media", ".wav": "media",
  ".html": "doc", ".htm": "doc",
};

function getFilterType(entry: NetworkLogEntry): string {
  const resourceType = entry.resourceType || "";
  if (resourceType === "XHR" || resourceType === "Fetch") {
    const url = entry.request?.url || entry.url || "";
    try {
      const pathname = new URL(url, "http://x").pathname;
      const dot = pathname.lastIndexOf(".");
      if (dot !== -1) {
        const ext = pathname.slice(dot).toLowerCase();
        const mapped = STATIC_EXT_MAP[ext];
        if (mapped) return mapped;
      }
    } catch {}
    return "fetch";
  }
  for (const [filterKey, types] of Object.entries(TYPE_MAP)) {
    if (types.includes(resourceType)) return filterKey;
  }
  return "other";
}

function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(relativeMs: number): string {
  const ms = Math.max(0, relativeMs);
  const totalSec = Math.floor(ms / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const sec = String(totalSec % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function getStatusColorClass(status: number | undefined): string {
  if (!status) return "text-gh-secondary";
  if (status >= 200 && status < 300) return "text-gh-success";
  if (status >= 300 && status < 400) return "text-gh-warning";
  return "text-gh-error";
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname + u.search;
    return p.length > 60 ? p.slice(0, 60) + "..." : p;
  } catch {
    return url && url.length > 60 ? url.slice(0, 60) + "..." : url;
  }
}

function formatHeaders(
  headers: HeaderItem[] | Record<string, string> | undefined
): string {
  if (!headers) return "(none)";
  if (Array.isArray(headers))
    return headers.map((h) => `${h.name}: ${h.value}`).join("\n");
  if (typeof headers === "object")
    return Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  return String(headers);
}

function generateCurl(entry: NetworkLogEntry): string {
  const request = entry.request || {};
  const url = request.url || entry.url || "";
  const method = request.method || entry.method || "GET";
  const parts = [`curl '${url.replace(/'/g, "'\\''")}'`];

  if (method !== "GET") parts.push(`-X ${method}`);

  const headers = request.headers || entry.requestHeaders;
  if (headers) {
    const headerList: HeaderItem[] = Array.isArray(headers)
      ? headers
      : Object.entries(headers).map(([name, value]) => ({ name, value }));
    for (const h of headerList) {
      parts.push(`-H '${h.name}: ${String(h.value).replace(/'/g, "'\\''")}'`);
    }
  }

  const postData =
    typeof request.postData === "object"
      ? (request.postData as { text?: string })?.text
      : request.postData || entry.postData;
  if (postData) {
    parts.push(`--data-raw '${postData.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(" \\\n  ");
}

// Initiator stack rendering

function InitiatorStack({ stack }: { stack: StackInfo }) {
  const frames = stack.callFrames || [];
  if (frames.length === 0 && !stack.parent) return null;

  return (
    <div className="py-1 pl-3 text-[11px] leading-relaxed">
      {frames.map((frame: StackFrameInfo, i: number) => {
        const fnName =
          frame.originalName || frame.functionName || "(anonymous)";
        const location = frame.originalSource
          ? `${frame.originalSource}:${(frame.originalLine || 0) + 1}:${(frame.originalColumn || 0) + 1}`
          : frame.url
            ? `${frame.url}:${(frame.lineNumber || 0) + 1}:${(frame.columnNumber || 0) + 1}`
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
      {stack.parent && (
        <>
          <div className="text-[#3d444d] italic">
            --- {stack.parent.description || "async"} ---
          </div>
          <InitiatorStack stack={stack.parent} />
        </>
      )}
    </div>
  );
}

// Response body component

function ResponseBody({ content }: { content: ContentInfo }) {
  const [showFull, setShowFull] = useState(false);

  if (content.encoding === "base64") {
    const sizeEstimate = content.text
      ? Math.round(content.text.length * 0.75)
      : 0;
    return (
      <div className="mb-2.5">
        <h4 className="text-gh-accent text-[11px] mb-1">Response Body</h4>
        <pre className="max-h-[300px] overflow-y-auto bg-gh-bg p-2 rounded border border-gh-hover text-gh-secondary whitespace-pre-wrap break-all">
          (binary data, ~{formatSize(sizeEstimate)})
        </pre>
      </div>
    );
  }

  let bodyText = content.text || "";
  if (content.mimeType && content.mimeType.includes("json")) {
    try {
      bodyText = JSON.stringify(JSON.parse(bodyText), null, 2);
    } catch {
      // keep as-is
    }
  }

  const maxDisplay = 10240;
  const isTruncated = bodyText.length > maxDisplay && !showFull;
  const displayText = isTruncated
    ? bodyText.slice(0, maxDisplay)
    : bodyText;

  return (
    <div className="mb-2.5">
      <h4 className="text-gh-accent text-[11px] mb-1">Response Body</h4>
      <pre className="max-h-[300px] overflow-y-auto bg-gh-bg p-2 rounded border border-gh-hover text-gh-secondary whitespace-pre-wrap break-all">
        {displayText}
      </pre>
      {isTruncated && (
        <button
          className="mt-1 px-2 py-0.5 border border-gh-border rounded bg-gh-hover text-gh-accent text-[11px] cursor-pointer hover:bg-gh-border"
          onClick={(e) => {
            e.stopPropagation();
            setShowFull(true);
          }}
        >
          Show full ({formatSize(bodyText.length)})
        </button>
      )}
    </div>
  );
}

// Network detail panel

function NetworkDetail({ entry }: { entry: NetworkLogEntry }) {
  const request = entry.request || {};
  const response = entry.response || {};
  const content = response.content || {};
  const timings = entry.timings || {};

  const [copiedAction, setCopiedAction] = useState<string | null>(null);

  const handleCopy = useCallback(
    (action: string) => {
      const curl = generateCurl(entry);
      let text = "";
      if (action === "copy-curl") text = curl;
      else if (action === "copy-response") text = content.text || "";
      else if (action === "copy-all")
        text = curl + "\n\n--- Response ---\n\n" + (content.text || "");

      navigator.clipboard.writeText(text).then(() => {
        setCopiedAction(action);
        setTimeout(() => setCopiedAction(null), 1500);
      });
    },
    [entry, content.text]
  );

  return (
    <div
      className="col-span-5 py-2.5 border-t border-gh-border font-mono text-[11px] leading-relaxed"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2.5">
        <h4 className="text-gh-accent text-[11px] mb-1">Time</h4>
        <pre className="text-gh-secondary whitespace-pre-wrap break-all">
          {formatTime(entry.relativeMs)}
        </pre>
      </div>

      {entry.redirectChain && entry.redirectChain.length > 0 && (
        <div className="mb-2.5">
          <h4 className="text-gh-accent text-[11px] mb-1">Redirect Chain</h4>
          <div className="py-1">
            {entry.redirectChain.map((r: RedirectInfo, i: number) => (
              <div key={i} className="flex gap-2 items-center py-0.5">
                {i > 0 && <span className="text-gh-muted">&rarr;</span>}
                <span className="font-semibold text-[11px] text-gh-warning">
                  {r.status}
                </span>
                <span className="text-gh-secondary break-all">{r.url}</span>
              </div>
            ))}
            <div className="flex gap-2 items-center py-0.5">
              <span className="text-gh-muted">&rarr;</span>
              <span className="font-semibold text-[11px] text-gh-success">
                {response.status}
              </span>
              <span className="text-gh-secondary break-all font-semibold">
                {request.url || entry.url}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mb-2.5">
        <h4 className="text-gh-accent text-[11px] mb-1">URL</h4>
        <pre className="text-gh-secondary whitespace-pre-wrap break-all">
          {request.url || entry.url || "-"}
        </pre>
      </div>

      <div className="mb-2.5">
        <h4 className="text-gh-accent text-[11px] mb-1">Request Headers</h4>
        <pre className="text-gh-secondary whitespace-pre-wrap break-all">
          {formatHeaders(request.headers || entry.requestHeaders)}
        </pre>
      </div>

      {(request.postData || entry.postData) && (
        <div className="mb-2.5">
          <h4 className="text-gh-accent text-[11px] mb-1">Request Body</h4>
          <pre className="text-gh-secondary whitespace-pre-wrap break-all">
            {typeof request.postData === "object"
              ? (request.postData as { text?: string })?.text
              : request.postData || entry.postData || "(empty)"}
          </pre>
        </div>
      )}

      <div className="mb-2.5">
        <h4 className="text-gh-accent text-[11px] mb-1">Response Headers</h4>
        <pre className="text-gh-secondary whitespace-pre-wrap break-all">
          {formatHeaders(response.headers || entry.responseHeaders)}
        </pre>
      </div>

      {content.text && <ResponseBody content={content} />}

      {Object.keys(timings).length > 0 && (
        <div className="mb-2.5">
          <h4 className="text-gh-accent text-[11px] mb-1">Timing</h4>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(timings).map(
              ([key, val]) =>
                val != null &&
                val >= 0 && (
                  <span key={key} className="text-gh-secondary">
                    {key}:{" "}
                    <span className="text-gh-text font-semibold">
                      {val.toFixed(1)}ms
                    </span>
                  </span>
                )
            )}
          </div>
        </div>
      )}

      {entry.initiator && (
        <div className="mb-2.5">
          <h4 className="text-gh-accent text-[11px] mb-1">Initiator</h4>
          <pre className="text-gh-secondary whitespace-pre-wrap break-all">
            {entry.initiator.type || "other"}
          </pre>
          {(entry.initiator.originalSource || entry.initiator.url) && (
            <pre className="text-gh-purple text-[11px] mt-0.5">
              {entry.initiator.originalSource
                ? `${entry.initiator.originalSource}${entry.initiator.originalLine != null ? `:${entry.initiator.originalLine + 1}` : ""}${entry.initiator.originalColumn != null ? `:${entry.initiator.originalColumn + 1}` : ""}`
                : `${entry.initiator.url}${entry.initiator.lineNumber != null ? `:${entry.initiator.lineNumber + 1}` : ""}${entry.initiator.columnNumber != null ? `:${entry.initiator.columnNumber + 1}` : ""}`}
            </pre>
          )}
          {entry.initiator.stack && (
            <InitiatorStack stack={entry.initiator.stack} />
          )}
        </div>
      )}

      {entry.error && (
        <div className="mb-2.5">
          <h4 className="text-gh-accent text-[11px] mb-1">Error</h4>
          <pre className="text-gh-error whitespace-pre-wrap break-all">
            {entry.error}
          </pre>
        </div>
      )}

      <div className="flex gap-1.5 mt-2 pt-2 border-t border-gh-hover">
        <button
          className="px-2.5 py-1 border border-gh-border rounded bg-gh-hover text-gh-text text-[11px] cursor-pointer font-inherit hover:bg-gh-border hover:border-gh-accent hover:text-gh-accent"
          onClick={() => handleCopy("copy-curl")}
        >
          {copiedAction === "copy-curl" ? "Copied!" : "Copy cURL"}
        </button>
        {content.text && (
          <>
            <button
              className="px-2.5 py-1 border border-gh-border rounded bg-gh-hover text-gh-text text-[11px] cursor-pointer font-inherit hover:bg-gh-border hover:border-gh-accent hover:text-gh-accent"
              onClick={() => handleCopy("copy-response")}
            >
              {copiedAction === "copy-response"
                ? "Copied!"
                : "Copy Response"}
            </button>
            <button
              className="px-2.5 py-1 border border-gh-border rounded bg-gh-hover text-gh-text text-[11px] cursor-pointer font-inherit hover:bg-gh-border hover:border-gh-accent hover:text-gh-accent"
              onClick={() => handleCopy("copy-all")}
            >
              {copiedAction === "copy-all"
                ? "Copied!"
                : "Copy cURL + Response"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// WebSocket detail

function WsDetail({ ws }: { ws: WsLogEntry }) {
  const maxFrames = 100;

  return (
    <div
      className="col-span-3 py-2.5 border-t border-gh-border font-mono text-[11px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2.5">
        <h4 className="text-gh-accent text-[11px] mb-1">URL</h4>
        <pre className="text-gh-secondary whitespace-pre-wrap break-all">
          {ws.url || ""}
        </pre>
      </div>

      {ws.frames && ws.frames.length > 0 && (
        <div className="mb-2.5">
          <h4 className="text-gh-accent text-[11px] mb-1">
            Frames ({ws.frames.length})
          </h4>
          <div className="border border-gh-hover rounded overflow-hidden">
            <div className="grid grid-cols-[30px_1fr] gap-2 px-2 py-1 bg-gh-panel font-semibold text-gh-secondary border-b border-gh-border">
              <span>Dir</span>
              <span>Data</span>
            </div>
            {ws.frames.slice(0, maxFrames).map((f: WsFrame, i: number) => {
              const dir = f.direction === "sent" ? "\u2191" : "\u2193";
              const dirClass =
                f.direction === "sent"
                  ? "text-gh-success font-semibold"
                  : "text-gh-accent font-semibold";
              const data = f.payloadData || "";
              const truncated =
                data.length > 200 ? data.slice(0, 200) + "..." : data;
              return (
                <div
                  key={i}
                  className="grid grid-cols-[30px_1fr] gap-2 px-2 py-0.5 border-b border-gh-hover last:border-b-0"
                >
                  <span className={dirClass}>{dir}</span>
                  <span className="text-gh-secondary break-all text-[11px]">
                    {truncated}
                  </span>
                </div>
              );
            })}
            {ws.frames.length > maxFrames && (
              <div className="grid grid-cols-[30px_1fr] gap-2 px-2 py-0.5">
                <span />
                <span className="text-gh-secondary text-[11px]">
                  ... {ws.frames.length - maxFrames} more frames
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Main component

export function NetworkViewer({
  entries,
  currentTimeMs,
  webSocketLogs,
}: Props) {
  const [activeTypeFilter, setActiveTypeFilter] = useState("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [expandedWsIndex, setExpandedWsIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrolledToRef = useRef(-1);

  const processedEntries = useMemo(
    () =>
      entries.map((e, i) => ({
        entry: e,
        index: i,
        filterType: getFilterType(e),
      })),
    [entries]
  );

  const { closestIndex, visibleEntries, visibleCount } = useMemo(() => {
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

    if (closestDist >= 1500) closestIdx = -1;

    const filtered =
      activeTypeFilter === "all"
        ? visible
        : visible.filter((pe) => pe.filterType === activeTypeFilter);

    return {
      closestIndex: closestIdx,
      visibleEntries: filtered,
      visibleCount: filtered.length,
    };
  }, [processedEntries, currentTimeMs, activeTypeFilter]);

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
    [lastVisibleIndex]
  );

  useEffect(() => {
    lastScrolledToRef.current = -1;
  }, [entries]);

  const summaryText = useMemo(() => {
    let text = `${visibleCount}/${entries.length} requests`;
    if (activeTypeFilter !== "all") text += ` (${activeTypeFilter})`;
    if (webSocketLogs.length > 0) text += ` | ${webSocketLogs.length} WS`;
    return text;
  }, [visibleCount, entries.length, activeTypeFilter, webSocketLogs.length]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Filters + Summary */}
      <div className="flex justify-between items-center px-3 py-2 bg-gh-panel border-b border-gh-border shrink-0 flex-wrap gap-1.5">
        <div className="flex gap-1 flex-wrap">
          {FILTER_TYPES.map((type) => (
            <button
              key={type}
              className={`px-2 py-0.5 border rounded text-[11px] cursor-pointer ${
                activeTypeFilter === type
                  ? "bg-gh-accent-bg border-gh-accent-bg text-white"
                  : "bg-transparent border-gh-border text-gh-secondary hover:border-gh-accent hover:text-gh-text"
              }`}
              onClick={() => setActiveTypeFilter(type)}
            >
              {FILTER_LABELS[type]}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-gh-secondary">{summaryText}</span>
      </div>

      {/* Entries */}
      <div
        ref={containerRef}
        className="entries-scroll flex-1 overflow-y-auto overflow-x-hidden"
      >
        {/* Header */}
        <div className="grid grid-cols-[52px_1fr_48px_70px_65px] gap-2 px-3 py-1 bg-gh-bg border-b border-gh-border text-[11px] font-semibold text-gh-secondary sticky top-0 z-[1]">
          <span>Method</span>
          <span>URL</span>
          <span>Status</span>
          <span>Type</span>
          <span className="text-right">Size</span>
        </div>

        {/* Network entries */}
        {visibleEntries.map((pe, vi) => {
          const { entry, index } = pe;
          const request = entry.request || {};
          const response = entry.response || {};
          const content = response.content || {};
          const isActive = index === closestIndex;
          const isExpanded = index === expandedIndex;
          const isLast = vi === visibleEntries.length - 1;
          const statusCode = response.status || entry.status || 0;

          return (
            <div
              key={index}
              ref={isLast ? scrollToRef : undefined}
              className={`grid grid-cols-[52px_1fr_48px_70px_65px] gap-2 px-3 py-[5px] border-b border-gh-hover cursor-pointer text-xs items-center hover:bg-gh-panel ${
                isActive
                  ? "bg-gh-highlight border-l-[3px] border-l-gh-accent pl-[9px]"
                  : ""
              }`}
              onClick={() =>
                setExpandedIndex((prev) =>
                  prev === index ? null : index
                )
              }
            >
              <span className="font-semibold text-gh-text">
                {request.method || entry.method || "GET"}
              </span>
              <span
                className="overflow-hidden text-ellipsis whitespace-nowrap text-gh-secondary"
                title={request.url || entry.url || ""}
              >
                {truncateUrl(request.url || entry.url || "")}
              </span>
              <span
                className={`font-semibold text-center ${getStatusColorClass(statusCode)}`}
              >
                {statusCode || (entry.error ? "ERR" : "-")}
              </span>
              <span className="text-gh-secondary overflow-hidden text-ellipsis whitespace-nowrap">
                {entry.resourceType || content.mimeType || "-"}
              </span>
              <span className="text-gh-secondary text-right tabular-nums">
                {formatSize(content.size || entry.encodedDataLength)}
              </span>

              {isExpanded && <NetworkDetail entry={entry} />}
            </div>
          );
        })}

        {/* WebSocket section */}
        {webSocketLogs.length > 0 && (
          <>
            <div className="px-3 py-2 bg-gh-panel border-t border-gh-border border-b border-gh-border">
              <h3 className="text-xs font-semibold text-gh-purple">
                WebSocket Connections ({webSocketLogs.length})
              </h3>
            </div>
            {webSocketLogs.map((ws, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_80px_60px] gap-2 px-3 py-[5px] border-b border-gh-hover cursor-pointer text-xs items-center hover:bg-gh-panel"
                onClick={() =>
                  setExpandedWsIndex((prev) =>
                    prev === i ? null : i
                  )
                }
              >
                <span
                  className="overflow-hidden text-ellipsis whitespace-nowrap text-gh-purple"
                  title={ws.url || ""}
                >
                  {ws.url || ""}
                </span>
                <span className="text-gh-secondary text-center">
                  {(ws.frames || []).length} frames
                </span>
                <span
                  className={`font-semibold text-[11px] text-right ${ws.closed ? "text-gh-secondary" : "text-gh-success"}`}
                >
                  {ws.closed ? "Closed" : "Open"}
                </span>
                {expandedWsIndex === i && <WsDetail ws={ws} />}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
