// src/features/auth.js
import { auth } from '../config/firebase.js';
import { setPersistence, browserLocalPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { showAppAlert, openModal } from '../utils/ui-helpers.js';
import { AppState, resetAppState } from '../core/state.js';

export function initAuth(onLoginSuccess, onLogout) {
    const setupAuthState = () => {
        onAuthStateChanged(auth, user => {
            if (user) {
                document.getElementById('modal-auth').classList.remove('active');
                onLoginSuccess(user);
            } else {
                document.getElementById('modal-auth').classList.add('active');
                onLogout();
            }
        });
    };

    setPersistence(auth, browserLocalPersistence)
      .then(setupAuthState)
      .catch((error) => {
          console.error("Error setting persistence:", error);
          setupAuthState(); // Ensure the app still boots if persistence is blocked
      });
}

export function signInWithGoogle() { 
    const provider = new GoogleAuthProvider(); 
    signInWithPopup(auth, provider).catch(error => {
        showAppAlert("Sign-In Failed", error.message);
        const errorEl = document.getElementById('auth-error');
        if (errorEl) errorEl.innerText = error.message;
    }); 
}

export function logout() {
    signOut(auth).then(() => {
        resetAppState(); // Securely wipe memory before browser reloads
        window.location.reload();
    }).catch((error) => {
        showAppAlert("Logout Error", "Something went wrong while signing out.");
        console.error("Error signing out:", error);
    });
}

export function openProfileHub() {
    if (!AppState.currentUser) return;
    
    document.getElementById('hub-user-photo').src = AppState.currentUser.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666666'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    document.getElementById('hub-user-name').innerText = AppState.userNickname || AppState.userDisplayName;
    document.getElementById('hub-user-email').innerText = AppState.currentUser.email || 'No Email Linked';
    
    let roleBadge = document.getElementById('hub-user-role');
    let userRole = AppState.currentUserRole;
    
    let displayRole = 'Floor Agent';
    let isHighLevel = ['manager', 'center_manager', 'admin', 'owner'].includes(userRole);
    
    if (userRole === 'admin') displayRole = 'Center Admin';
    else if (userRole === 'owner') displayRole = 'System Owner';
    else if (userRole === 'center_manager') displayRole = 'Center Manager';
    else if (userRole === 'manager') displayRole = 'Floor Manager';
    
    roleBadge.innerText = displayRole;
    if (isHighLevel) {
        roleBadge.style.background = '#e0f2fe';
        roleBadge.style.color = '#0284c7';
    } else {
        roleBadge.style.background = '#f1f5f9';
        roleBadge.style.color = '#475569';
    }
    
    // STRICT RULE: Only Center Admin can manage and change systems
    document.getElementById('hub-admin-section').style.display = userRole === 'admin' ? 'block' : 'none';
    
    // Populate Diagnostic Info
    document.getElementById('hub-active-desk').innerText = AppState.currentDeskName || 'None';
    document.getElementById('hub-active-session').innerText = AppState.currentSessionId || 'None';
    let dbStatusEl = document.getElementById('hub-db-status');
    if (navigator.onLine) {
        let isOfflineSession = false;
        if (AppState.currentSessionId) {
            const cachedSession = JSON.parse(localStorage.getItem('amolnama_cache_session_' + AppState.currentSessionId) || 'null');
            if (cachedSession && cachedSession.isOfflineGenerated) {
                isOfflineSession = true;
            }
        }
        if (isOfflineSession) {
            const errMsg = AppState.lastError ? ` (${AppState.lastError})` : '';
            dbStatusEl.innerText = 'Offline Fallback' + errMsg;
            dbStatusEl.style.color = '#f59e0b';
        } else {
            dbStatusEl.innerText = 'Online';
            dbStatusEl.style.color = '#10b981';
        }
    } else {
        dbStatusEl.innerText = 'Offline (Device)';
        dbStatusEl.style.color = '#ef4444';
    }
    
    openModal('modal-profile-hub');
}
