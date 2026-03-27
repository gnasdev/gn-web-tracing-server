import fs from "fs";
import { Readable } from "stream";
import { google, drive_v3 } from "googleapis";
import type { Request, Response } from "express";

// Ensure you have GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to your service account JSON file
// or use other standard Google auth mechanisms.
// Set GOOGLE_DRIVE_FOLDER_ID if you want to upload to a specific folder.
let _driveClient: drive_v3.Drive;

function getDriveClient(): drive_v3.Drive {
  if (_driveClient) return _driveClient;

  let auth: any;
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  } else {
    auth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
      ],
    });
  }

  _driveClient = google.drive({ version: "v3", auth });
  return _driveClient;
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
  const res = await getDriveClient().files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
    supportsAllDrives: true,
  });

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
  const res = await getDriveClient().files.create({
    requestBody: fileMetadata,
    media: media,
    fields: "id",
    supportsAllDrives: true,
  });

  if (!res.data.id) {
    throw new Error("Upload failed, no file ID returned from Google Drive.");
  }

  console.log(`[Drive] Logs upload complete. Drive File ID: ${res.data.id}`);
  return res.data.id;
}

export async function fetchLogsFromDrive(fileId: string): Promise<any> {
  console.log(`[Drive] Fetching logs from Drive. File ID: ${fileId}`);
  const res = await getDriveClient().files.get({
    fileId,
    alt: "media",
    supportsAllDrives: true,
  }, { responseType: "stream" });
  
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
  try {
    await getDriveClient().files.delete({
      fileId,
      supportsAllDrives: true,
    });
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
    const options: any = {
      responseType: "stream",
      headers: {
        "Accept-Encoding": "identity" // Disable gaxios native decompression to preserve exact Content-Length
      }
    };
    
    if (req.headers.range) {
      options.headers.Range = req.headers.range;
    }

    console.log(`[Drive Proxy] Requesting file from Drive. File ID: ${fileId}, Range: ${req.headers.range || 'None'}`);

    const driveRes = await getDriveClient().files.get({
      fileId,
      alt: "media",
      supportsAllDrives: true,
    }, options);
    
    console.log(`[Drive Proxy] Got response from Drive. Status: ${driveRes.status}`);
    console.log(`[Drive Proxy] Drive Headers:`, JSON.stringify(driveRes.headers));

    // If the browser aborted connection while Google API was resolving
    if (res.destroyed || req.destroyed) {
      if (driveRes.data && !driveRes.data.destroyed) {
        driveRes.data.destroy();
      }
      return;
    }

    res.status(driveRes.status);
    
    // Explicitly enforce MIME type to guarantee Safari/Chrome HTML5 <video> decoder acceptance
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Accept-Ranges', 'bytes'); // Guarantee seeking compatibility
    
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
