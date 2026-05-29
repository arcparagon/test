const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require('@exclipz/bails');
const pino = require('pino');

async function startBot() {
  // Store session in the "auth_info" folder
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false   // we use pairing code, not QR
  });

  // Request an 8‑digit pairing code if not already registered
  if (!sock.authState.creds.registered) {
    const ownerNumber = '447463445574'; // your main WhatsApp number
    const code = await sock.requestPairingCode(ownerNumber);
    console.log(`\n🔐 Your pairing code: ${code}\n`);
    console.log('Enter this code in WhatsApp on your phone (Linked Devices > Link with phone number).');
  }

  // Save credentials whenever they are updated
  sock.ev.on('creds.update', saveCreds);

  // Connection handling
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('✅ Bot connected successfully!');
    } else if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log('👋 Logged out. Delete the "auth_info" folder to re-pair.');
      }
    }
  });

  return sock;
}

// Start the bot and catch any startup errors
startBot().catch(err => console.error('❌ Fatal error:', err));
