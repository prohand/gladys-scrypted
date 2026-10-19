# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]

## [1.0.1] - 2026-10-19

` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-scrypted/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-scrypted/releases/tag/v1.0.1
