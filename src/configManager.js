import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const defaultConfig = {
  autoRepriceEnabled: false,
  targetAdId: "2113267925914439680",
  minFloorPrice: 255.00,
  undercutBuffer: 0.01,
  referenceAmount: "5000",
  refreshIntervalMs: 5000,
  lastTargetPrice: null,
  lastCompetitorPrice: null,
  lastCheckTime: null,
  lastAction: "Initialized"
};

export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('[Config Error] Could not load config.json:', err.message);
  }
  return { ...defaultConfig };
}

export function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Config Error] Could not save config.json:', err.message);
    return false;
  }
}

export function updateConfig(partial) {
  const current = loadConfig();
  const updated = { ...current, ...partial };
  saveConfig(updated);
  return updated;
}
