import express from "express";
import cors from "cors";
import path from "path";
import uploadRouter from "./routes/upload";
import recordingsRouter from "./routes/recordings";
import videoRouter from "./routes/video";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - allow chrome-extension:// origins and localhost
app.use(
  cors({
    origin: (_origin, callback) => {
      callback(null, true); // Allow all for MVP
    },
  })
);

// Static files
app.use(express.static(path.join(__dirname, "..", "public")));

// API routes
app.use("/api/recordings", uploadRouter);
app.use("/api/recordings", recordingsRouter);
app.use("/api/recordings", videoRouter);

// Viewer route - serve viewer.html for /view/:id
app.get("/view/:id", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "viewer.html"));
});

app.listen(PORT, () => {
  console.log(`ns-tracing-server running at http://localhost:${PORT}`);
});
