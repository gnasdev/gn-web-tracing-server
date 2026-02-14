import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import type { TimelineMarker } from "../types";

interface Props {
  src: string;
  duration?: number;
  markers: TimelineMarker[];
  onTimeUpdate: (timeMs: number) => void;
  onSeeked: (timeMs: number) => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const min = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const sec = String(totalSec % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

export function VideoPlayer({
  src,
  duration: knownDurationMs,
  markers,
  onTimeUpdate,
  onSeeked,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastEmitRef = useRef(0);
  const isDraggingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [tooltipTime, setTooltipTime] = useState<string | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState(0);

  const getDurationSec = useCallback((): number => {
    const native = videoRef.current?.duration;
    if (native && Number.isFinite(native) && native > 0) return native;
    return (knownDurationMs || 0) / 1000;
  }, [knownDurationMs]);

  const markerDurationMs = knownDurationMs || (videoDuration > 0 ? videoDuration * 1000 : 0);
  const displayDurationMs = videoDuration > 0 ? videoDuration * 1000 : (knownDurationMs || 0);
  const ratio = displayDurationMs > 0 ? Math.min((currentTime / displayDurationMs) * 100, 100) : 0;

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      v.play();
    } else {
      v.pause();
    }
  }, []);

  const seekToRatio = useCallback(
    (r: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, r) * getDurationSec();
    },
    [getDurationSec]
  );

  const getMouseRatio = useCallback((clientX: number): number => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  // Mouse/touch drag on progress bar
  useEffect(() => {
    const onMouseMove = (e: globalThis.MouseEvent) => {
      if (isDraggingRef.current) {
        seekToRatio(getMouseRatio(e.clientX));
      }
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
    };
    const onTouchMove = (e: globalThis.TouchEvent) => {
      if (isDraggingRef.current && e.touches[0]) {
        seekToRatio(getMouseRatio(e.touches[0].clientX));
      }
    };
    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [seekToRatio, getMouseRatio]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const v = videoRef.current;
      if (!v) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(
            0,
            v.currentTime - (e.shiftKey ? 10 : 5)
          );
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = v.currentTime + (e.shiftKey ? 10 : 5);
          break;
        case "Digit1":
          v.playbackRate = 0.5;
          setSpeed(0.5);
          break;
        case "Digit2":
          v.playbackRate = 1;
          setSpeed(1);
          break;
        case "Digit3":
          v.playbackRate = 1.5;
          setSpeed(1.5);
          break;
        case "Digit4":
          v.playbackRate = 2;
          setSpeed(2);
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [togglePlayPause]);

  // Close speed menu on outside click
  useEffect(() => {
    if (!speedMenuOpen) return;
    const onClick = (e: globalThis.MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".speed-control")) {
        setSpeedMenuOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [speedMenuOpen]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const now = performance.now();
    if (now - lastEmitRef.current < 250) return;
    lastEmitRef.current = now;

    const ms = v.currentTime * 1000;
    setCurrentTime(ms);
    onTimeUpdate(ms);

    if (v.buffered.length > 0) {
      const bufferedEnd = v.buffered.end(v.buffered.length - 1);
      const dur = getDurationSec();
      setBuffered(dur > 0 ? (bufferedEnd / dur) * 100 : 0);
    }
  }, [onTimeUpdate, getDurationSec]);

  const handleSeeked = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const ms = v.currentTime * 1000;
    setCurrentTime(ms);
    onSeeked(ms);
  }, [onSeeked]);

  const handleLoadedMetadata = useCallback(() => {
    const dur = getDurationSec();
    setVideoDuration(dur);
  }, [getDurationSec]);

  const handleDurationChange = useCallback(() => {
    const dur = getDurationSec();
    setVideoDuration(dur);
  }, [getDurationSec]);

  const handleProgressMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      isDraggingRef.current = true;
      seekToRatio(getMouseRatio(e.clientX));
    },
    [seekToRatio, getMouseRatio]
  );

  const handleProgressTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      isDraggingRef.current = true;
      if (e.touches[0]) {
        seekToRatio(getMouseRatio(e.touches[0].clientX));
      }
    },
    [seekToRatio, getMouseRatio]
  );

  const handleProgressMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      const r = getMouseRatio(e.clientX);
      const t = r * getDurationSec() * 1000;
      setTooltipTime(formatTime(t));
      const rect = progressRef.current?.getBoundingClientRect();
      if (rect) setTooltipLeft(e.clientX - rect.left);
    },
    [getMouseRatio, getDurationSec]
  );

  const handleSpeedChange = useCallback((s: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s);
    setSpeedMenuOpen(false);
  }, []);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      const v = videoRef.current;
      if (v) {
        v.volume = val;
        v.muted = false;
      }
      setVolume(val);
      setMuted(false);
    },
    []
  );

  const handleMuteToggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        className="block w-full flex-1 min-h-0 object-contain bg-black cursor-pointer"
        onClick={togglePlayPause}
        onTimeUpdate={handleTimeUpdate}
        onSeeked={handleSeeked}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gh-panel border-b border-gh-border">
        {/* Play/Pause */}
        <button
          className="bg-transparent border-none text-gh-text text-sm cursor-pointer p-1 px-1.5 rounded hover:bg-gh-hover flex items-center justify-center w-7 h-7"
          title="Play/Pause (Space)"
          onClick={togglePlayPause}
        >
          {playing ? "\u23F8" : "\u25B6"}
        </button>

        {/* Current time */}
        <span className="text-[11px] text-gh-secondary tabular-nums whitespace-nowrap min-w-9">
          {formatTime(currentTime)}
        </span>

        {/* Progress bar */}
        <div
          ref={progressRef}
          className="progress-wrapper flex-1 relative h-5 flex items-center cursor-pointer"
          onMouseDown={handleProgressMouseDown}
          onTouchStart={handleProgressTouchStart}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={() => setTooltipTime(null)}
        >
          <div className="progress-bar w-full h-1 bg-gh-border rounded-sm relative overflow-visible">
            {/* Buffered */}
            <div
              className="absolute top-0 left-0 h-full bg-gh-muted rounded-sm pointer-events-none"
              style={{ width: `${buffered}%` }}
            />
            {/* Played */}
            <div
              className="absolute top-0 left-0 h-full bg-gh-accent rounded-sm pointer-events-none"
              style={{ width: `${ratio}%` }}
            />
            {/* Markers */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
              {markerDurationMs > 0 &&
                markers.map((m, i) => {
                  const pct = Math.min((m.timeMs / markerDurationMs) * 100, 100);
                  if (pct < 0 || pct > 100) return null;
                  return (
                    <div
                      key={i}
                      className="absolute -top-0.5 w-[3px] rounded-[1px] opacity-80 -translate-x-px"
                      style={{
                        left: `${pct}%`,
                        height: "calc(100% + 4px)",
                        backgroundColor: m.color,
                      }}
                      title={m.label || ""}
                    />
                  );
                })}
            </div>
          </div>
          {/* Handle */}
          <div
            className="progress-handle absolute top-1/2 w-3 h-3 bg-gh-accent rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${ratio}%` }}
          />
          {/* Tooltip */}
          {tooltipTime && (
            <div
              className="absolute bottom-full mb-1.5 bg-gh-hover text-gh-text text-[11px] px-1.5 py-0.5 rounded -translate-x-1/2 pointer-events-none whitespace-nowrap"
              style={{ left: tooltipLeft }}
            >
              {tooltipTime}
            </div>
          )}
        </div>

        {/* Duration */}
        <span className="text-[11px] text-gh-secondary tabular-nums whitespace-nowrap min-w-9">
          {formatTime(displayDurationMs)}
        </span>

        {/* Speed control */}
        <div className="speed-control relative">
          <button
            className="bg-transparent border-none text-gh-text text-[11px] cursor-pointer p-1 px-1.5 rounded hover:bg-gh-hover min-w-8 text-center"
            title="Playback Speed"
            onClick={(e) => {
              e.stopPropagation();
              setSpeedMenuOpen((v) => !v);
            }}
          >
            {speed}x
          </button>
          {speedMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1 bg-gh-hover border border-gh-border rounded-md overflow-hidden z-10">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`block w-full px-4 py-1 bg-transparent border-none text-xs cursor-pointer text-left whitespace-nowrap hover:bg-gh-border ${
                    s === speed
                      ? "text-gh-accent font-semibold"
                      : "text-gh-text"
                  }`}
                  onClick={() => handleSpeedChange(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Volume */}
        <div className="flex items-center gap-1">
          <button
            className="bg-transparent border-none text-gh-text text-sm cursor-pointer p-1 px-1.5 rounded hover:bg-gh-hover flex items-center justify-center"
            title="Mute"
            onClick={handleMuteToggle}
          >
            {muted || volume === 0 ? "\uD83D\uDD08" : "\uD83D\uDD0A"}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            className="volume-slider w-[60px] h-[3px] max-md:hidden"
          />
        </div>
      </div>
    </div>
  );
}
