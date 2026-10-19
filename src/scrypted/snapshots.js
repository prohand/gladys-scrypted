// -----------------------------------------------------------------------------
// Camera pictures.
//
// Scrypted gives a picture of any camera through its Camera interface
// (`takePicture`), served by its snapshot plugin from the stream it already
// decodes: no extra connection to the camera. The media object it returns is
// turned into JPEG bytes by the server (`convertMediaObjectToBuffer`).
//
// Gladys takes camera images on a dedicated channel, with two limits that
// shape this module:
//   - 150 KB per image, measured on the whole `image/jpg;base64,...` string:
//     the picture is asked smaller and smaller until it fits (the snapshot
//     plugin resizes on request);
//   - 12 images a minute per device: a camera is never published twice in
//     less than 5.5 s, whatever asked for it (timer, motion, scene, widget).
//
// The last picture of every camera is kept, under a key that changes with the
// bytes: the camera dashboard widget shows it (onWidgetGetImage).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isCamera } from './features.js';
import { describeError } from './link.js';

const logger = createLogger({ name: 'snapshots' });

export const IMAGE_PREFIX = 'image/jpg;base64,';
export const MAX_CAMERA_IMAGE_SIZE = 150 * 1024;
// Widths asked in turn, until the picture fits in MAX_CAMERA_IMAGE_SIZE.
export const PICTURE_WIDTHS = [1280, 960, 640, 480, 320];
// 12 images a minute, with a margin for the clock of the core.
export const MIN_PUBLISH_GAP_MS = 5_500;

export class Snapshots {
  /**
   * @param {object} options
   * @param {any} options.gladys
   * @param {import('./catalog.js').Catalog} options.catalog
   * @param {() => any} options.getSession the current Scrypted session, or null
   * @param {(id: string) => void} [options.onPicture] a new picture is kept
   * @param {() => number} [options.now]
   * @param {object} [options.timers]
   */
  constructor({ gladys, catalog, getSession, onPicture, now = Date.now, timers = globalThis }) {
    this.gladys = gladys;
    this.catalog = catalog;
    this.getSession = getSession;
    this.onPicture = onPicture ?? (() => {});
    this.now = now;
    this.timers = timers;
    /** @type {Map<string, { base64: string, key: string, at: number }>} */
    this.pictures = new Map();
    this.lastPublished = new Map();
    this.inFlight = new Map();
    this.sequence = 0;
    this.loop = null;
    this.loopRunning = false;
  }

  /**
   * Take a picture of a camera, small enough for Gladys, and keep it.
   * Concurrent requests for the same camera share one capture.
   * @param {string} id Scrypted device id
   * @param {'event' | 'periodic'} [reason]
   * @returns {Promise<string>} the `image/jpg;base64,...` string
   */
  capture(id, reason = 'event') {
    const running = this.inFlight.get(id);
    if (running) {
      return running;
    }
    const capture = this.doCapture(id, reason).finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, capture);
    return capture;
  }

  async doCapture(id, reason) {
    const session = this.getSession();
    if (!session) {
      throw new Error('Scrypted is not connected');
    }
    const device = this.catalog.get(id);
    if (!device || !isCamera(device)) {
      throw new Error(`Scrypted device ${id} is not a camera`);
    }
    const camera = session.systemManager.getDeviceById(id);
    let lastSize = 0;
    for (const width of PICTURE_WIDTHS) {
      const media = await camera.takePicture({ reason, picture: { width } });
      const jpeg = await session.mediaManager.convertMediaObjectToBuffer(media, 'image/jpeg');
      const base64 = Buffer.from(jpeg).toString('base64');
      lastSize = IMAGE_PREFIX.length + base64.length;
      if (lastSize <= MAX_CAMERA_IMAGE_SIZE) {
        this.keep(id, base64);
        return IMAGE_PREFIX + base64;
      }
    }
    throw new Error(`the picture of ${device.name} stays over 150 KB (${lastSize} bytes)`);
  }

  keep(id, base64) {
    this.sequence += 1;
    // Widget image keys: ^[a-z0-9][a-z0-9-]{0,63}$, new key for new bytes.
    const safeId = String(id)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 32);
    const key = `snap-${safeId}-${this.sequence.toString(36)}`;
    this.pictures.set(id, { base64, key, at: this.now() });
    this.onPicture(id);
  }

  /** The last picture kept for a camera, if any. */
  latest(id) {
    return this.pictures.get(id);
  }

  /** The raw base64 of a kept picture, by its widget image key. */
  imageByKey(key) {
    for (const picture of this.pictures.values()) {
      if (picture.key === key) {
        return picture.base64;
      }
    }
    return undefined;
  }

  /**
   * Capture a camera and push the picture to Gladys, unless it was pushed
   * less than MIN_PUBLISH_GAP_MS ago. Resolves whether it was pushed.
   */
  async publish(id, reason = 'event') {
    const last = this.lastPublished.get(id);
    if (last !== undefined && this.now() - last < MIN_PUBLISH_GAP_MS) {
      return false;
    }
    this.lastPublished.set(id, this.now());
    const image = await this.capture(id, reason);
    const device = this.catalog.get(id);
    await this.gladys.publishCameraImage(this.catalog.externalId(device), image);
    return true;
  }

  /** Push a picture of every camera, one after the other. */
  async publishAll(reason = 'periodic') {
    let published = 0;
    for (const camera of this.catalog.cameras()) {
      try {
        if (await this.publish(camera.id, reason)) {
          published += 1;
        }
      } catch (err) {
        logger.warn(`No picture of ${camera.name}: ${describeError(err)}`);
      }
    }
    return published;
  }

  /** Push every camera every `seconds` (0: never). Replaces a running loop. */
  start(seconds) {
    this.stop();
    if (!seconds) {
      return;
    }
    this.loop = this.timers.setInterval(() => {
      if (this.loopRunning) {
        return;
      }
      this.loopRunning = true;
      this.publishAll('periodic').finally(() => {
        this.loopRunning = false;
      });
    }, seconds * 1000);
  }

  stop() {
    if (this.loop) {
      this.timers.clearInterval(this.loop);
      this.loop = null;
    }
  }

  /** Forget the pictures of the cameras that are gone. */
  prune() {
    for (const id of this.pictures.keys()) {
      if (!this.catalog.get(id)) {
        this.pictures.delete(id);
        this.lastPublished.delete(id);
      }
    }
  }
}
