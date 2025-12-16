import fs from 'fs';
import path from 'path';

const CHECKPOINT_DIR = path.join(process.cwd(), 'data', 'checkpoints');
const LEGACY_CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'legacy.json');
const NEW_CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'new.json');

/**
 * Ensures the checkpoint directory exists
 */
function ensureCheckpointDir(): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

/**
 * Saves checkpoint data to disk
 */
export function saveCheckpoint(
  legacy: Record<string, any[]>,
  newData: Record<string, any[]>
): void {
  ensureCheckpointDir();
  
  fs.writeFileSync(LEGACY_CHECKPOINT_FILE, JSON.stringify(legacy, null, 2), 'utf-8');
  fs.writeFileSync(NEW_CHECKPOINT_FILE, JSON.stringify(newData, null, 2), 'utf-8');
}

/**
 * Loads checkpoint data from disk
 */
export function loadCheckpoint(): {
  legacy: Record<string, any[]>;
  new: Record<string, any[]>;
} | null {
  try {
    if (!fs.existsSync(LEGACY_CHECKPOINT_FILE) || !fs.existsSync(NEW_CHECKPOINT_FILE)) {
      return null;
    }

    const legacyData = fs.readFileSync(LEGACY_CHECKPOINT_FILE, 'utf-8');
    const newData = fs.readFileSync(NEW_CHECKPOINT_FILE, 'utf-8');

    return {
      legacy: JSON.parse(legacyData),
      new: JSON.parse(newData),
    };
  } catch (error) {
    console.error('Error loading checkpoint:', error);
    return null;
  }
}

/**
 * Clears checkpoint data from disk
 */
export function clearCheckpoint(): void {
  try {
    if (fs.existsSync(LEGACY_CHECKPOINT_FILE)) {
      fs.unlinkSync(LEGACY_CHECKPOINT_FILE);
    }
    if (fs.existsSync(NEW_CHECKPOINT_FILE)) {
      fs.unlinkSync(NEW_CHECKPOINT_FILE);
    }
  } catch (error) {
    console.error('Error clearing checkpoint:', error);
    throw error;
  }
}

/**
 * Checks if checkpoint exists
 */
export function checkpointExists(): boolean {
  return fs.existsSync(LEGACY_CHECKPOINT_FILE) && fs.existsSync(NEW_CHECKPOINT_FILE);
}

