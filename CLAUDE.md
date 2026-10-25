# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step) for
**[Scrypted](https://scrypted.app)**, the home video platform. It runs in its
own sandboxed Docker container, talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to Scrypted through the official client
[`@scrypted/client`](https://www.npmjs.com/package/@scrypted/client) (with its
peer `@scrypted/types`): the same RPC channel the Scrypted web console uses.
These three are the only runtime dependencies. It started from the official
JavaScript template.

What it brings to Gladys: the Scrypted devices (cameras, doorbells, motion,
lights, switches, sirens, locks, entry/temperature/humidity sensors,
batteries), camera pictures, PTZ moves and presets, a Gladys-side privacy gate
per camera (`enabled`), scene triggers (motion, doorbell, object detected),
scene actions (take a picture, synchronize) and two dashboard widgets.
Gladys 5.3+ (`gladys_version >=5.3.0`, for the manifest `keywords`).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/events.test.js           # one file
node --test --test-name-pattern "doorbell" # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs `format:check`, `lint` and `test` on Node 22 and 24; pull requests
also run the store checks and build the Docker image. Run the three commands
before pushing.

## Architecture

```
index.js                     SDK bootstrap + lifecycle only (connected, disconnected, shutdown)
src/handlers.js              every SDK handler -> the runtime (also used by the tests)
src/runtime.js               one Scrypted link and what hangs on it: devices, states, events,
                             pictures, transports, connection status, button messages
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults), normalization,
                             the addresses to try (preferred first)
src/i18n.js                  LANGUAGES (en, fr, de, es), pick, localize
src/scrypted/session.js      opens a @scrypted/client session; masks secrets in console lines
src/scrypted/link.js         local/cloud choice, fallback (degraded), reconnection, promotion
src/scrypted/features.js     Scrypted interface -> Gladys feature (one entry per feature)
src/scrypted/catalog.js      Scrypted system state -> Gladys discovery list and states
src/scrypted/events.js       Scrypted events -> states + scene events (motion, ring, objects)
src/scrypted/snapshots.js    camera pictures: size fitting, rate limit, periodic loop
src/scrypted/privacy.js      cameras disabled in Gladys (`enabled`), kept in /data
src/capabilities/actions.js  Configuration screen buttons (manifest `actions`)
src/capabilities/scenes.js   scene actions (manifest `scene_actions`)
src/capabilities/widgets.js  dashboard widgets (manifest `widgets`)
gladys-assistant-integration.json  manifest
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/                        node --test against the SDK's fake Gladys + test/helpers/fakeScrypted.js
.github/scripts/changelog-release.mjs  rolls CHANGELOG.md at release time (tested)
```

### Invariants worth knowing

- **External ids are forever.** Devices are `gladys.externalIds('device', <Scrypted id>)`,
  features add their key from `features.js`. The Scrypted id survives a rename;
  the name does not. Never change a feature key, a trigger, action, widget or
  config key: users store them.
- **The integration picks the transport, not the client.** `@scrypted/client`
  races every address the server advertises; `session.js` forces `local` and
  `direct` off so a session goes to the address given and nowhere else.
  `link.js` tries the preferred address (`GLADYS_PREFER_LOCAL`), falls back on
  the other one (badge `degraded` + reason), retries the preferred one every
  10 minutes, and reopens a dropped session with a growing delay.
- **Secrets never reach a log line.** The client prints its login answer
  (bearer token included) with `console.log`: `redactConsole()` masks secret
  keys in every console argument, and `describeError()` cleans error texts.
- **Scrypted pushes, Gladys does not poll.** Devices are published with
  `should_poll: false`; states come from `systemManager.listen` events and are
  published with `publishChangedStates` (unchanged values skipped).
- **One scene event per transition.** Motion and doorbell fire on the
  false -> true edge only; object detections are merged per camera and kind for
  `detection_cooldown` seconds (the core admits 300 events a minute). Event
  `data` only holds keys declared in the trigger's `fields` / `variables`.
- **Camera pictures** are ≤ 150 KB as an `image/jpg;base64,...` string (asked
  smaller until they fit) and ≤ 12 per minute per camera (5.5 s gap). The last
  one is kept for the camera widget under a key that changes with the bytes.
- **PTZ** (`PanTiltZoom` + `ptzCapabilities`): one `Relative` step per move,
  carrying a `timeout` so a plugin running it as a continuous move stops by
  itself; only the axes the camera declares are offered. Presets keep their
  numeric Scrypted id as the Gladys value (position otherwise); a
  `ptzCapabilities` change re-publishes the device list.
- **A camera disabled in Gladys** (`enabled` = 0) gives no picture anywhere and
  its motion / object detections are dropped; its other features carry on.
- **The container rootfs is read-only.** Write only under `/data`: the only
  file is `disabled-cameras.json` (`DATA_DIR` overrides the directory; tests
  pass a temporary one).

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ "en", "fr", "de", "es" }`:
  `label`, `description` and `placeholder` alike. The catalog `description`
  holds 10 to 100 characters per language. `test/manifest.test.js` ties the
  manifest to the code (defaults, actions, scene triggers and actions,
  widgets, languages): change both sides together.
- **User-facing text** is in the four languages (built with `src/i18n.js` when
  it has variable parts): action messages, connection status, widget texts,
  transport tooltips, and `docs/en.md`, `docs/fr.md`, `docs/de.md`,
  `docs/es.md`, kept in sync. German uses the informal "du".
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: they use the SDK's fake Gladys
  (`@gladysassistant/integration-sdk/testing`), `test/helpers/fakeScrypted.js`
  and `test/helpers/fakeTimers.js`.
