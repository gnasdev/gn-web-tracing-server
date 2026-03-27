import express from "express";
import * as diskStore from "../storage/disk-store";

const router = express.Router();

router.get("/:id", async (req, res) => {
  try {
    const data = await diskStore.getRecording(req.params.id);
    if (!data) {
      return res.status(404).json({ ok: false, error: "Recording not found" });
    }
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error(`Error resolving recording ${req.params.id}:`, err);
    res.status(500).json({ ok: false, error: err.message || "Internal View Resolve Error" });
  }
});

export default router;
