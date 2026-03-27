import express from "express";
import multer from "multer";
import * as diskStore from "../storage/disk-store";

import os from "os";

const router = express.Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => {
      cb(null, `tracing-upload-${Date.now()}-${file.originalname}`);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max video
    fieldSize: 50 * 1024 * 1024, // 50MB max per text field
  },
});

router.post("/", (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      console.error(`[Upload Route] Error during file parse (Multer):`, err.message || err);
      return res.status(400).json({ ok: false, error: err.message || "Upload error" });
    }
    next();
  });
}, async (req, res) => {
  console.log(`[Upload Route] Incoming recording upload. Video file present: ${!!req.file}`);
  try {
    const id = await diskStore.saveRecording({
      videoPath: req.file ? req.file.path : null,
      consoleLogs: req.body.consoleLogs,
      networkRequests: req.body.networkRequests,
      webSocketLogs: req.body.webSocketLogs,
      metadata: req.body.metadata,
    });

    const url = `${req.protocol}://${req.get("host")}/view/${id}`;
    console.log(`[Upload Route] Successfully saved recording. ID: ${id}, URL: ${url}`);
    res.status(201).json({ ok: true, id, url });
  } catch (e) {
    console.error(`[Upload Route] Error saving recording:`, e);
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

export default router;
