// src/features/auth.js
import { auth } from '../config/firebase.js';
import { setPersistence, browserLocalPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { showAppAlert } from '../utils/ui-helpers.js';

export function initAuth(onLoginSuccess, onLogout) {
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        onAuthStateChanged(auth, user => {
            if (user) {
                document.getElementById('modal-auth').classList.remove('active');
                onLoginSuccess(user);
            } else {
                document.getElementById('modal-auth').classList.add('active');
                onLogout();
            }
        });
      })
      .catch((error) => console.error("Error setting persistence:", error));
}

export function signInWithGoogle() { 
    const provider = new GoogleAuthProvider(); 
    signInWithPopup(auth, provider).catch(error => {
        document.getElementById('auth-error').innerText = error.message;
    }); 
}

export function logout() {
    signOut(auth).then(() => {
        window.location.reload();
    }).catch((error) => {
        showAppAlert("Logout Error", "Something went wrong while signing out.");
        console.error("Error signing out:", error);
    });
}