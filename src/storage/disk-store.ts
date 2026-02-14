import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.join(__dirname, "..", "..", "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function generateId(): string {
  for (let i = 0; i < 10; i++) {
    const id = crypto.randomBytes(4).toString("hex");
    if (!fs.existsSync(path.join(DATA_DIR, id))) {
      return id;
    }
  }
  return crypto.randomBytes(8).toString("hex");
}

interface SaveRecordingParams {
  video: Buffer | null;
  consoleLogs: string;
  networkRequests: string;
  webSocketLogs?: string;
  metadata: string;
}

export async function saveRecording({ video, consoleLogs, networkRequests, webSocketLogs, metadata }: SaveRecordingParams): Promise<string> {
  const id = generateId();
  const dir = path.join(DATA_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  if (video) {
    fs.writeFileSync(path.join(dir, "recording.webm"), video);
  }

  fs.writeFileSync(path.join(dir, "console-logs.json"), consoleLogs || "[]");
  fs.writeFileSync(path.join(dir, "network-requests.json"), networkRequests || "{}");

  if (webSocketLogs) {
    fs.writeFileSync(path.join(dir, "websocket-logs.json"), webSocketLogs);
  }

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(metadata || "{}");
  } catch {}
  meta.id = id;
  meta.createdAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(meta, null, 2));

  return id;
}

export function exists(id: string): boolean {
  if (!id || !/^[a-f0-9]+$/.test(id)) return false;
  return fs.existsSync(path.join(DATA_DIR, id, "metadata.json"));
}

interface RecordingData {
  metadata: Record<string, unknown>;
  consoleLogs: unknown;
  networkRequests: unknown;
  webSocketLogs: unknown;
}

export function getRecording(id: string): RecordingData | null {
  if (!exists(id)) return null;
  const dir = path.join(DATA_DIR, id);

  const metadata = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf-8"));
  const consoleLogs = JSON.parse(fs.readFileSync(path.join(dir, "console-logs.json"), "utf-8"));
  const networkRequests = JSON.parse(fs.readFileSync(path.join(dir, "network-requests.json"), "utf-8"));

  let webSocketLogs: unknown = [];
  const wsPath = path.join(dir, "websocket-logs.json");
  if (fs.existsSync(wsPath)) {
    webSocketLogs = JSON.parse(fs.readFileSync(wsPath, "utf-8"));
  }

  return { metadata, consoleLogs, networkRequests, webSocketLogs };
}

export function getVideoPath(id: string): string | null {
  if (!exists(id)) return null;
  const videoPath = path.join(DATA_DIR, id, "recording.webm");
  if (!fs.existsSync(videoPath)) return null;
  return videoPath;
}
