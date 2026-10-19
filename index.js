// -----------------------------------------------------------------------------
// Entry point of the Scrypted integration for Gladys.
//
// This file only wires the SDK to the runtime (src/runtime.js): handlers are
// registered BEFORE connect() (src/handlers.js), then the runtime opens the
// Scrypted link with the configuration saved in Gladys. No Scrypted logic
// here.
//
// Environment variables provided by the Gladys supervisor to the container
// (read by the SDK): GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN,
// GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { registerHandlers } from './src/handlers.js';
import { Runtime } from './src/runtime.js';
import { refreshWidgets } from './src/capabilities/widgets.js';
import { redactConsole } from './src/scrypted/session.js';

// Before anything logs: the Scrypted client prints its login answer.
redactConsole();

const gladys = new GladysIntegration();
const runtime = new Runtime({ gladys, onWidgetsStale: () => refreshWidgets(gladys) });

registerHandlers(gladys, runtime);

// --- Gladys connection lifecycle ---------------------------------------------
gladys.on('connected', async () => {
  try {
    await runtime.start(normalizeConfig(await gladys.getConfig()));
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
        de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Protokolle der Integration.',
        es: 'La inicialización ha fallado, consulte los registros de la integración.',
      })
      .catch(() => {});
  }
});

// Gladys is gone: Scrypted events would have nowhere to go. The link opens
// again on the next 'connected'.
gladys.on('disconnected', () => {
  runtime.stop().catch((err) => logger.error('Stopping the Scrypted link failed', err));
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal}: closing the Scrypted link`);
  await runtime.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Scrypted integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
