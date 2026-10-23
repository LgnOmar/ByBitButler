import path from 'path';
import { fileURLToPath } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;

console.log('--- Testing Telegram Bot Credentials ---');
console.log('Bot Token:', token ? (token.substring(0, 10) + '...') : 'MISSING');
console.log('Admin Chat ID:', adminId || 'MISSING');

if (!token || !adminId) {
  console.error('❌ Token or Admin ID is missing in .env!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

async function checkTelegram() {
  try {
    const me = await bot.getMe();
    console.log(`✅ Telegram Bot Verified: @${me.username} (${me.first_name}) [ID: ${me.id}]`);
    
    console.log(`📡 Sending test message to Admin ID: ${adminId}...`);
    const sent = await bot.sendMessage(adminId, '🎩 *Hello from ByBit Butler!*\n\nYour private Telegram command desk is connected successfully.\nAll systems are green. 🚀', {
      parse_mode: 'Markdown'
    });
    console.log(`✅ Message delivered successfully! Message ID: ${sent.message_id}`);
  } catch (err) {
    console.error('❌ Telegram Test Failed:', err.message);
  }
}

checkTelegram();
