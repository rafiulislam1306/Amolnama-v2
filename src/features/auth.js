// src/features/auth.js
import { auth, db } from '../config/firebase.js';
import { setPersistence, browserLocalPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, updatePassword } from "firebase/auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { AppState, resetAppState } from '../core/state.js';

function getCleanPhoneNumber(phone) {
    let clean = phone.replace(/[\s\-\(\)\+]/g, '');
    if (clean.startsWith('880')) {
        clean = clean.substring(2);
    }
    if (!clean.startsWith('0')) {
        clean = '0' + clean;
    }
    return clean;
}

function getPhoneVirtualEmail(phone) {
    const clean = getCleanPhoneNumber(phone);
    return `phone_${clean}@amolnama.internal`;
}

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

// ==========================================
//   PHONE + PIN SIGN-IN HANDLERS
// ==========================================

export function showPhoneLoginView() {
    document.getElementById('auth-main-options').style.display = 'none';
    document.getElementById('auth-phone-view').style.display = 'flex';
    resetPhoneLoginView();
}

export function hidePhoneLoginView() {
    document.getElementById('auth-phone-view').style.display = 'none';
    document.getElementById('auth-main-options').style.display = 'flex';
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';
}

export function resetPhoneLoginView() {
    const phoneInput = document.getElementById('auth-phone-input');
    const pinInput = document.getElementById('auth-pin-input');
    if (phoneInput) phoneInput.value = '';
    if (pinInput) pinInput.value = '';
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';
}

export async function signInWithPhoneAndPin() {
    const rawPhone = document.getElementById('auth-phone-input').value.trim();
    const pin = document.getElementById('auth-pin-input').value.trim();
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';

    if (!rawPhone) {
        showAppAlert("Missing Input", "Please enter your mobile phone number.");
        return;
    }
    if (!pin || pin.length < 4) {
        showAppAlert("Missing Input", "Please enter your 4 to 6-digit PIN.");
        return;
    }

    const virtualEmail = getPhoneVirtualEmail(rawPhone);
    const signinBtn = document.getElementById('btn-phone-signin');
    signinBtn.disabled = true;
    signinBtn.innerText = "SIGNING IN...";

    try {
        await signInWithEmailAndPassword(auth, virtualEmail, pin);
        showFlashMessage("Signed in successfully!");
    } catch (err) {
        console.error("Phone PIN sign in error:", err);
        let msg = "Invalid phone number or PIN.";
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            msg = "No account found with this phone number & PIN. Please sign in with Google first and link your phone in Profile Hub.";
        } else if (err.code === 'auth/wrong-password') {
            msg = "Incorrect PIN. Please check your PIN and try again.";
        } else if (err.code === 'auth/operation-not-allowed') {
            msg = "Email/Password sign-in provider is not enabled in Firebase Console. Please enable it under Authentication > Sign-in method.";
        }
        if (errorEl) errorEl.innerText = msg;
        showAppAlert("Sign-In Failed", msg);
    } finally {
        signinBtn.disabled = false;
        signinBtn.innerText = "SIGN IN WITH PIN";
    }
}

// ==========================================
//   PHONE + PIN LINKING HANDLERS
// ==========================================

export function openLinkPhoneModal() {
    closeModal('modal-profile-hub');
    const phoneInput = document.getElementById('link-phone-input');
    const pinInput = document.getElementById('link-pin-input');
    const confirmInput = document.getElementById('link-pin-confirm');
    const errorEl = document.getElementById('link-phone-error');
    
    if (phoneInput) {
        const existingEmail = AppState.currentUser?.providerData?.find(p => p.providerId === 'password')?.email;
        if (existingEmail && existingEmail.startsWith('phone_')) {
            const extracted = existingEmail.replace('phone_', '').replace('@amolnama.internal', '');
            phoneInput.value = extracted;
        } else {
            phoneInput.value = '';
        }
    }
    if (pinInput) pinInput.value = '';
    if (confirmInput) confirmInput.value = '';
    if (errorEl) errorEl.innerText = '';
    
    openModal('modal-link-phone');
}

export async function linkPhoneAndPin() {
    if (!auth.currentUser) {
        showAppAlert("Not Signed In", "Please sign in first with Google to link your phone.");
        return;
    }

    const rawPhone = document.getElementById('link-phone-input').value.trim();
    const pin = document.getElementById('link-pin-input').value.trim();
    const confirmPin = document.getElementById('link-pin-confirm').value.trim();
    const errorEl = document.getElementById('link-phone-error');
    if (errorEl) errorEl.innerText = '';

    if (!rawPhone || rawPhone.length < 11) {
        showAppAlert("Invalid Phone", "Please enter a valid 11-digit mobile number.");
        return;
    }
    if (!pin || pin.length < 4) {
        showAppAlert("Invalid PIN", "Please enter a security PIN of at least 4 digits.");
        return;
    }
    if (pin !== confirmPin) {
        showAppAlert("PIN Mismatch", "The PIN and confirmation PIN do not match.");
        return;
    }

    const cleanPhone = getCleanPhoneNumber(rawPhone);
    const virtualEmail = getPhoneVirtualEmail(cleanPhone);
    const saveBtn = document.getElementById('btn-save-phone-pin');
    saveBtn.disabled = true;
    saveBtn.innerText = "SAVING...";

    try {
        const credential = EmailAuthProvider.credential(virtualEmail, pin);
        
        // Check if user already has an email/password credential linked
        const hasEmailProvider = auth.currentUser.providerData?.some(p => p.providerId === 'password');
        
        if (hasEmailProvider) {
            try {
                await updatePassword(auth.currentUser, pin);
            } catch(passErr) {
                await linkWithCredential(auth.currentUser, credential);
            }
        } else {
            await linkWithCredential(auth.currentUser, credential);
        }

        // Save phone metadata to Firestore user doc
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                linkedPhone: cleanPhone,
                phoneAuthLinked: true,
                updatedAt: serverTimestamp()
            });
        } catch (dbErr) {
            console.warn("Could not save linked phone to Firestore user doc:", dbErr);
        }

        closeModal('modal-link-phone');
        showAppAlert("Phone & PIN Linked! 🎉", `Phone ${cleanPhone} is now linked to your account! You can now sign in using this phone number and PIN anytime.`);
        openProfileHub();
    } catch (err) {
        console.error("Link phone and PIN error:", err);
        let msg = err.message || "Failed to link phone & PIN.";
        if (err.code === 'auth/email-already-in-use' || err.code === 'auth/credential-already-in-use') {
            msg = "This phone number is already linked to another account.";
        } else if (err.code === 'auth/requires-recent-login') {
            msg = "Please log out and sign in with Google again before updating your security PIN.";
        } else if (err.code === 'auth/operation-not-allowed') {
            msg = "Email/Password sign-in provider is not enabled in Firebase Console. Please enable it under Authentication > Sign-in method.";
        }
        if (errorEl) errorEl.innerText = msg;
        showAppAlert("Linking Failed", msg);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = "SAVE & LINK TO ACCOUNT";
    }
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
    
    const passwordProvider = AppState.currentUser?.providerData?.find(p => p.providerId === 'password');
    const linkPhoneTitle = document.getElementById('hub-link-phone-title');
    const linkPhoneDesc = document.getElementById('hub-link-phone-desc');
    
    if (linkPhoneTitle && linkPhoneDesc) {
        if (passwordProvider && passwordProvider.email && passwordProvider.email.startsWith('phone_')) {
            const phoneNum = passwordProvider.email.replace('phone_', '').replace('@amolnama.internal', '');
            linkPhoneTitle.innerText = "Linked: " + phoneNum;
            linkPhoneDesc.innerText = "Phone & PIN linked. Tap to update PIN or number";
        } else {
            linkPhoneTitle.innerText = "Set Up Phone & PIN";
            linkPhoneDesc.innerText = "Connect phone & PIN to sign in without Google";
        }
    }
    
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
