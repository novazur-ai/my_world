# Accès à l'agenda sans fenêtre Google

L'accès que Google donne à l'appli expire toutes les heures. Avant, l'appli ouvrait une fenêtre Google
pour le renouveler. Ce petit script Google le renouvelle en arrière-plan à la place.

1. Ouvrir https://script.google.com avec le compte t.mallet06@gmail.com, puis « Nouveau projet ».
   Le nommer « My World – agenda ».
2. Roue dentée (Paramètres du projet) : cocher « Afficher le fichier manifeste appsscript.json ».
3. Dans l'éditeur : remplacer le contenu de `Code.gs` et de `appsscript.json` par ceux de ce dossier. Enregistrer.
4. En haut, choisir la fonction `autoriser` puis « Exécuter ». Accepter : « Paramètres avancés »,
   « Accéder à My World – agenda », « Autoriser ».
5. « Déployer » > « Nouveau déploiement » > type « Application Web ».
   Exécuter en tant que : Moi. Qui a accès : Tout le monde. « Déployer ».
6. Copier l'URL de l'application Web (elle finit par /exec) dans `AGENDA_TOKEN_URL` de firebase-config.js.

# Sommeil (MyWorld_1.8) : tes nuits dans My World

Chemin des données : montre → Huawei Santé → Health Sync → Health Connect → HC Webhook → ce script → My World.
Le même script sert pour l'agenda et pour le sommeil : on garde la même adresse /exec.

## A. Mettre le script à jour (ordinateur conseillé, 5 min)
1. Ouvrir https://script.google.com, projet « My World – agenda ».
2. Remplacer tout le contenu de `Code.gs` par celui de ce dossier. Enregistrer (icône disquette).
3. En haut, choisir la fonction `creerCleSommeil` puis « Exécuter ».
   Le journal d'exécution affiche « Ta clé sommeil : … ». La garder pour l'étape B.
4. « Déployer » > « Gérer les déploiements » > crayon (Modifier) > Version : « Nouvelle version » > « Déployer ».
   Important : ne pas faire « Nouveau déploiement », sinon l'adresse change et l'agenda ne marche plus.

## B. Régler HC Webhook (téléphone)
1. Onglet « Webhooks » > « Ajouter un webhook ».
2. Adresse : https://script.google.com/macros/s/AKfycbyAIiZJTIT9MJr5q1zStH7ZNBBUjlkpp0oT9WdAt9DRQxZ5vgQ1u-V-Nzpatk2AVtX8Qg/exec?k=TA_CLÉ
   (remplacer TA_CLÉ par la clé de l'étape A.3).
3. « Types de données » : seulement « Sommeil ».
4. Si un réglage « Résolution » apparaît pour le Sommeil : « Complet » (« Résumé » n'envoie pas les phases profond / léger / paradoxal).
5. Intervalle : 60 minutes suffit (15 minutes au minimum).
6. « Synchroniser maintenant », « Plage de temps » : « Sélection personnalisée » depuis quelques jours, pour envoyer tout de suite tes dernières nuits.
   Le bouton « Tester le Webhook » envoie de fausses données : le script les reconnaît et ne les garde pas.

## C. Vérifier
Ouvrir My World > page Sommeil : « Dernier envoi reçu » doit afficher l'heure de la synchro.
