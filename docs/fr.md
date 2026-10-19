# Scrypted

Cette intégration relie Gladys à **[Scrypted](https://scrypted.app)**, la
plateforme vidéo de la maison qui rassemble vos caméras (Reolink, Hikvision,
Amcrest, UniFi, ONVIF, Ring, Nest…), vos sonnettes et leurs détections.
Scrypted fait le travail vidéo ; Gladys reçoit les appareils, les images et les
événements, et en fait des scènes et des tableaux de bord.

## Ce que vous obtenez

| Dans Scrypted                                  | Dans Gladys                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Caméra                                         | Caméra (images)                                               |
| Détecteur de mouvement (caméra ou capteur)     | Détecteur de mouvement + déclencheur « détecte un mouvement » |
| Bouton de sonnette                             | Sonnette + déclencheur « on sonne »                           |
| Détection d'objets (NVR, plugins de détection) | Déclencheur « détecte un objet »                              |
| Lumière (allumage, luminosité)                 | Lumière                                                       |
| Interrupteur, prise                            | Interrupteur                                                  |
| Sirène                                         | Sirène                                                        |
| Serrure                                        | Serrure                                                       |
| Capteur de porte / fenêtre                     | Capteur d'ouverture                                           |
| Thermomètre, hygromètre                        | Capteur de température, capteur d'humidité                    |
| Batterie                                       | Niveau de batterie                                            |

Scrypted envoie chaque changement au moment où il arrive : rien n'est
interrogé en boucle.

## Avant de commencer

Il vous faut un serveur Scrypted qui tourne, avec vos caméras déjà
fonctionnelles dedans.

1. Dans la console Scrypted, ouvrez **Settings → Users** et créez un
   utilisateur pour Gladys. Un administrateur voit tous les appareils ; un
   simple utilisateur ne voit que ceux que vous lui donnez, ce qu'il vous faut
   si certaines caméras doivent rester hors de Gladys.
2. Prenez un **jeton de connexion** pour cet utilisateur plutôt que son mot de
   passe : sur un ordinateur de votre réseau, lancez
   `npx scrypted login <adresse de Scrypted>` et connectez-vous avec cet
   utilisateur. Le jeton est enregistré dans le fichier `login.json` du dossier
   `.scrypted` de votre dossier personnel (la valeur `token`). Un jeton se
   révoque sans changer le mot de passe.

## Configuration

Ouvrez l'intégration dans Gladys, puis **Configuration**.

| Champ                              | Quoi mettre                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Adresse locale                     | L'adresse du serveur sur votre réseau, avec son port : `https://192.168.1.20:10443/`                      |
| Adresse Scrypted Cloud             | L'adresse que le plugin Scrypted Cloud donne à votre serveur (ou votre domaine). Peut rester vide         |
| Nom d'utilisateur                  | L'utilisateur Scrypted créé pour Gladys                                                                   |
| Mot de passe ou jeton de connexion | Son jeton de connexion (ou son mot de passe)                                                              |
| Intervalle des images caméra (s)   | Fréquence d'envoi d'une nouvelle image par caméra. 60 par défaut, 10 minimum, 0 = sur événement seulement |
| Image à chaque événement           | Une nouvelle image quand une caméra voit un mouvement, un objet ou un appui sur la sonnette               |
| Pause entre détections (s)         | Temps d'attente d'une caméra avant de redéclencher « détecte un objet » pour le même type d'objet         |

Cliquez ensuite sur **Tester la connexion** : la réponse indique quelle
adresse a répondu, la version de Scrypted, et combien d'appareils et de caméras
ont été trouvés.

### Local ou cloud

Le manifeste déclare les deux connexions, Gladys affiche donc un interrupteur
**Préférer la connexion locale** :

- **activé** (par défaut) : l'adresse locale est essayée d'abord, Scrypted
  Cloud prend le relais quand elle ne répond pas ;
- **désactivé** : Scrypted Cloud d'abord, l'adresse locale en secours.

Renseignez une adresse ou les deux. Quand Gladys tourne sur l'adresse de
secours, chaque appareil Scrypted affiche son badge de transport avec un
**point orange**, et l'infobulle dit pourquoi. L'adresse préférée est réessayée
toutes les 10 minutes, et reprise dès qu'elle répond.

Scrypted utilise un certificat auto-signé sur `https://<ip>:10443` :
l'intégration l'accepte, comme le font les applications Scrypted. Le simple
`http://<ip>:11080` fonctionne aussi sur un réseau de confiance.

## Ajouter les appareils

Une fois connecté, ouvrez l'onglet **Découverte** de l'intégration : chaque
appareil Scrypted que Gladys sait utiliser y est, sous son nom Scrypted.
Ajoutez ceux que vous voulez et rangez-les dans leur pièce.

Une caméra ajoutée ou renommée plus tard dans Scrypted apparaît d'elle-même
après quelques secondes. Le bouton **Synchroniser les appareils** le fait à la
demande.

## Images des caméras

Chaque caméra envoie une image :

- toutes les **Intervalle des images caméra** secondes ;
- à chaque mouvement, objet ou appui sur la sonnette (si **Image à chaque
  événement** est activé) ;
- quand le tableau de bord de Gladys ou un message de chat en demande une ;
- quand une scène lance **Prendre une image avec une caméra Scrypted**.

Gladys accepte des images jusqu'à 150 Ko : elles sont redemandées plus petites
à Scrypted jusqu'à ce qu'elles tiennent. Une caméra n'envoie jamais plus de
12 images par minute.

## Scènes

### Déclencheurs

- **Une caméra Scrypted détecte un mouvement** : quand une caméra ou un
  détecteur passe du calme au mouvement. Filtre : l'appareil. Variable : le nom
  de l'appareil.
- **On sonne à une sonnette Scrypted** : le bouton de la sonnette. Filtre : la
  sonnette. Variable : le nom de l'appareil.
- **Une caméra Scrypted détecte un objet** : ce que la détection d'objets de
  Scrypted (Scrypted NVR, OpenVINO, CoreML, ONNX…) reconnaît. Filtres : la
  caméra et le type d'objet (personne, véhicule, animal, colis, visage, plaque
  d'immatriculation, autre objet). Variables : le nom de l'appareil, le type
  d'objet, le nom (visage ou plaque reconnus, s'il y en a un) et la confiance en
  pourcentage.

Une personne qui passe devant une caméra donne un événement, pas un par image :
la même caméra attend la **Pause entre détections** avant de redéclencher pour
le même type d'objet.

### Actions

- **Prendre une image avec une caméra Scrypted** : une nouvelle image est
  envoyée à Gladys, prête pour l'action « envoyer l'image d'une caméra ».
  Sortie : si une image a été prise.
- **Synchroniser les appareils Scrypted** : relit la liste des appareils
  Scrypted. Sortie : le nombre d'appareils trouvés.

Exemple : _« Quand on sonne, prendre une image avec la caméra de la sonnette et
me l'envoyer par message. »_

## Widgets du tableau de bord

- **Scrypted** : la connexion (locale, cloud, secours ou injoignable), la
  version du serveur, le nombre d'appareils et de caméras, les derniers
  événements vus, et deux boutons : **Synchroniser** et **Toutes les images**.
- **Caméra Scrypted** : choisissez une caméra dans les réglages du widget. Il
  affiche sa dernière image, son état de mouvement en direct et un bouton
  **Prendre une image**.

## Dépannage

| Ce que vous voyez                                 | Que faire                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| « Renseignez l'adresse de Scrypted… »             | Il faut une adresse, le nom d'utilisateur et le mot de passe ou le jeton                                         |
| « Scrypted ne répond pas (… statusCode 401) »     | Nom d'utilisateur, mot de passe ou jeton faux. Créez un nouveau jeton avec `npx scrypted login`                  |
| « Scrypted ne répond pas (ECONNREFUSED) »         | Mauvaise adresse ou mauvais port, ou Scrypted arrêté. Ouvrez la même adresse dans un navigateur de votre réseau  |
| « Scrypted ne répond pas (no answer after 20 s) » | L'adresse répond trop lentement ou pas du tout : pare-feu, VPN, mauvaise IP                                      |
| Une caméra manque                                 | L'utilisateur Scrypted n'y a pas accès, ou elle ne sait pas donner d'image dans Scrypted (plugin Snapshot)       |
| Aucun événement « détecte un objet »              | La détection d'objets doit être activée pour cette caméra dans Scrypted (Scrypted NVR ou un plugin de détection) |
| Point orange sur le badge de transport            | Gladys tourne sur l'adresse de secours : l'infobulle dit pourquoi l'adresse préférée n'a pas répondu             |

Le mot de passe et le jeton de connexion n'apparaissent jamais dans les
journaux de l'intégration.
