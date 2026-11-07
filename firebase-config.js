/* À remplir une seule fois (voir GUIDE.md, étapes 2 et 3).
   Ces valeurs ne sont pas secrètes : c'est normal qu'elles soient visibles sur GitHub.
   La sécurité vient des règles Firestore (firestore.rules) et de la liste des domaines autorisés. */

export const FIREBASE_CONFIG = {
  apiKey: "A_REMPLIR",
  authDomain: "A_REMPLIR",
  projectId: "A_REMPLIR",
  storageBucket: "A_REMPLIR",
  messagingSenderId: "A_REMPLIR",
  appId: "A_REMPLIR"
};

/* ID client OAuth « Application Web » créé dans Google Cloud (étape 3) */
export const GOOGLE_CLIENT_ID = "358830416785-euact12sre7mcupm8ml1dbcoirpsvkrb.apps.googleusercontent.com";

/* Le seul compte autorisé à ouvrir l'appli */
export const ALLOWED_EMAIL = "t.mallet06@gmail.com";

/* Adresse du petit script Google qui renouvelle l'accès à l'agenda en arrière-plan
   (voir scripts/jeton-agenda/LISEZMOI.md). Vide = ancienne méthode avec la fenêtre Google. */
export const AGENDA_TOKEN_URL = "https://script.google.com/macros/s/AKfycbwGSWlLg8RIUenqGp0U-eLU9KWKKTijynl5lvHODCjqw0I17Rte0KCHnpI7IForbFA/exec";
