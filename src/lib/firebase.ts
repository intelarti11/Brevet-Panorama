
import { initializeApp, getApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

// Your web app's Firebase configuration
const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAB1KxMlcTkqUoFXJojlRco3AOTpk9jkaw",
  authDomain: "brevet-panorama.firebaseapp.com",
  projectId: "brevet-panorama",
  storageBucket: "brevet-panorama.appspot.com",
  messagingSenderId: "486402169414",
  appId: "1:486402169414:web:67ccb79f3c06722fcdc847"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'europe-west1');

export { app, db, auth, functions };
