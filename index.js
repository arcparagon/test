const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers
} = require('@exclipz/bails');
const pino = require('pino');

const OWNER_NUMBER = '447463445574'; // your WhatsApp number
const RETRY_DELAY = 10_000; // 10 seconds before retrying a failed pairing attempt

let pairingInProgress = false; // prevent overlapping pairing requests

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    connectTimeoutMs: 60_000,
    qrTimeout: 0, // disable QR timeout so we don't get logged out
  });

  sock.ev.on('creds.update', saveCreds);

  // Handle all connection updates
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // Log important events
    if (connection === 'open') {
      console.log('✅ Connection opened');
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'unknown';
      console.log(`❌ Connection closed (status: ${statusCode}, reason: ${reason})`);

      // Do NOT reconnect if we were logged out (status 401)
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Reconnecting:', shouldReconnect);
      if (!shouldReconnect) {
        console.log('👋 Logged out permanently. Delete the "auth_info" folder and redeploy.');
      }
      // The library will automatically reconnect if shouldReconnect is true, so we do nothing here.
    }

    // If we are already registered, nothing else to do
    if (sock.authState.creds.registered) {
      return;
    }

    // ---------- PAIRING CODE LOGIC ----------
    // Only attempt pairing when the socket becomes 'open' and we aren't already trying
    if (connection === 'open' && !pairingInProgress) {
      pairingInProgress = true;
      try {
        console.log('🔐 Requesting pairing code for', OWNER_NUMBER);
        const code = await sock.requestPairingCode(OWNER_NUMBER);
        // If we reach here, the code was retrieved successfully
        console.log(`\n🎉 Your pairing code: ${code}\n`);
        console.log('Enter this code on your phone: WhatsApp → Linked Devices → Link with phone number.');
        // No need to retry further, the code is printed
        // After entering the code, the socket will update creds and register automatically.
      } catch (err) {
        console.error('❌ Failed to request pairing code:', err.message);
        // Wait a bit, then allow a retry on the next 'open' event
        setTimeout(() => {
          pairingInProgress = false;
          console.log('⏳ Retry pairing enabled for the next connection.');
        }, RETRY_DELAY);
      }
    }
  });

  return sock;
}

// Start the bot – any unhandled rejection will be logged but not crash the process
startBot().catch(err => console.error('💥 Fatal error in startBot:', err));
