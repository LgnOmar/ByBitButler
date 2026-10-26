import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(__dirname, '..', 'butler.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function append(level, args) {
  const ts = new Date().toISOString();
  const text = args.map(a => (typeof a === 'object' && a !== null ? JSON.stringify(a) : a)).join(' ');
  logStream.write(`[${ts}] [${level}] ${text}\n`);
}

const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args) => { origLog(...args); append('INFO', args); };
console.warn = (...args) => { origWarn(...args); append('WARN', args); };
console.error = (...args) => { origError(...args); append('ERROR', args); };
