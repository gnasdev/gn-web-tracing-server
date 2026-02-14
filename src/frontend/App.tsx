import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  RecordingMetadata,
  ConsoleLogEntry,
  NetworkLogEntry,
  WsLogEntry,
  TimelineMarker,
} from "./types";
import { VideoPlayer } from "./components/VideoPlayer";
import { ConsoleViewer } from "./components/ConsoleViewer";
import { NetworkViewer } from "./components/NetworkViewer";

type Tab = "console" | "network";

export function App() {
  const [metadata, setMetadata] = useState<RecordingMetadata | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [networkRequests, setNetworkRequests] = useState<NetworkLogEntry[]>([]);
  const [webSocketLogs, setWebSocketLogs] = useState<WsLogEntry[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("console");
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  useEffect(() => {
    const pathParts = window.location.pathname.split("/");
    const recordingId =
      pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];

    if (!recordingId) {
      setError(true);
      setLoading(false);
      return;
    }

    fetch(`/api/recordings/${recordingId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (!data.ok) throw new Error("Not found");

        const meta: RecordingMetadata = data.metadata;
        const st =
          meta.startTime || new Date(meta.timestamp || "").getTime();
        setStartTime(st);
        setMetadata(meta);

        document.title = `ns-tracing - ${meta.url || "Recording"}`;

        const logs: ConsoleLogEntry[] = (data.consoleLogs || [])
          .map((e: ConsoleLogEntry) => ({
            ...e,
            relativeMs: e.timestamp - st,
          }))
          .sort(
            (a: ConsoleLogEntry, b: ConsoleLogEntry) =>
              a.timestamp - b.timestamp
          );
        setConsoleLogs(logs);

        let rawNet: NetworkLogEntry[] = [];
        const nd = data.networkRequests;
        if (nd && !Array.isArray(nd) && nd.log && nd.log.entries) {
          rawNet = nd.log.entries;
        } else if (Array.isArray(nd)) {
          rawNet = nd;
        }
        const netEntries: NetworkLogEntry[] = rawNet
          .map((e: NetworkLogEntry) => {
            let relativeMs = 0;
            if (e.wallTime) {
              relativeMs = e.wallTime * 1000 - st;
            } else if (e.timestamp) {
              relativeMs = e.timestamp * 1000 - st;
            }
            return { ...e, relativeMs };
          })
          .sort(
            (a: NetworkLogEntry, b: NetworkLogEntry) =>
              a.relativeMs - b.relativeMs
          );
        setNetworkRequests(netEntries);
        setWebSocketLogs(data.webSocketLogs || []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const handleTimeUpdate = useCallback((ms: number) => {
    setCurrentTimeMs(ms);
  }, []);

  const markers = useMemo((): TimelineMarker[] => {
    const m: TimelineMarker[] = [];

    for (const entry of consoleLogs) {
      const level =
        entry.source === "exception"
          ? "error"
          : entry.source === "browser"
            ? entry.level || "info"
            : entry.level || "log";
      if (level === "error") {
        m.push({
          timeMs: entry.relativeMs,
          color: "#f85149",
          label: `Error: ${(entry.message || entry.args?.[0]?.description || "").slice(0, 80)}`,
        });
      }
    }

    for (const entry of networkRequests) {
      const url = entry.request?.url || entry.url || "";
      const method = entry.request?.method || entry.method || "GET";
      m.push({
        timeMs: entry.relativeMs,
        color: "#58a6ff",
        label: `${method} ${url}`.slice(0, 80),
      });
    }

    return m;
  }, [consoleLogs, networkRequests]);

  const videoSrc = useMemo(() => {
    const pathParts = window.location.pathname.split("/");
    const recordingId =
      pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
    return `/api/recordings/${recordingId}/video`;
  }, []);

  const formatDuration = (ms: number | undefined): string => {
    if (!ms) return "";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${sec}s`;
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col bg-gh-bg text-gh-bright font-mono text-[13px]">
        <div className="flex flex-1 items-center justify-center text-gh-secondary text-sm">
          Loading recording...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-gh-bg text-gh-bright font-mono text-[13px]">
        <div className="flex flex-1 flex-col items-center justify-center">
          <h2 className="text-gh-error mb-2">Recording not found</h2>
          <p className="text-gh-secondary">
            The recording you&apos;re looking for doesn&apos;t exist or has been
            deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gh-bg text-gh-bright font-mono text-[13px]">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-gh-panel border-b border-gh-border">
        <h1 className="text-[15px] font-semibold text-white">ns-tracing</h1>
        <div className="flex gap-4 text-xs text-gh-secondary">
          <span>{metadata?.url || ""}</span>
          <span>{formatDuration(metadata?.duration)}</span>
        </div>
      </header>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-[50vw_50vw] flex-1 min-h-0 overflow-hidden max-md:grid-cols-1 max-md:grid-rows-[auto_1fr] max-md:overflow-auto">
        {/* Video section */}
        <section className="flex flex-col bg-black border-r border-gh-border min-h-0 max-md:border-r-0 max-md:border-b max-md:max-h-[40vh]">
          <VideoPlayer
            src={videoSrc}
            duration={metadata?.duration}
            markers={markers}
            onTimeUpdate={handleTimeUpdate}
            onSeeked={handleTimeUpdate}
          />
        </section>

        {/* Logs panel */}
        <div className="flex flex-col min-h-0">
          {/* Tab bar */}
          <div className="flex bg-gh-panel border-b border-gh-border shrink-0">
            <button
              className={`flex-1 px-4 py-2 bg-transparent border-none border-b-2 text-[13px] font-semibold cursor-pointer ${
                activeTab === "console"
                  ? "text-gh-text border-gh-accent"
                  : "text-gh-secondary border-transparent hover:text-gh-text"
              }`}
              onClick={() => setActiveTab("console")}
            >
              Console
            </button>
            <button
              className={`flex-1 px-4 py-2 bg-transparent border-none border-b-2 text-[13px] font-semibold cursor-pointer ${
                activeTab === "network"
                  ? "text-gh-text border-gh-accent"
                  : "text-gh-secondary border-transparent hover:text-gh-text"
              }`}
              onClick={() => setActiveTab("network")}
            >
              Network
            </button>
          </div>

          {/* Tab content */}
          {activeTab === "console" && (
            <ConsoleViewer
              entries={consoleLogs}
              startTime={startTime}
              currentTimeMs={currentTimeMs}
            />
          )}
          {activeTab === "network" && (
            <NetworkViewer
              entries={networkRequests}
              startTime={startTime}
              currentTimeMs={currentTimeMs}
              webSocketLogs={webSocketLogs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
