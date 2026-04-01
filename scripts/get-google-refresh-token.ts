/**
 * Script to get Google OAuth2 refresh token
 * Run: npx tsx scripts/get-google-refresh-token.ts
 *
 * After getting the token, call:
 *   curl -X POST http://localhost:3000/api/auth/set-refresh-token \
 *     -H "Content-Type: application/json" \
 *     -d '{"refreshToken": "YOUR_REFRESH_TOKEN"}'
 */

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { execSync } from 'child_process';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.uploadfile',
];

// OOB (Out-of-Band) redirect URI - no registration needed
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

function readline(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function loadEnv(): { clientId: string; clientSecret: string } {
  if (!existsSync('.env')) {
    console.error('Error: .env file not found');
    process.exit(1);
  }

  const envContent = readFileSync('.env', 'utf-8');
  const lines = envContent.split('\n');

  let clientId = '';
  let clientSecret = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) continue;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=').trim();

    if (key === 'GOOGLE_CLIENT_ID') clientId = value;
    if (key === 'GOOGLE_CLIENT_SECRET') clientSecret = value;
  }

  if (!clientId || !clientSecret) {
    console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in .env');
    process.exit(1);
  }

  return { clientId, clientSecret };
}

async function main() {
  console.log('=== Google OAuth2 Refresh Token Generator ===\n');
  console.log('This script will help you get a refresh token for Google Drive access.\n');

  const { clientId, clientSecret } = loadEnv();

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  console.log(`Redirect URI: ${REDIRECT_URI} (no registration needed)\n`);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  console.log('Authorization URL:');
  console.log(authUrl);
  console.log('\nOpening browser...');

  try {
    execSync(`open "${authUrl}"`, { stdio: 'ignore' });
  } catch {
    console.log('Please open the URL above manually.');
  }

  const code = await readline('\nPaste the authorization code shown on the success page: ');

  try {
    console.log('\nExchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error('Error: No refresh token returned');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✓ Success! Refresh token obtained!');
    console.log('='.repeat(50));
    console.log('\nRefresh Token:');
    console.log(tokens.refresh_token);
    console.log('\n' + '='.repeat(50));
    console.log('\nNow set the token in the server memory:');
    console.log('\nMake sure the server is running, then run:');
    console.log('\ncurl -X POST http://localhost:3000/api/auth/set-refresh-token \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log(`  -d '{"refreshToken": "${tokens.refresh_token}"}'`);
    console.log('\nOr use this alternative (replace YOUR_TOKEN):');
    console.log(`echo '{"refreshToken":"YOUR_TOKEN"}' | curl -X POST http://localhost:3000/api/auth/set-refresh-token -H "Content-Type: application/json" -d @-`);
    console.log('');

  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();