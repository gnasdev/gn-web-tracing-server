import express from "express";
import * as diskStore from "../storage/disk-store";

const router = express.Router();

router.get("/:id/video", (req, res) => {
  const videoPath = diskStore.getVideoPath(req.params.id);
  if (!videoPath) {
    return res.status(404).json({ ok: false, error: "Video not found" });
  }
  res.sendFile(videoPath);
});

export default router;
