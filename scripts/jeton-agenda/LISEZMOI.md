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
