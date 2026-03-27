import express from "express";
import * as diskStore from "../storage/disk-store";
import { handleDriveVideoProxy } from "../utils/drive";

const router = express.Router();

router.get("/:id/video", async (req, res) => {
  console.log(`[Video Route] Incoming video request for ID: ${req.params.id}`);
  const metadata = diskStore.getRecordingMetadata(req.params.id);
  if (!metadata) {
    console.warn(`[Video Route] Recording not found for ID: ${req.params.id}`);
    return res.status(404).json({ ok: false, error: "Recording not found" });
  }

  const driveFileId = metadata.driveFileId as string | undefined;
  if (driveFileId) {
    console.log(`[Video Route] Proxying from Google Drive for ID: ${req.params.id}, Drive File ID: ${driveFileId}`);
    await handleDriveVideoProxy(driveFileId, req, res);
    return;
  }

  // Fallback to local file if not on Drive
  console.log(`[Video Route] Fallback to local file for ID: ${req.params.id} as no Drive File ID exists.`);
  const videoPath = diskStore.getVideoPath(req.params.id);
  if (!videoPath) {
    console.warn(`[Video Route] Local video file not found for ID: ${req.params.id}`);
    return res.status(404).json({ ok: false, error: "Video not found" });
  }
  console.log(`[Video Route] Serving local video file for ID: ${req.params.id} at path: ${videoPath}`);
  res.sendFile(videoPath);
});

export default router;
