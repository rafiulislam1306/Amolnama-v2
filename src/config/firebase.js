import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA4YyIOi1xSddHCeLMdBN5mwrjQbJPn_Iw",
    authDomain: "amolnama-cc2bf.firebaseapp.com",
    projectId: "amolnama-cc2bf",
    storageBucket: "amolnama-cc2bf.firebasestorage.app",
    messagingSenderId: "283254200113",
    appId: "1:283254200113:web:248a3bff50f167568ec210"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable offline caching
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn("Offline persistence only works when one tab of the app is open.");
    }
});

export { app, auth, db };