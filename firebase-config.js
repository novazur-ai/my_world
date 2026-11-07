/* À remplir une seule fois (voir GUIDE.md, étapes 2 et 3).
   Ces valeurs ne sont pas secrètes : c'est normal qu'elles soient visibles sur GitHub.
   La sécurité vient des règles Firestore (firestore.rules) et de la liste des domaines autorisés. */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBgYrV_-hMre0i_0IBGU70yAopTrFIXK0E",
  authDomain: "my-world-9e3e1.firebaseapp.com",
  projectId: "my-world-9e3e1",
  storageBucket: "my-world-9e3e1.firebasestorage.app",
  messagingSenderId: "1039494855756",
  appId: "1:1039494855756:web:4710de4bc941adf2c4c8e9"
};

/* ID client OAuth « Application Web » créé dans Google Cloud (étape 3) */
export const GOOGLE_CLIENT_ID = "358830416785-euact12sre7mcupm8ml1dbcoirpsvkrb.apps.googleusercontent.com";

/* Le seul compte autorisé à ouvrir l'appli */
export const ALLOWED_EMAIL = "t.mallet06@gmail.com";

/* Adresse du petit script Google qui renouvelle l'accès à l'agenda en arrière-plan
   (voir scripts/jeton-agenda/LISEZMOI.md). Vide = ancienne méthode avec la fenêtre Google. */
export const AGENDA_TOKEN_URL = "https://script.google.com/macros/s/AKfycbyAIiZJTIT9MJr5q1zStH7ZNBBUjlkpp0oT9WdAt9DRQxZ5vgQ1u-V-Nzpatk2AVtX8Qg/exec";
