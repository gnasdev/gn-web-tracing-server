import express from "express";
import multer from "multer";
import * as diskStore from "../storage/disk-store";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max video
    fieldSize: 50 * 1024 * 1024, // 50MB max per text field
  },
});

router.post("/", upload.single("video"), async (req, res) => {
  try {
    const id = await diskStore.saveRecording({
      video: req.file ? req.file.buffer : null,
      consoleLogs: req.body.consoleLogs,
      networkRequests: req.body.networkRequests,
      webSocketLogs: req.body.webSocketLogs,
      metadata: req.body.metadata,
    });

    const url = `${req.protocol}://${req.get("host")}/view/${id}`;
    res.status(201).json({ ok: true, id, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

export default router;
