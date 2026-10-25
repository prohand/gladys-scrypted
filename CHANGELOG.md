# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Motorized cameras (Scrypted `PanTiltZoom`): a PTZ control with the directions
  the camera declares, one short bounded step per press, and the presets saved
  in the camera.
- "Enabled in Gladys" switch on every camera: turned off, Gladys gets no picture
  and no motion or object detection from it; the choice survives a restart.
  Cameras already created get both with the **Update** button of the Discover
  tab.
- Search keywords in the store catalog (NVR, ONVIF, RTSP, Reolink, UniFi
  Protect…).

### Changed

- Gladys 5.3.0 or later is now required (manifest `keywords`).
- `@gladysassistant/integration-sdk` 0.16.
- A siren's on/off feature uses the siren `binary` type constant (same value).
- The release workflow runs the store admission checks once the image is
  published; pull requests skip the image check.

## [1.0.3] - 2026-10-23

- Maintenance release, no functional change.

## [1.0.2] - 2026-10-19

- Maintenance release, no functional change.

## [1.0.1] - 2026-10-19

### Added

- First version of the Scrypted integration, started from the official
  JavaScript template.
- Connection to a Scrypted server by its local address, through Scrypted Cloud,
  or both: the "Prefer the local connection" switch picks the first one tried,
  the other one takes over when it does not answer (orange dot on the transport
  badge), and the preferred one is taken back as soon as it answers again.
- Devices: cameras (pictures on a timer, on every event and on request),
  doorbells, motion sensors, lights (on/off and brightness), switches, plugs,
  sirens, locks, door and window sensors, thermometers, hygrometers and
  batteries.
- Scene triggers: "A Scrypted camera sees motion", "A Scrypted doorbell is
  pressed" and "A Scrypted camera detects an object" (person, vehicle, animal,
  package, face, license plate), with a pause between two detections of the
  same kind.
- Scene actions: "Take a picture with a Scrypted camera" and "Synchronize the
  Scrypted devices".
- Dashboard widgets: "Scrypted" (connection, devices, last events) and
  "Scrypted camera" (last picture, motion, picture button).
- Configuration buttons: "Test the connection" and "Synchronize the devices".
- English, French, German and Spanish everywhere: configuration screen,
  messages, widgets and documentation.
- CI (format, lint, tests on Node 22 and 24, store checks and Docker build on
  pull requests), Release workflow, GitHub Releases and Dependabot.

### Security

- The password or login token is a secret field, and never written in the
  logs: the login answer the Scrypted client prints is masked.

[Unreleased]: https://github.com/prohand/gladys-scrypted/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/prohand/gladys-scrypted/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/prohand/gladys-scrypted/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-scrypted/releases/tag/v1.0.1
