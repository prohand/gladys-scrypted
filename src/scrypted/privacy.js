// -----------------------------------------------------------------------------
// The Gladys-side privacy gate of the cameras (the `enabled` feature).
//
// A camera turned off in Gladys keeps working in Scrypted (recording, its own
// notifications): only Gladys stops using it. The integration then takes no
// picture of it (timer, motion, scene, widget, Gladys asking) and drops what
// it sees (motion, object detections), while its other features (doorbell
// button, battery, light, siren) carry on.
//
// The choice is kept in /data, by Scrypted device id (it survives a rename):
// a restart neither shows a camera the user hid nor hides one. A camera is
// enabled unless listed, so a lost or unreadable file never hides anything.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'privacy' });

export const DATA_DIR = process.env.DATA_DIR ?? '/data';
const FILE = 'disabled-cameras.json';

export class PrivacyGate {
  /** @param {{ dataDir?: string }} [options] */
  constructor({ dataDir = DATA_DIR } = {}) {
    this.dataDir = dataDir;
    /** @type {Set<string>} Scrypted ids of the cameras disabled in Gladys */
    this.disabled = new Set();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(join(this.dataDir, FILE), 'utf8'));
      const list = Array.isArray(parsed?.disabled) ? parsed.disabled : [];
      this.disabled = new Set(list.filter((id) => typeof id === 'string'));
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        logger.warn(`Cannot read ${FILE}, every camera enabled: ${err.message}`);
      }
      this.disabled = new Set();
    }
  }

  /** @param {string} id Scrypted device id */
  isEnabled(id) {
    return !this.disabled.has(String(id));
  }

  /**
   * Turn a camera on or off in Gladys, and keep the choice. Written
   * atomically (a temporary file renamed); a failed write is logged, the
   * choice still holds until the next restart.
   */
  async set(id, enabled) {
    if (enabled) {
      this.disabled.delete(String(id));
    } else {
      this.disabled.add(String(id));
    }
    try {
      await mkdir(this.dataDir, { recursive: true });
      const temporary = join(this.dataDir, `${FILE}.tmp`);
      await writeFile(temporary, JSON.stringify({ disabled: [...this.disabled].sort() }, null, 2));
      await rename(temporary, join(this.dataDir, FILE));
    } catch (err) {
      logger.warn(`Cannot write ${FILE}: ${err.message}`);
    }
  }
}
