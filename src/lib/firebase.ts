
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
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'europe-west1');

// Connect to emulators in development mode. This should only run on the client.
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log("Development mode: Connecting to Firebase emulators...");
    try {
      // Use 127.0.0.1 instead of localhost to avoid potential IPv6 issues
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      console.log("Successfully configured to use Firebase emulators.");
    } catch (error) {
        console.error("Error connecting to emulators:", error);
    }
}

export { app, db, auth, functions };
