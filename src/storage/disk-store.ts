import fs from "fs";
import path from "path";
import crypto from "crypto";
import { uploadVideoToDrive, deleteVideoFromDrive, uploadLogsToDrive, fetchLogsFromDrive } from "../utils/drive";

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
  videoPath: string | null;
  consoleLogs: string;
  networkRequests: string;
  webSocketLogs?: string;
  metadata: string;
}

export async function saveRecording({ videoPath, consoleLogs, networkRequests, webSocketLogs, metadata }: SaveRecordingParams): Promise<string> {
  const id = generateId();
  const dir = path.join(DATA_DIR, id);
  console.log(`[Disk Store] Saving new recording. ID: ${id}, Target Dir: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(metadata || "{}");
  } catch {}
  meta.id = id;
  meta.createdAt = new Date().toISOString();

  // 1. Upload Logs to Google Drive
  console.log(`[Disk Store] Compiling logs for recording ${id}.`);
  try {
    const combinedLogs = {
      consoleLogs: JSON.parse(consoleLogs || "[]"),
      networkRequests: JSON.parse(networkRequests || "{}"),
      webSocketLogs: webSocketLogs ? JSON.parse(webSocketLogs) : []
    };
    
    console.log(`Uploading bundled logs for recording ${id} to Google Drive...`);
    meta.driveLogsId = await uploadLogsToDrive(`logs-${id}.json`, JSON.stringify(combinedLogs));
    console.log(`Successfully uploaded logs. Drive File ID: ${meta.driveLogsId}`);
  } catch (e: any) {
    console.error(`CRITICAL: Logs upload failed for ${id}:`, e.message || e);
    // Continue despite log failure, try to secure video if present
  }

  // 2. Upload Video to Google Drive
  if (videoPath) {
    console.log(`Uploading video for recording ${id} to Google Drive...`);
    try {
      meta.driveFileId = await uploadVideoToDrive(videoPath, `recording-${id}.webm`);
      console.log(`Successfully uploaded. Drive File ID: ${meta.driveFileId}`);
    } catch (e: any) {
      console.error(`Upload failed for ${id}:`, e.message || e);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        console.error(`Cleaned up incomplete recording directory for ${id}.`);
      } catch (rmError) {}
      throw e;
    } finally {
      // Clean up the enormous temporal upload file
      try {
        if (fs.existsSync(videoPath)) fs.rmSync(videoPath, { force: true });
      } catch (e) {}
    }
  }

  // 3. Save lightweight Local Metadata
  try {
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(meta, null, 2));
  } catch (e: any) {
    console.error(`Local metadata save failed for ${id}. Rolling back Google Drive upload...`);
    if (meta.driveFileId) {
      try {
        await deleteVideoFromDrive(meta.driveFileId as string);
        console.log(`Successfully rolled back orphaned Drive file ${meta.driveFileId}`);
      } catch (deleteError: any) {
        console.error(`CRITICAL: Failed to rollback Drive file ${meta.driveFileId}:`, deleteError.message || deleteError);
      }
    }
    // Local cleanup on critical failure
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (rmError) {}
    throw e;
  }

  return id;
}

export function exists(id: string): boolean {
  if (!id || !/^[a-f0-9]+$/.test(id)) return false;
  return fs.existsSync(path.join(DATA_DIR, id, "metadata.json"));
}

export function getRecordingMetadata(id: string): Record<string, unknown> | null {
  if (!exists(id)) return null;
  const dir = path.join(DATA_DIR, id);
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf-8"));
  } catch {
    return null;
  }
}

interface RecordingData {
  metadata: Record<string, unknown>;
  consoleLogs: unknown;
  networkRequests: unknown;
  webSocketLogs: unknown;
}

export async function getRecording(id: string): Promise<RecordingData | null> {
  if (!exists(id)) return null;
  const dir = path.join(DATA_DIR, id);

  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf-8"));
    
    // Serve purely from Google Drive if log ID is present (The Cloud migration logic)
    if (metadata.driveLogsId) {
      const logs = await fetchLogsFromDrive(metadata.driveLogsId as string);
      return { metadata, ...logs };
    }

    // Fallback: Legacy local files support for pre-migration logs
    const consoleLogs = JSON.parse(fs.readFileSync(path.join(dir, "console-logs.json"), "utf-8"));
    const networkRequests = JSON.parse(fs.readFileSync(path.join(dir, "network-requests.json"), "utf-8"));

    let webSocketLogs: unknown = [];
    const wsPath = path.join(dir, "websocket-logs.json");
    if (fs.existsSync(wsPath)) {
      webSocketLogs = JSON.parse(fs.readFileSync(wsPath, "utf-8"));
    }

    return { metadata, consoleLogs, networkRequests, webSocketLogs };
  } catch (error) {
    console.error(`Failed to parse recording JSON data for ${id}:`, error);
    return null;
  }
}

export function getVideoPath(id: string): string | null {
  if (!exists(id)) return null;
  const videoPath = path.join(DATA_DIR, id, "recording.webm");
  if (!fs.existsSync(videoPath)) return null;
  return videoPath;
}
