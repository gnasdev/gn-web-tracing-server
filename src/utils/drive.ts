import fs from "fs";
import { Readable } from "stream";
import { google, drive_v3, OAuth2Client } from "googleapis";
import type { Request, Response } from "express";

// Store OAuth2 client and refresh token in memory
let _oauth2Client: OAuth2Client | null = null;
let _refreshToken: string | null = null;
let _driveClient: drive_v3.Drive;

function getOAuth2Client(): OAuth2Client {
  if (_oauth2Client) return _oauth2Client;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required for OAuth2');
  }

  _oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');
  return _oauth2Client;
}

function initializeOAuth(): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  // Skip if using service account
  if (!clientId || !clientSecret) return;

  const oauth2Client = getOAuth2Client();

  // Check if we have a stored refresh token
  if (_refreshToken) {
    oauth2Client.setCredentials({
      refresh_token: _refreshToken,
    });
  }
}

export function setRefreshToken(token: string): void {
  _refreshToken = token;
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: token,
  });
}

export function getRefreshToken(): string | null {
  return _refreshToken;
}

function getDriveClient(): drive_v3.Drive {
  // If already initialized, return cached client
  if (_driveClient) return _driveClient;

  let auth: any;

  // Check for OAuth2 credentials first
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientId && clientSecret) {
    const oauth2Client = getOAuth2Client();

    // Set credentials if we have a refresh token in memory
    if (_refreshToken) {
      oauth2Client.setCredentials({
        refresh_token: _refreshToken,
      });
    }

    auth = oauth2Client;
  } else {
    // Use service account or default credentials
    auth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com.auth/drive.readonly",
      ],
    });
  }

  _driveClient = google.drive({ version: "v3", auth });

  // Add token refresh interceptor
  _driveClient = google.drive({
    version: "v3",
    auth: {
      ...auth,
      // Override getAccessToken to handle token refresh
    }
  } as any);

  return _driveClient;
}

// Create a fresh Drive client (useful after token refresh)
function createDriveClient(): drive_v3.Drive {
  let auth: any;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientId && clientSecret) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');
    if (_refreshToken) {
      oauth2Client.setCredentials({
        refresh_token: _refreshToken,
      });
    }
    auth = oauth2Client;
  } else {
    auth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
  }

  return google.drive({ version: "v3", auth });
}

// Wrapper to handle auth errors and retry
async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check if it's a 401 (unauthorized) - token might be invalid/expired
    if (error.response?.status === 401 || error.message?.includes('invalid_grant')) {
      console.log('[Drive] Token expired or invalid. Please re-authenticate.');
      console.log('[Drive] Run: npm run get-google-refresh-token');
      throw new Error('Google refresh token expired. Please re-authenticate with: npm run get-google-refresh-token');
    }
    throw error;
  }
}

export async function uploadVideoToDrive(
  localVideoFilePath: string,
  filename: string
): Promise<string> {
  const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const fileMetadata = {
    name: filename,
    parents: FOLDER_ID ? [FOLDER_ID] : undefined,
  };

  const media = {
    mimeType: "video/webm",
    body: fs.createReadStream(localVideoFilePath),
  };

  console.log(`[Drive] Starting video upload to Drive. Filename: ${filename}, Local Path: ${localVideoFilePath}`);

  const client = createDriveClient();
  const res = await withAuthRetry(() => client.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
    supportsAllDrives: true,
  }));

  if (!res.data.id) {
    console.error(`[Drive] Upload failed for filename: ${filename}, no file ID returned.`);
    throw new Error("Upload failed, no file ID returned from Google Drive.");
  }

  console.log(`[Drive] Upload complete. Drive File ID: ${res.data.id} for filename: ${filename}`);
  return res.data.id;
}

export async function uploadLogsToDrive(
  filename: string,
  logsString: string
): Promise<string> {
  const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const fileMetadata = {
    name: filename,
    parents: FOLDER_ID ? [FOLDER_ID] : undefined,
  };

  const media = {
    mimeType: "application/json",
    body: Readable.from(logsString),
  };

  console.log(`[Drive] Starting logs upload to Drive. Filename: ${filename}`);

  const client = createDriveClient();
  const res = await withAuthRetry(() => client.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
    supportsAllDrives: true,
  }));

  if (!res.data.id) {
    throw new Error("Upload failed, no file ID returned from Google Drive.");
  }

  console.log(`[Drive] Logs upload complete. Drive File ID: ${res.data.id}`);
  return res.data.id;
}

export async function fetchLogsFromDrive(fileId: string): Promise<any> {
  console.log(`[Drive] Fetching logs from Drive. File ID: ${fileId}`);

  const client = createDriveClient();
  const res = await withAuthRetry(() => client.files.get({
    fileId,
    alt: "media",
    supportsAllDrives: true,
  }, { responseType: "stream" }));

  return new Promise((resolve, reject) => {
    let data = '';
    res.data.on('data', (chunk: string | Buffer) => { data += chunk; });
    res.data.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    res.data.on('error', reject);
  });
}

export async function deleteVideoFromDrive(fileId: string): Promise<void> {
  console.log(`[Drive] Deleting video from Drive. File ID: ${fileId}`);

  const client = createDriveClient();
  try {
    await withAuthRetry(() => client.files.delete({
      fileId,
      supportsAllDrives: true,
    }));
    console.log(`[Drive] Successfully deleted video from Drive. File ID: ${fileId}`);
  } catch (error) {
    console.error(`[Drive] Failed to delete video from Drive. File ID: ${fileId}`, error);
    throw error;
  }
}

export async function handleDriveVideoProxy(
  fileId: string,
  req: Request,
  res: Response
): Promise<void> {
  try {
    const client = createDriveClient();

    const options: any = {
      responseType: "stream",
      headers: {
        "Accept-Encoding": "identity"
      }
    };

    if (req.headers.range) {
      options.headers.Range = req.headers.range;
    }

    console.log(`[Drive Proxy] Requesting file from Drive. File ID: ${fileId}, Range: ${req.headers.range || 'None'}`);

    const driveRes = await withAuthRetry(() => client.files.get({
      fileId,
      alt: "media",
      supportsAllDrives: true,
    }, options));

    console.log(`[Drive Proxy] Got response from Drive. Status: ${driveRes.status}`);
    console.log(`[Drive Proxy] Drive Headers:`, JSON.stringify(driveRes.headers));

    if (res.destroyed || req.destroyed) {
      if (driveRes.data && !driveRes.data.destroyed) {
        driveRes.data.destroy();
      }
      return;
    }

    res.status(driveRes.status);

    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Accept-Ranges', 'bytes');

    const getHeader = (key: string) => {
      const hdrs = driveRes.headers as any;
      if (typeof hdrs.get === 'function') {
        return hdrs.get(key);
      }
      return hdrs[key];
    };

    const contentLength = getHeader('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = getHeader('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    console.log(`[Drive Proxy] Proxying stream to client. Content-Length: ${contentLength || 'None'}, Content-Range: ${contentRange || 'None'}`);

    driveRes.data.on("error", (err: unknown) => {
      console.error(`[Drive Proxy] Stream error during proxy for File ID ${fileId}:`, err);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });

    res.on("close", () => {
      if (!driveRes.data.destroyed) {
        driveRes.data.destroy();
      }
    });

    driveRes.data.pipe(res);
  } catch (error: any) {
    if (error.response?.status === 416) {
      const contentRange = error.response.headers && error.response.headers['content-range'];
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      res.status(416).end();
      return;
    }
    console.error(`[Drive Proxy] Error proxying Drive stream for File ID ${fileId}:`, error.message || error);
    if (!res.headersSent) {
      const status = error.response?.status || 500;
      res.status(status).end();
    }
  }
}

// Initialize OAuth on module load
initializeOAuth();