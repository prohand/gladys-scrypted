// -----------------------------------------------------------------------------
// Configuration screen buttons (manifest `actions`).
//
// Keyed like the manifest; index.js registers each one with
// `gladys.onAction`. The resolved multi-language message is shown under the
// button (the ack is awaited under the action's `timeout_seconds`).
// -----------------------------------------------------------------------------

export const ACTIONS = {
  // Connect now if needed, then say how: transport, address, server version,
  // devices and cameras found.
  test_connection: (runtime) => runtime.testConnection(),

  // Read the Scrypted device list again and publish it to the discovery list.
  sync_devices: (runtime) => runtime.syncMessage(),
};
