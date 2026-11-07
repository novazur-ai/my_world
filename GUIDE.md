# Mettre « My World » en ligne

Compte environ 1 h la première fois. Tu as besoin de ton compte GitHub, et de ton compte Google (pour créer le projet Firebase et te connecter), avec ton téléphone pour l'étape 6.

Le dépôt est `novazur-ai/my_world`, et l'appli sera en ligne sur `https://novazur-ai.github.io/my_world/`.

---

## 1. GitHub Pages

1. Le dépôt `novazur-ai/my_world` existe déjà et doit rester **public**. GitHub Pages gratuit demande un dépôt public. Le code ne contient aucune donnée personnelle : tout ce qui est privé reste dans Firebase.
2. Les fichiers y sont déjà (Claude les pousse directement).
3. Va dans **Settings → Pages** et choisis *Source : **GitHub Actions***. La mise en ligne passe alors par `.github/workflows/deploy.yml`, qui numérote chaque version automatiquement.
4. Au bout d'une minute, l'appli est en ligne sur `https://novazur-ai.github.io/my_world/`. Elle affiche encore une erreur tant que l'étape 2 n'est pas faite : c'est normal.

> ⚠️ Ne mets **jamais** dans le dépôt le fichier `sauvegarde-tableau-de-bord.json` ni la clé du compte de service (étape 4). Le `.gitignore` les bloque déjà.

## 2. Firebase (données et connexion)

1. Sur <https://console.firebase.google.com>, clique sur **Ajouter un projet** et nomme-le (par exemple `mon-carnet`). Google Analytics n'est pas utile.
2. Dans **Vue d'ensemble**, clique sur l'icône **`</>`** (application Web), donne-lui un surnom et **ne coche pas** Hosting. Copie le bloc `firebaseConfig` dans `firebase-config.js` (`FIREBASE_CONFIG`).
3. Dans **Authentication → Commencer → Sign-in method**, active **Google**.
4. Dans **Authentication → Paramètres → Domaines autorisés**, ajoute `novazur-ai.github.io`.
5. Dans **Firestore Database → Créer une base de données**, choisis le *mode production* et la région `eur3 (europe-west)`.
6. Dans l'onglet **Règles** de Firestore, colle le contenu de `firestore.rules`, puis clique sur **Publier**. Seul le compte `t.mallet06@gmail.com` peut alors lire et écrire.

## 3. Google Agenda (la partie nouvelle pour toi)

Ton projet Firebase est aussi un projet Google Cloud : tu travailles donc dans le **même projet**.

1. Ouvre <https://console.cloud.google.com> et sélectionne le projet en haut de la page.
2. Dans **API et services → Bibliothèque**, cherche *Google Calendar API* et clique sur **Activer**.
3. Configure **API et services → Écran de consentement OAuth** :
   - type **Externe** ;
   - nom de l'appli *My World*, ton e-mail comme contact ;
   - **Champs d'application** : ajoute `https://www.googleapis.com/auth/calendar.events` (création et lecture des événements, rien d'autre) ;
   - **Utilisateurs test** : ajoute `t.mallet06@gmail.com`.
4. Dans **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - type **Application Web** ;
   - **Origines JavaScript autorisées** : `https://novazur-ai.github.io` (sans `/my_world`, sans `/` final) ;
   - pas besoin d'URI de redirection.

   Copie l'**ID client** (il se termine par `.apps.googleusercontent.com`) dans `firebase-config.js` (`GOOGLE_CLIENT_ID`).
5. Envoie ces valeurs à Claude, qui les met dans `firebase-config.js` et pousse le fichier.
6. **Accès à l'agenda sans fenêtre Google** : suis `scripts/jeton-agenda/LISEZMOI.md`, puis donne l'adresse `/exec` obtenue à Claude pour `AGENDA_TOKEN_URL`.

**À savoir sur l'agenda :**

- La première fois, Google affiche « Google n'a pas validé cette application ». C'est normal pour une appli perso : clique sur *Paramètres avancés → Accéder à My World*.
- Tant que l'écran de consentement est en mode *Test*, Google redemande l'accord tous les 7 jours. Une fois que tout marche, clique sur **Publier l'application** dans l'écran de consentement. L'avertissement reste, mais l'accord ne sera plus redemandé chaque semaine. Comme l'appli n'a qu'un utilisateur, pas besoin de validation par Google.
- L'accès à l'agenda dure 1 h. Ensuite, l'appli affiche le bouton **Synchroniser Google Agenda** dans « Cette semaine ». Un appui suffit et la fenêtre Google se ferme toute seule. Sans connexion internet, l'appli affiche le dernier agenda chargé.

## 4. La Gazette du matin (GitHub Actions)

1. Dans la console Firebase, va dans **⚙ Paramètres du projet → Comptes de service → Générer une nouvelle clé privée**. Tu obtiens un fichier `.json` : c'est un **secret**, garde-le hors du dépôt.
2. Dans le dépôt GitHub, va dans **Settings → Secrets and variables → Actions → New repository secret** et crée deux secrets :
   - `FIREBASE_SERVICE_ACCOUNT` : colle **tout** le contenu du fichier `.json` ;
   - `OWNER_UID` : ton identifiant. Tu le trouves dans **Authentication → Utilisateurs** après ta première connexion (étape 6).
3. Pour tester, va dans **Actions → Gazette du matin → Run workflow**. Les titres apparaissent dans l'onglet Gazette.

Ensuite, la Gazette tourne toute seule chaque matin vers 6h, heure de Paris, été comme hiver. Elle ne prend que les articles en français de la semaine (Google Actualités), au maximum 3 par sujet, et garde 30 jours d'historique. Les sujets se gèrent dans les réglages de l'appli.

> GitHub peut retarder une tâche programmée de quelques minutes, et met en pause les tâches d'un dépôt resté 60 jours sans modification. Dans ce cas, il suffit de cliquer sur **Enable workflow** dans l'onglet Actions.

## 5. Vérifier

Ouvre `https://novazur-ai.github.io/my_world/` sur un ordinateur : l'écran « My World » doit proposer **Se connecter avec Google**.

## 6. Sur ton téléphone

1. Ouvre l'adresse dans **Chrome**, puis connecte-toi avec `t.mallet06@gmail.com`.
2. (Facultatif) Dans **Réglages → Sauvegarde → Importer**, tu peux importer une sauvegarde `.json` si tu en as une.
3. Dans « Cette semaine », touche **Synchroniser Google Agenda** et accepte.
4. Dans le menu **⋮** de Chrome, choisis **Installer l'application** (ou **Ajouter à l'écran d'accueil**). L'appli s'ouvre alors en plein écran avec son icône, sans barre de navigateur.
5. Relève ton UID dans Firebase (étape 4.2).

## Mettre à jour l'appli plus tard

Rien à faire à la main : chaque modification poussée sur `main` est mise en ligne automatiquement (onglet **Actions → Mise en ligne**, environ 1 minute), avec un nouveau numéro de version. Le téléphone télécharge la nouvelle version en arrière-plan à la prochaine ouverture de l'appli, puis l'appli se recharge une fois toute seule.

## Ce qui marche sans internet

- **L'appli elle-même :** pages, décors, polices, compréhension des phrases. Tout est dans les fichiers, sans IA ni clé d'API.
- **Les données :** Firebase garde une copie sur le téléphone. Ce qui est ajouté hors connexion est envoyé dès que le réseau revient.
- **L'agenda :** le dernier agenda chargé reste affiché. Un rendez-vous ajouté hors connexion est gardé dans l'appli avec la mention « pas encore dans ton agenda ».
