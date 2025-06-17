
import { initializeApp, getApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // If you need auth
// import { getStorage } from 'firebase/storage'; // If you need storage

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// Check if essential Firebase config values are present
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error(
    "ERREUR DE CONFIGURATION FIREBASE : Clé API ou ID de projet manquant. " +
    "Assurez-vous que NEXT_PUBLIC_FIREBASE_API_KEY et NEXT_PUBLIC_FIREBASE_PROJECT_ID sont définis dans votre environnement."
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
