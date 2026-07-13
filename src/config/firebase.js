import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDKLwCjHapOYpfonjYpg9MELLp3EmHvwN4",
    authDomain: "amolnama-new.firebaseapp.com",
    projectId: "amolnama-new",
    storageBucket: "amolnama-new.firebasestorage.app",
    messagingSenderId: "136752837265",
    appId: "1:136752837265:web:f679fe6044ac0ebf0cc530"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Modern way to initialize Firestore with offline caching enabled (and supports multiple tabs!)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export { app, auth, db };