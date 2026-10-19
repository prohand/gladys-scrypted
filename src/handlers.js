// -----------------------------------------------------------------------------
// The SDK handlers: what Gladys can ask, and which part of the runtime
// answers. Registered by index.js before connect(), and by the tests on the
// SDK's fake Gladys, so both run the same wiring.
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { ACTIONS } from './capabilities/actions.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS, widgetImage } from './capabilities/widgets.js';

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {import('./runtime.js').Runtime} runtime
 */
export function registerHandlers(gladys, runtime) {
  // --- Discovery: the user opens the discovery list --------------------------
  gladys.onScanRequest(async () => {
    if (runtime.session) {
      await runtime.sync();
    } else {
      await runtime.publishDevices();
    }
  });

  // --- Commands: switch, light, siren, lock ----------------------------------
  gladys.onSetValue((device, feature, value) => runtime.setValue(device, feature, value));

  // --- Camera: Gladys needs a FRESH picture (live view, chat) ----------------
  gladys.onGetImage((device) => runtime.getImage(device));

  // --- Configuration screen buttons -----------------------------------------
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(runtime, { fields }));
  }

  // --- Scene actions ---------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(runtime, { fields }));
  }

  // --- Dashboard widgets -----------------------------------------------------
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(runtime, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(runtime, { actionKey, params, settings }),
    );
  }
  gladys.onWidgetGetImage((key) => widgetImage(runtime, key));

  // --- Configuration saved by the user ---------------------------------------
  // Address, account or "Prefer the local connection": the link starts over.
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('Configuration updated: reconnecting to Scrypted');
    await runtime.start(normalizeConfig(newConfig));
  });
}
