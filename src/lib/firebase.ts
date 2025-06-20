
import { initializeApp, getApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// Your web app's Firebase configuration
// IMPORTANT: Ensure these values are correct for YOUR Firebase project.
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAB1KxMlcTkqUoFXJojlRco3AOTpk9jkaw",
  authDomain: "brevet-panorama.firebaseapp.com",
  projectId: "brevet-panorama",
  storageBucket: "brevet-panorama.appspot.com",
  messagingSenderId: "486402169414",
  appId: "1:486402169414:web:67ccb79f3c06722fcdc847"
  // measurementId: "YOUR_MEASUREMENT_ID", // Optional: Add if you use Google Analytics
};

// Initialize Firebase
let app;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
  } catch (e) {
    console.error("Erreur d'initialisation Firebase:", e);
  }
} else {
  app = getApp();
}

let db;
let auth;
let functions;

if (app) {
  try {
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, 'europe-west1');

    if (process.env.NODE_ENV === 'development') {
      console.log("Development mode: attempting to connect to Firebase emulators...");
      // Use 127.0.0.1 instead of localhost to avoid potential IPv6 issues
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      console.log("Successfully configured to use Firebase emulators.");
    }
  } catch (e) {
    console.error("Erreur d'initialisation des services Firebase:", e);
  }
} else {
  console.error("L'application Firebase n'est pas initialisée. Les services Firebase sont inaccessibles.");
}

export { app, db, auth, functions };
