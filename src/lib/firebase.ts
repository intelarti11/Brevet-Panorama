
import { initializeApp, getApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // If you need auth
// import { getStorage } from 'firebase/storage'; // If you need storage

// --- IMPORTANT ---
// Replace the placeholder values below with your ACTUAL Firebase project configuration.
// You can find these details in your Firebase project console:
// Project settings > General > Your apps > SDK setup and configuration
const firebaseConfig: FirebaseOptions = {
  apiKey: "YOUR_API_KEY", // Replace with your Firebase API Key
  authDomain: "YOUR_AUTH_DOMAIN", // Replace with your Firebase Auth Domain
  projectId: "YOUR_PROJECT_ID", // Replace with your Firebase Project ID
  storageBucket: "YOUR_STORAGE_BUCKET", // Replace with your Firebase Storage Bucket
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // Replace with your Firebase Messaging Sender ID
  appId: "YOUR_APP_ID", // Replace with your Firebase App ID
  // measurementId: "YOUR_MEASUREMENT_ID", // Optional: Replace if you use Google Analytics
};

// Check if essential Firebase config values are present (after you've replaced placeholders)
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
    // Il serait peut-être judicieux de lever une erreur ici ou de gérer cet état
    // si l'application ne peut pas être initialisée et que db en dépend.
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
     // Il serait peut-être judicieux de lever une erreur ici ou de gérer cet état
  }
} else {
  console.error("L'application Firebase n'est pas initialisée. Firestore est inaccessible.");
}

export { app, db /*, auth, storage */ };
