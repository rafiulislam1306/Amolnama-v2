import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyDKLwCjHapOYpfonjYpg9MELLp3EmHvwN4",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "amolnama-new.firebaseapp.com",
    projectId: env.VITE_FIREBASE_PROJECT_ID || "amolnama-new",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "amolnama-new.firebasestorage.app",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "136752837265",
    appId: env.VITE_FIREBASE_APP_ID || "1:136752837265:web:f679fe6044ac0ebf0cc530"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Modern way to initialize Firestore with offline caching enabled (and supports multiple tabs!)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export { app, auth, db };