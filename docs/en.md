# Scrypted

This integration connects Gladys to **[Scrypted](https://scrypted.app)**, the
home video platform that brings together your cameras (Reolink, Hikvision,
Amcrest, UniFi, ONVIF, Ring, Nest…), doorbells and their detections. Scrypted
does the video work; Gladys gets the devices, the pictures and the events, and
turns them into scenes and dashboards.

## What you get

| In Scrypted                               | In Gladys                                      |
| ----------------------------------------- | ---------------------------------------------- |
| Camera                                    | Camera (pictures)                              |
| Motion sensor (camera or sensor)          | Motion sensor + "sees motion" scene trigger    |
| Doorbell button                           | Doorbell + "doorbell is pressed" scene trigger |
| Object detection (NVR, detection plugins) | "detects an object" scene trigger              |
| Light (on/off, brightness)                | Light                                          |
| Switch, plug                              | Switch                                         |
| Siren                                     | Siren                                          |
| Lock                                      | Lock                                           |
| Door / window sensor                      | Opening sensor                                 |
| Thermometer, hygrometer                   | Temperature sensor, humidity sensor            |
| Battery                                   | Battery level                                  |

Scrypted pushes every change as it happens: nothing is polled.

## Before you start

You need a running Scrypted server with your cameras already working in it.

1. In the Scrypted console, open **Settings → Users** and create a user for
   Gladys. An administrator sees every device; a plain user only sees the
   devices you give it, which is what you want if some cameras must stay out of
   Gladys.
2. Get a **login token** for that user rather than using its password: on a
   computer of your network, run `npx scrypted login <scrypted address>` and log
   in as that user. The token is saved in the `login.json` file of the
   `.scrypted` folder of your home directory (the `token` value). A token can be
   revoked without changing the password.

## Configuration

Open the integration in Gladys, then **Configuration**.

| Field                       | What to put                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Local address               | The address of the server on your network, with its port: `https://192.168.1.20:10443/`      |
| Scrypted Cloud address      | The address the Scrypted Cloud plugin gives your server (or your own domain). Can stay empty |
| User name                   | The Scrypted user created for Gladys                                                         |
| Password or login token     | Its login token (or its password)                                                            |
| Camera picture interval (s) | How often each camera sends a fresh picture. 60 by default, 10 minimum, 0 = only on events   |
| Picture on every event      | A fresh picture when a camera sees motion, an object or a doorbell press                     |
| Object detection pause (s)  | How long a camera waits before firing "detects an object" again for the same kind of object  |

Then click **Test the connection**: the answer says which address answered,
the Scrypted version, and how many devices and cameras were found.

### Local or cloud

The manifest declares both connections, so Gladys shows a **Prefer the local
connection** switch:

- **on** (default): the local address is tried first, Scrypted Cloud takes over
  when it does not answer;
- **off**: Scrypted Cloud first, the local address as a fallback.

Fill in one address or both. When Gladys runs on the fallback, every Scrypted
device shows its transport badge with an **orange dot**, and its tooltip says
why. The preferred address is tried again every 10 minutes, and taken back as
soon as it answers.

Scrypted uses a self-signed certificate on `https://<ip>:10443`: the
integration accepts it, like the Scrypted apps do. Plain `http://<ip>:11080`
works too on a trusted network.

## Adding the devices

Once connected, open the **Discover** tab of the integration: every Scrypted
device that Gladys can use is there, under its Scrypted name. Add the ones you
want and put them in their room.

A camera added or renamed later in Scrypted shows up by itself after a few
seconds. The **Synchronize the devices** button does it on demand.

## Camera pictures

Each camera sends a picture:

- every **Camera picture interval** seconds;
- on every motion, object or doorbell press (when **Picture on every event** is
  on);
- when the Gladys dashboard or a chat message asks for one;
- when a scene runs **Take a picture with a Scrypted camera**.

Gladys takes pictures up to 150 KB: they are asked smaller from Scrypted until
they fit. A camera never sends more than 12 pictures a minute.

## Scenes

### Triggers

- **A Scrypted camera sees motion**: when a camera or motion sensor goes from
  still to motion. Filter: the device. Variable: the device name.
- **A Scrypted doorbell is pressed**: the doorbell button. Filter: the
  doorbell. Variable: the device name.
- **A Scrypted camera detects an object**: what the Scrypted object detection
  (Scrypted NVR, OpenVINO, CoreML, ONNX…) recognizes. Filters: the camera and
  the kind of object (person, vehicle, animal, package, face, license plate,
  other object). Variables: the device name, the kind of object, the name
  (recognized face or plate, when there is one) and the confidence in percent.

A person walking in front of a camera gives one event, not one per frame: the
same camera waits for the **Object detection pause** before firing again for
the same kind of object.

### Actions

- **Take a picture with a Scrypted camera**: a fresh picture is sent to Gladys,
  ready for the "send a camera picture" action. Output: whether a picture was
  taken.
- **Synchronize the Scrypted devices**: reads the Scrypted device list again.
  Output: the number of devices found.

Example: _"When the doorbell is pressed, take a picture with the doorbell
camera and send it to me in a message."_

## Dashboard widgets

- **Scrypted**: the connection (local, cloud, fallback or unreachable), the
  server version, the number of devices and cameras, the last events seen, and
  two buttons: **Synchronize** and **All pictures**.
- **Scrypted camera**: choose a camera in the widget settings. It shows its
  last picture, its live motion state and a **Take a picture** button.

## Troubleshooting

| What you see                                      | What to do                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "Fill in the Scrypted address…"                   | An address, the user name and the password or token are all needed                                       |
| "Scrypted does not answer (… statusCode 401)"     | Wrong user name, password or token. Create a new token with `npx scrypted login`                         |
| "Scrypted does not answer (ECONNREFUSED)"         | Wrong address or port, or Scrypted is stopped. Open the same address in a browser from your network      |
| "Scrypted does not answer (no answer after 20 s)" | The address answers too slowly or not at all: firewall, VPN, wrong IP                                    |
| A camera is missing                               | The Scrypted user does not have access to it, or it has no picture support in Scrypted (Snapshot plugin) |
| No "detects an object" event                      | Object detection must be enabled for that camera in Scrypted (Scrypted NVR or a detection plugin)        |
| Orange dot on the transport badge                 | Gladys runs on the fallback address: the tooltip says why the preferred one did not answer               |

The password and the login token never appear in the integration logs.
