
import { initializeApp, getApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // If you need auth
// import { getStorage } from 'firebase/storage'; // If you need storage

// Your web app's Firebase configuration
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAB1KxMlcTkqUoFXJojlRco3AOTpk9jkaw",
  authDomain: "brevet-panorama.firebaseapp.com",
  projectId: "brevet-panorama",
  storageBucket: "brevet-panorama.appspot.com", // Corrected from .firebasestorage.app to .appspot.com
  messagingSenderId: "486402169414",
  appId: "1:486402169414:web:67ccb79f3c06722fcdc847"
  // measurementId: "YOUR_MEASUREMENT_ID", // Optional: Add if you use Google Analytics
};

// Check if essential Firebase config values are present (after you've replaced placeholders)
// This check is now less critical if the user provides the full config directly, but good for general template.
if (firebaseConfig.apiKey === "YOUR_API_KEY" || firebaseConfig.projectId === "YOUR_PROJECT_ID" || !firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    "ERREUR DE CONFIGURATION FIREBASE : Clé API ou ID de projet manquant ou non remplacé. " +
    "Veuillez remplacer les valeurs 'YOUR_...' dans src/lib/firebase.ts par votre configuration Firebase réelle."
  );
}

// Initialize Firebase
let app;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
  } catch (e) {
    console.error("Erreur d'initialisation Firebase:", e);
    // It might be wise to throw an error here or handle this state
    // if the app cannot be initialized and db depends on it.
  }
} else {
  app = getApp();
}

let db;
if (app) {
  try {
    db = getFirestore(app);
  } catch (e) {
    console.error("Erreur d'initialisation Firestore:", e);
     // It might be wise to throw an error here or handle this state
  }
} else {
  console.error("L'application Firebase n'est pas initialisée. Firestore est inaccessible.");
}

export { app, db /*, auth, storage */ };
