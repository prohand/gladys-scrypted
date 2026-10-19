# Gladys Assistant — Scrypted integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
brings **[Scrypted](https://scrypted.app)** into Gladys: cameras and their
pictures, doorbells, motion and object detection, lights, switches, sirens,
locks and sensors. Built from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js)
with the [integration SDK](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

- **Local and cloud.** The manifest declares `"transports": ["local", "cloud"]`:
  the integration reaches Scrypted by its LAN address, through Scrypted Cloud,
  or both. The Gladys **Prefer the local connection** switch picks the first one
  tried; the other one takes over when it does not answer, with an orange dot
  and the reason on every device's transport badge, and the preferred one is
  taken back as soon as it answers again.
- **Devices** — every Scrypted device with a known interface is offered in the
  Discover tab:

  | Scrypted interface         | Gladys feature                          |
  | -------------------------- | --------------------------------------- |
  | `Camera`                   | `camera` / `image`                      |
  | `MotionSensor`             | `motion-sensor` / `binary`              |
  | `BinarySensor` on Doorbell | `doorbell` / `ring`                     |
  | `OnOff`                    | `light`, `siren` or `switch` / `binary` |
  | `Brightness`               | `light` / `brightness`                  |
  | `Lock`                     | `lock` / `binary`                       |
  | `EntrySensor`              | `opening-sensor` / `binary`             |
  | `Thermometer`              | `temperature-sensor` / `decimal`        |
  | `HumiditySensor`           | `humidity-sensor` / `decimal`           |
  | `Battery`                  | `battery` / `integer`                   |

  Scrypted pushes every change: nothing is polled.

- **Camera pictures** on a timer, on every event and on request (dashboard,
  chat, scene), sized under the 150 KB Gladys accepts and never more than 12 a
  minute per camera.
- **Scene triggers** (Gladys 5.1+): `motion_detected`, `doorbell_pressed`,
  `object_detected` (person, vehicle, animal, package, face, plate, other —
  with a per-camera pause between two detections of the same kind).
- **Scene actions**: `take_snapshot`, `sync_devices`.
- **Dashboard widgets**: `scrypted_status` (connection, devices, last events)
  and `scrypted_camera` (last picture, live motion, picture button).
- **Four languages**: English, French, German and Spanish, everywhere.

## Project structure

```
.
├─ index.js                     # SDK bootstrap + lifecycle (no Scrypted logic)
├─ src/
│  ├─ handlers.js               # every SDK handler -> the runtime
│  ├─ runtime.js                # the Scrypted link and what hangs on it
│  ├─ config.js                 # defaults, normalization, addresses to try
│  ├─ i18n.js                   # en, fr, de, es helpers
│  ├─ scrypted/
│  │  ├─ session.js             # @scrypted/client session + secret masking
│  │  ├─ link.js                # local/cloud, fallback, reconnection
│  │  ├─ features.js            # Scrypted interface -> Gladys feature
│  │  ├─ catalog.js             # Scrypted devices -> Gladys devices and states
│  │  ├─ events.js              # Scrypted events -> states + scene events
│  │  └─ snapshots.js           # camera pictures
│  └─ capabilities/
│     ├─ actions.js             # Configuration screen buttons
│     ├─ scenes.js              # scene actions
│     └─ widgets.js             # dashboard widgets
├─ docs/{en,fr,de,es}.md        # user documentation (re-hosted by Gladys)
├─ test/                        # node --test, fake Gladys + fake Scrypted
├─ gladys-assistant-integration.json
├─ Dockerfile                   # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                     # CI, build, release, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit tests (node --test), no network
npm run lint           # ESLint
npm run format:check   # Prettier
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a real Gladys and Scrypted:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="scrypted" \
LOG_LEVEL=debug \
npm start
```

The tests drive the integration with the SDK's fake Gladys
(`@gladysassistant/integration-sdk/testing`), which refuses what Gladys refuses,
and an in-memory Scrypted (`test/helpers/fakeScrypted.js`).

## Continuous integration and releases

Same workflows as [gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`) — Prettier, ESLint and tests on Node 22 and 24 for every
  push to `main` and every pull request; pull requests also run the store
  admission checks and build the Docker image.
- **Release** (`release.yml`) — from **Actions → Release → Run workflow**, pick
  `patch`, `minor` or `major`: it bumps `package.json`, the manifest `version`
  and `docker_image`, rolls `CHANGELOG.md`, tags `vX.Y.Z`, builds the
  `linux/amd64` + `linux/arm64` image to `ghcr.io/prohand/gladys-scrypted`
  (`:X.Y.Z` and `:latest`) and publishes the GitHub Release.
- **Build** (`build.yml`) — the multi-arch build, also runnable by hand on any
  branch for a test image.
- **GitHub releases** (`github-release.yml`) — a Release for every version tag,
  with its changelog section as notes.
- **Dependabot** — weekly npm updates, monthly GitHub Actions and Docker base
  image updates.

To publish: add the `gladys-assistant-integration` topic to the repository,
describe the changes under `## [Unreleased]` in `CHANGELOG.md`, then run the
Release workflow. The store indexer picks up the new manifest version.

## License

Apache-2.0
