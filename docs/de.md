# Scrypted

Diese Integration verbindet Gladys mit **[Scrypted](https://scrypted.app)**,
der Videoplattform für zu Hause, die deine Kameras (Reolink, Hikvision,
Amcrest, UniFi, ONVIF, Ring, Nest…), Türklingeln und ihre Erkennungen
zusammenführt. Scrypted erledigt die Videoarbeit; Gladys bekommt die Geräte,
die Bilder und die Ereignisse und macht daraus Szenen und Dashboards.

## Was du bekommst

| In Scrypted                               | In Gladys                                        |
| ----------------------------------------- | ------------------------------------------------ |
| Kamera                                    | Kamera (Bilder)                                  |
| Bewegungsmelder (Kamera oder Sensor)      | Bewegungsmelder + Auslöser „erkennt Bewegung“    |
| Klingeltaste                              | Türklingel + Auslöser „Türklingel wird gedrückt“ |
| Objekterkennung (NVR, Erkennungs-Plugins) | Auslöser „erkennt ein Objekt“                    |
| Licht (ein/aus, Helligkeit)               | Licht                                            |
| Schalter, Steckdose                       | Schalter                                         |
| Sirene                                    | Sirene                                           |
| Schloss                                   | Schloss                                          |
| Tür-/Fenstersensor                        | Öffnungssensor                                   |
| Thermometer, Hygrometer                   | Temperatursensor, Feuchtigkeitssensor            |
| Batterie                                  | Batteriestand                                    |

Scrypted sendet jede Änderung sofort: Nichts wird abgefragt.

## Bevor du anfängst

Du brauchst einen laufenden Scrypted-Server, in dem deine Kameras bereits
funktionieren.

1. Öffne in der Scrypted-Konsole **Settings → Users** und lege einen Benutzer
   für Gladys an. Ein Administrator sieht alle Geräte; ein einfacher Benutzer
   sieht nur die Geräte, die du ihm gibst – genau richtig, wenn einige Kameras
   aus Gladys herausbleiben sollen.
2. Hol dir für diesen Benutzer ein **Login-Token**, statt sein Passwort zu
   verwenden: Führe auf einem Computer in deinem Netzwerk
   `npx scrypted login <Scrypted-Adresse>` aus und melde dich als dieser
   Benutzer an. Das Token wird in der Datei `login.json` im Ordner `.scrypted`
   deines Benutzerverzeichnisses gespeichert (der Wert `token`). Ein Token kann
   widerrufen werden, ohne das Passwort zu ändern.

## Konfiguration

Öffne die Integration in Gladys, dann **Konfiguration**.

| Feld                           | Was eintragen                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Lokale Adresse                 | Die Adresse des Servers in deinem Netzwerk, mit Port: `https://192.168.1.20:10443/`                  |
| Scrypted-Cloud-Adresse         | Die Adresse, die das Scrypted-Cloud-Plugin deinem Server gibt (oder deine Domain). Darf leer bleiben |
| Benutzername                   | Der für Gladys angelegte Scrypted-Benutzer                                                           |
| Passwort oder Login-Token      | Sein Login-Token (oder sein Passwort)                                                                |
| Kamerabild-Intervall (s)       | Wie oft jede Kamera ein neues Bild sendet. Standard 60, mindestens 10, 0 = nur bei Ereignissen       |
| Bild bei jedem Ereignis        | Ein neues Bild, wenn eine Kamera eine Bewegung, ein Objekt oder ein Klingeln erkennt                 |
| Pause zwischen Erkennungen (s) | Wie lange eine Kamera wartet, bevor sie „erkennt ein Objekt“ für dieselbe Objektart erneut auslöst   |

Klicke dann auf **Verbindung testen**: Die Antwort sagt, welche Adresse
geantwortet hat, welche Scrypted-Version läuft und wie viele Geräte und Kameras
gefunden wurden.

### Lokal oder Cloud

Das Manifest gibt beide Verbindungen an, daher zeigt Gladys einen Schalter
**Lokale Verbindung bevorzugen**:

- **ein** (Standard): Die lokale Adresse wird zuerst versucht, Scrypted Cloud
  springt ein, wenn sie nicht antwortet;
- **aus**: Scrypted Cloud zuerst, die lokale Adresse als Ersatz.

Trag eine Adresse oder beide ein. Wenn Gladys auf der Ersatzadresse läuft,
zeigt jedes Scrypted-Gerät sein Transport-Badge mit einem **orangen Punkt**,
und der Tooltip sagt warum. Die bevorzugte Adresse wird alle 10 Minuten erneut
versucht und wieder übernommen, sobald sie antwortet.

Scrypted verwendet ein selbstsigniertes Zertifikat auf `https://<ip>:10443`:
Die Integration akzeptiert es, wie es die Scrypted-Apps tun. Einfaches
`http://<ip>:11080` funktioniert in einem vertrauenswürdigen Netzwerk ebenfalls.

## Geräte hinzufügen

Öffne nach dem Verbinden den Tab **Entdecken** der Integration: Jedes
Scrypted-Gerät, das Gladys nutzen kann, steht dort unter seinem Scrypted-Namen.
Füge die gewünschten hinzu und ordne sie ihrem Raum zu.

Eine später in Scrypted hinzugefügte oder umbenannte Kamera erscheint nach
einigen Sekunden von selbst. Die Taste **Geräte synchronisieren** macht das auf
Wunsch sofort.

## Kamerabilder

Jede Kamera sendet ein Bild:

- alle **Kamerabild-Intervall** Sekunden;
- bei jeder Bewegung, jedem Objekt und jedem Klingeln (wenn **Bild bei jedem
  Ereignis** eingeschaltet ist);
- wenn das Gladys-Dashboard oder eine Chatnachricht eins anfordert;
- wenn eine Szene **Bild mit einer Scrypted-Kamera aufnehmen** ausführt.

Gladys nimmt Bilder bis 150 KB an: Sie werden bei Scrypted so lange kleiner
angefordert, bis sie passen. Eine Kamera sendet nie mehr als 12 Bilder pro
Minute.

## Szenen

### Auslöser

- **Eine Scrypted-Kamera erkennt Bewegung**: wenn eine Kamera oder ein
  Bewegungsmelder von Ruhe zu Bewegung wechselt. Filter: das Gerät. Variable:
  der Gerätename.
- **Eine Scrypted-Türklingel wird gedrückt**: die Klingeltaste. Filter: die
  Türklingel. Variable: der Gerätename.
- **Eine Scrypted-Kamera erkennt ein Objekt**: was die Objekterkennung von
  Scrypted (Scrypted NVR, OpenVINO, CoreML, ONNX…) erkennt. Filter: die Kamera
  und die Objektart (Person, Fahrzeug, Tier, Paket, Gesicht, Kennzeichen,
  anderes Objekt). Variablen: der Gerätename, die Objektart, der Name (erkanntes
  Gesicht oder Kennzeichen, falls vorhanden) und die Konfidenz in Prozent.

Eine Person, die an einer Kamera vorbeigeht, ergibt ein Ereignis, nicht eins
pro Bild: Dieselbe Kamera wartet die **Pause zwischen Erkennungen** ab, bevor
sie für dieselbe Objektart erneut auslöst.

### Aktionen

- **Bild mit einer Scrypted-Kamera aufnehmen**: Ein neues Bild wird an Gladys
  gesendet, bereit für die Aktion „Kamerabild senden“. Ausgabe: ob ein Bild
  aufgenommen wurde.
- **Scrypted-Geräte synchronisieren**: liest die Scrypted-Geräteliste erneut.
  Ausgabe: die Anzahl der gefundenen Geräte.

Beispiel: _„Wenn es klingelt, ein Bild mit der Türklingelkamera aufnehmen und
mir per Nachricht schicken.“_

## Dashboard-Widgets

- **Scrypted**: die Verbindung (lokal, Cloud, Ersatz oder nicht erreichbar),
  die Serverversion, die Anzahl der Geräte und Kameras, die letzten Ereignisse
  und zwei Tasten: **Synchronisieren** und **Alle Bilder**.
- **Scrypted-Kamera**: Wähle in den Widget-Einstellungen eine Kamera. Es zeigt
  ihr letztes Bild, ihren Bewegungszustand live und eine Taste **Bild
  aufnehmen**.

## Fehlerbehebung

| Was du siehst                                     | Was zu tun ist                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| „Gib die Scrypted-Adresse … ein“                  | Eine Adresse, der Benutzername und das Passwort oder Token werden alle gebraucht                               |
| „Scrypted antwortet nicht (… statusCode 401)“     | Falscher Benutzername, falsches Passwort oder Token. Erzeuge ein neues Token mit `npx scrypted login`          |
| „Scrypted antwortet nicht (ECONNREFUSED)“         | Falsche Adresse oder falscher Port, oder Scrypted ist gestoppt. Öffne dieselbe Adresse im Browser im Netzwerk  |
| „Scrypted antwortet nicht (no answer after 20 s)“ | Die Adresse antwortet zu langsam oder gar nicht: Firewall, VPN, falsche IP                                     |
| Eine Kamera fehlt                                 | Der Scrypted-Benutzer hat keinen Zugriff darauf, oder sie liefert in Scrypted kein Bild (Snapshot-Plugin)      |
| Kein Ereignis „erkennt ein Objekt“                | Die Objekterkennung muss für diese Kamera in Scrypted aktiviert sein (Scrypted NVR oder ein Erkennungs-Plugin) |
| Oranger Punkt auf dem Transport-Badge             | Gladys läuft auf der Ersatzadresse: Der Tooltip sagt, warum die bevorzugte nicht geantwortet hat               |

Das Passwort und das Login-Token erscheinen nie in den Protokollen der
Integration.
