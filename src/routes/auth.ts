import { Router } from 'express';
import { setRefreshToken, getRefreshToken } from '../utils/drive.js';

const router = Router();

// Get current refresh token status (without exposing the token)
router.get('/auth-status', (req, res) => {
  const hasToken = !!getRefreshToken();
  res.json({
    hasRefreshToken: hasToken,
    clientIdConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

// Set refresh token (call this after getting token from get-google-refresh-token script)
router.post('/set-refresh-token', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  setRefreshToken(refreshToken);
  console.log('[Auth] Refresh token set in memory');

  res.json({ success: true, message: 'Refresh token set successfully' });
});

export default router;