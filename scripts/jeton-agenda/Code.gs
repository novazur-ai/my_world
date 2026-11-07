/* My World : renouvelle l'accès à Google Agenda en arrière-plan.
   Le script tourne avec le compte du propriétaire et ne répond qu'à lui :
   il vérifie d'abord que la demande vient bien de sa session dans l'appli. */
const ALLOWED_EMAIL = "t.mallet06@gmail.com";
const FIREBASE_API_KEY = "A_REMPLIR"; // clé publique Firebase, déjà visible dans firebase-config.js

function doPost(e) {
  let out;
  try {
    const idToken = JSON.parse(e.postData.contents).idToken;
    const r = UrlFetchApp.fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
      method: "post", contentType: "application/json", payload: JSON.stringify({ idToken: idToken }),
      headers: { Referer: "https://PSEUDO.github.io/" }, muteHttpExceptions: true
    });
    const u = (JSON.parse(r.getContentText()).users || [])[0];
    if (!u || String(u.email).toLowerCase() !== ALLOWED_EMAIL || !u.emailVerified) out = { error: "refused" };
    else out = { token: ScriptApp.getOAuthToken() };
  } catch (err) {
    out = { error: "bad_request" };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* À lancer une fois depuis l'éditeur pour donner l'autorisation. */
function autoriser() {
  const r = Calendar.Events.list("primary", { maxResults: 1 });
  Logger.log("C'est bon, l'agenda répond (" + (r.items || []).length + " événement lu).");
}
