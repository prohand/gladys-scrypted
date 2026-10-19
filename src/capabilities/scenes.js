// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+, manifest `scene_actions`).
//
// Operations a scene author places in a scene, keyed like the manifest. Each
// handler receives the RESOLVED fields (a `"source": "devices"` field is the
// chosen device external id) and returns the declared outputs, scalars only.
// A scene action is never a condition: a camera that could not be pictured is
// an output (`captured: false`) the next actions can test, not a failure.
//
// Scene TRIGGERS go the other way ("this happened"): they are fired by the
// Scrypted events, see src/scrypted/events.js.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { describeError } from '../scrypted/link.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTIONS = {
  // Take a picture of a camera and push it to Gladys: the dashboard camera
  // updates, and the next action ("send the camera image") sends it.
  async take_snapshot(runtime, { fields }) {
    try {
      return { captured: await runtime.snapshot(fields.device) };
    } catch (err) {
      logger.warn(`Scene picture failed: ${describeError(err)}`);
      return { captured: false };
    }
  },

  // Read the Scrypted device list again (a camera was just added).
  async sync_devices(runtime) {
    try {
      return { devices: await runtime.sync() };
    } catch (err) {
      logger.warn(`Scene synchronization failed: ${describeError(err)}`);
      return { devices: 0 };
    }
  },
};
