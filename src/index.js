import './logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { bot, getMainMenuKeyboard, sendAdminAlert } from './telegramBot.js';
import { startOrderWatcher } from './orderWatcher.js';
import { startPricingEngine } from './pricingEngine.js';
import { loadConfig } from './configManager.js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

process.on('unhandledRejection', (reason) => {
  if (reason && reason.message && reason.message.includes('message is not modified')) {
    return;
  }
  console.warn('[Handled Rejection]', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Handled Exception]', err.message);
});

console.log('========================================');
console.log('⚡ BYBIT BUTLER DAEMON RUNNING...');
console.log('========================================');

const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
console.log('📱 Whitelisted Telegram Admin:', adminId);

const cfg = loadConfig();
console.log('⚙️ Configuration Loaded:');
console.log('   - Target Ad ID:', cfg.targetAdId);
console.log('   - Auto-Reprice:', cfg.autoRepriceEnabled ? 'ENABLED' : 'PAUSED');
console.log('   - Min Floor Price:', cfg.minFloorPrice, 'DZD');
console.log('   - Quantity Filter:', cfg.referenceAmount ? (cfg.referenceAmount + ' DZD') : 'None');
console.log('   - Refresh Rate:', (cfg.refreshIntervalMs / 1000) + 's');

// 1. Detect Host Public Outbound IP
async function detectOutboundIp() {
  try {
    const res = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
    const ip = res.data?.ip;
    console.log('========================================');
    console.log('📡 HOST PUBLIC OUTBOUND IP:', ip);
    console.log('========================================');
    return ip;
  } catch (err) {
    console.warn('[IP Detection Warning] Could not fetch public IP:', err.message);
    return null;
  }
}

// 2. Start background services (spaced to prevent rate-limit exhaustion)
startOrderWatcher(8000);
startPricingEngine(cfg.refreshIntervalMs || 10000);

// 3. Send startup notification with Host IP
detectOutboundIp().then(async (hostIp) => {
  const ipText = hostIp 
    ? `🌐 <b>Host Server IP</b>: <code>${hostIp}</code>\n👉 <i>Verify this IP is added to your Bybit API Key whitelist!</i>\n\n`
    : '';

  const startupMsg = `🎩 <b>ByBit Butler is ONLINE!</b>\n━━━━━━━━━━━━━━━━━━━━\n${ipText}⚡ <b>Phase 1: Dynamic Auto-Pricing Engine Active</b>\n• Refresh Rate: <b>5s</b>\n• Quantity Filter: <b>${cfg.referenceAmount || 'Any'} DZD</b>\n• Min Floor: <b>${cfg.minFloorPrice.toFixed(2)} DZD</b>\n\nTap below for controls:`;

  await sendAdminAlert(startupMsg, getMainMenuKeyboard());
  console.log('✅ Startup push notification delivered to Telegram.');
}).catch((err) => {
  console.log('ℹ️ Waiting for initial chat activation.');
});

console.log('🟢 Butler is running and listening for Telegram commands.');
