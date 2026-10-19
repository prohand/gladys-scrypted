# Security policy

## Supported versions

Only the latest release of the Scrypted integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue, pull request or forum post for a
security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-scrypted](https://github.com/prohand/gladys-scrypted/security),
then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration, of Gladys and of Scrypted;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove tokens, passwords, addresses and camera
  pictures first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
Scrypted and its plugins (report to
[koush/scrypted](https://github.com/koush/scrypted/security)), and the cameras
and services they talk to.

## What the integration does with your data

- The Scrypted password or login token is stored by Gladys in a secret field,
  sent only to the Scrypted address you entered, and never logged.
- Camera pictures go from Scrypted to Gladys only; nothing is sent anywhere
  else.
- The Scrypted server uses a self-signed certificate on the local network: the
  integration accepts it, as the Scrypted client does. Prefer the local address
  on a network you trust, and Scrypted Cloud (or your own HTTPS domain) from
  outside.

## Good practices for users

- Create a Scrypted user for Gladys and give it only the devices it needs,
  instead of the administrator account.
- Use a login token (`npx scrypted login`) rather than the password: it can be
  revoked without changing the password.
- Keep Gladys, Scrypted and the integration up to date.
