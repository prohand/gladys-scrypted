# Scrypted

Esta integración conecta Gladys con **[Scrypted](https://scrypted.app)**, la
plataforma de vídeo para el hogar que reúne sus cámaras (Reolink, Hikvision,
Amcrest, UniFi, ONVIF, Ring, Nest…), sus timbres y sus detecciones. Scrypted
hace el trabajo de vídeo; Gladys recibe los dispositivos, las imágenes y los
eventos, y los convierte en escenas y paneles.

Requiere **Gladys 5.3.0** o posterior.

## Lo que obtiene

| En Scrypted                                      | En Gladys                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Cámara                                           | Cámara (imágenes)                                                     |
| Cámara motorizada (PTZ)                          | Pasos de giro / inclinación / zoom, posiciones guardadas en la cámara |
| Sensor de movimiento (cámara o sensor)           | Sensor de movimiento + disparador «detecta movimiento»                |
| Botón del timbre                                 | Timbre + disparador «se pulsa un timbre»                              |
| Detección de objetos (NVR, plugins de detección) | Disparador «detecta un objeto»                                        |
| Luz (encendido, brillo)                          | Luz                                                                   |
| Interruptor, enchufe                             | Interruptor                                                           |
| Sirena                                           | Sirena                                                                |
| Cerradura                                        | Cerradura                                                             |
| Sensor de puerta / ventana                       | Sensor de apertura                                                    |
| Termómetro, higrómetro                           | Sensor de temperatura, sensor de humedad                              |
| Batería                                          | Nivel de batería                                                      |

Scrypted envía cada cambio en el momento en que ocurre: no se consulta nada en
bucle.

## Antes de empezar

Necesita un servidor Scrypted en marcha, con sus cámaras ya funcionando en él.

1. En la consola de Scrypted, abra **Settings → Users** y cree un usuario para
   Gladys. Un administrador ve todos los dispositivos; un usuario normal solo ve
   los que usted le asigna, que es lo que necesita si algunas cámaras deben
   quedar fuera de Gladys.
2. Obtenga un **token de acceso** para ese usuario en lugar de usar su
   contraseña: en un ordenador de su red, ejecute
   `npx scrypted login <dirección de Scrypted>` e inicie sesión con ese
   usuario. El token se guarda en el archivo `login.json` de la carpeta
   `.scrypted` de su carpeta personal (el valor `token`). Un token se puede
   revocar sin cambiar la contraseña.

## Configuración

Abra la integración en Gladys y luego **Configuración**.

| Campo                               | Qué poner                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Dirección local                     | La dirección del servidor en su red, con su puerto: `https://192.168.1.20:10443/`                  |
| Dirección de Scrypted Cloud         | La dirección que el plugin Scrypted Cloud da a su servidor (o su dominio). Puede quedar vacía      |
| Nombre de usuario                   | El usuario de Scrypted creado para Gladys                                                          |
| Contraseña o token de acceso        | Su token de acceso (o su contraseña)                                                               |
| Intervalo de imágenes de cámara (s) | Cada cuánto envía cada cámara una imagen nueva. 60 por defecto, mínimo 10, 0 = solo en eventos     |
| Imagen en cada evento               | Una imagen nueva cuando una cámara ve movimiento, un objeto o una pulsación del timbre             |
| Pausa entre detecciones (s)         | Cuánto espera una cámara antes de volver a lanzar «detecta un objeto» para el mismo tipo de objeto |

Pulse luego **Probar la conexión**: la respuesta indica qué dirección
respondió, la versión de Scrypted y cuántos dispositivos y cámaras se
encontraron.

### Local o nube

El manifiesto declara las dos conexiones, así que Gladys muestra un interruptor
**Preferir la conexión local**:

- **activado** (por defecto): se prueba primero la dirección local, Scrypted
  Cloud toma el relevo cuando no responde;
- **desactivado**: primero Scrypted Cloud, la dirección local como respaldo.

Indique una dirección o las dos. Cuando Gladys funciona con la dirección de
respaldo, cada dispositivo de Scrypted muestra su insignia de transporte con un
**punto naranja**, y la información emergente explica por qué. La dirección
preferida se vuelve a probar cada 10 minutos y se recupera en cuanto responde.

Scrypted usa un certificado autofirmado en `https://<ip>:10443`: la
integración lo acepta, como hacen las aplicaciones de Scrypted. El simple
`http://<ip>:11080` también funciona en una red de confianza.

## Añadir los dispositivos

Una vez conectado, abra la pestaña **Descubrir** de la integración: cada
dispositivo de Scrypted que Gladys sabe usar está ahí, con su nombre de
Scrypted. Añada los que quiera y colóquelos en su habitación.

Una cámara añadida o renombrada más tarde en Scrypted aparece sola tras unos
segundos. El botón **Sincronizar los dispositivos** lo hace bajo demanda.

## Imágenes de las cámaras

Cada cámara envía una imagen:

- cada **Intervalo de imágenes de cámara** segundos;
- en cada movimiento, objeto o pulsación del timbre (si **Imagen en cada
  evento** está activado);
- cuando el panel de Gladys o un mensaje de chat la pide;
- cuando una escena ejecuta **Tomar una imagen con una cámara Scrypted**.

Gladys acepta imágenes de hasta 150 KB: se piden más pequeñas a Scrypted hasta
que caben. Una cámara nunca envía más de 12 imágenes por minuto.

## Controles de las cámaras

**Activada en Gladys** (en cada cámara) es un interruptor de privacidad del
lado de Gladys: desactivada, Gladys deja de tomar imágenes de la cámara e
ignora sus detecciones de movimiento y de objetos, mientras Scrypted sigue
grabando. La elección se conserva tras un reinicio.

Una **cámara motorizada** (un plugin de Scrypted con giro / inclinación /
zoom: ONVIF, Reolink, Amcrest…) recibe un control **PTZ** en las direcciones
que declara la cámara, un paso corto por pulsación, y una lista **Posición**
con las posiciones guardadas en la cámara. Una posición renombrada en la
cámara también se renombra en Gladys.

Para una cámara añadida antes de estos controles, haga clic en **Actualizar**
en la pestaña **Descubrir** para obtenerlos.

## Escenas

### Disparadores

- **Una cámara Scrypted detecta movimiento**: cuando una cámara o un sensor
  pasa de reposo a movimiento. Filtro: el dispositivo. Variable: el nombre del
  dispositivo.
- **Se pulsa un timbre de Scrypted**: el botón del timbre. Filtro: el timbre.
  Variable: el nombre del dispositivo.
- **Una cámara Scrypted detecta un objeto**: lo que reconoce la detección de
  objetos de Scrypted (Scrypted NVR, OpenVINO, CoreML, ONNX…). Filtros: la
  cámara y el tipo de objeto (persona, vehículo, animal, paquete, cara,
  matrícula, otro objeto). Variables: el nombre del dispositivo, el tipo de
  objeto, el nombre (cara o matrícula reconocidas, si lo hay) y la confianza en
  porcentaje.

Una persona que pasa delante de una cámara da un evento, no uno por imagen: la
misma cámara espera la **Pausa entre detecciones** antes de volver a lanzarlo
para el mismo tipo de objeto.

### Acciones

- **Tomar una imagen con una cámara Scrypted**: se envía una imagen nueva a
  Gladys, lista para la acción «enviar la imagen de una cámara». Salida: si se
  tomó una imagen.
- **Sincronizar los dispositivos de Scrypted**: vuelve a leer la lista de
  dispositivos de Scrypted. Salida: el número de dispositivos encontrados.

Ejemplo: _«Cuando llamen al timbre, tomar una imagen con la cámara del timbre y
enviármela en un mensaje.»_

## Widgets del panel

- **Scrypted**: la conexión (local, nube, respaldo o inaccesible), la versión
  del servidor, el número de dispositivos y cámaras, los últimos eventos vistos
  y dos botones: **Sincronizar** y **Todas las imágenes**.
- **Cámara Scrypted**: elija una cámara en los ajustes del widget. Muestra su
  última imagen, su estado de movimiento en directo y un botón **Tomar una
  imagen**.

## Solución de problemas

| Lo que ve                                     | Qué hacer                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| «Indique la dirección de Scrypted…»           | Se necesitan una dirección, el nombre de usuario y la contraseña o el token                                      |
| «Scrypted no responde (… statusCode 401)»     | Nombre de usuario, contraseña o token incorrectos. Cree un token nuevo con `npx scrypted login`                  |
| «Scrypted no responde (ECONNREFUSED)»         | Dirección o puerto incorrectos, o Scrypted detenido. Abra la misma dirección en un navegador de su red           |
| «Scrypted no responde (no answer after 20 s)» | La dirección responde demasiado despacio o no responde: cortafuegos, VPN, IP incorrecta                          |
| Falta una cámara                              | El usuario de Scrypted no tiene acceso a ella, o no da imagen en Scrypted (plugin Snapshot)                      |
| Ningún evento «detecta un objeto»             | La detección de objetos debe estar activada para esa cámara en Scrypted (Scrypted NVR o un plugin de detección)  |
| Punto naranja en la insignia de transporte    | Gladys funciona con la dirección de respaldo: la información emergente explica por qué la preferida no respondió |

La contraseña y el token de acceso nunca aparecen en los registros de la
integración.
