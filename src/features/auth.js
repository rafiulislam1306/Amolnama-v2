// src/features/auth.js
import { auth, db } from '../config/firebase.js';
import { setPersistence, browserLocalPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, EmailAuthProvider, linkWithCredential, signInWithEmailAndPassword, updatePassword, updateEmail } from "firebase/auth";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { showAppAlert, showFlashMessage, openModal, closeModal, markInputError, clearInputError } from '../utils/ui-helpers.js';
import { formatUserIdentifier } from '../utils/helpers.js';
import { AppState, resetAppState } from '../core/state.js';
import { getRecycleAttentionCount } from './recycle.js';

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
    clearInputError(phoneInput);
    clearInputError(pinInput);
    if (phoneInput) phoneInput.value = '';
    if (pinInput) {
        pinInput.value = '';
        pinInput.type = 'password';
    }
    resetPinToggleState('modal-auth');
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';
}

export async function signInWithPhoneAndPin() {
    const phoneInput = document.getElementById('auth-phone-input');
    const pinInput = document.getElementById('auth-pin-input');
    clearInputError(phoneInput);
    clearInputError(pinInput);
    const rawPhone = phoneInput ? phoneInput.value.trim() : '';
    const pin = pinInput ? pinInput.value.trim() : '';
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';

    const cleanPhone = rawPhone ? getCleanPhoneNumber(rawPhone) : '';
    if (!cleanPhone || !/^01[3-9]\d{8}$/.test(cleanPhone)) {
        markInputError(phoneInput);
        showAppAlert("Invalid Phone", "Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX).");
        return;
    }
    if (!pin || pin.length < 6 || pin.length > 8) {
        markInputError(pinInput);
        showAppAlert("Invalid PIN", "Please enter your 6 to 8-digit PIN.");
        return;
    }

    const virtualEmail = getPhoneVirtualEmail(cleanPhone);
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
        } else if (err.code === 'auth/too-many-requests') {
            msg = "Too many failed attempts. Please wait a few minutes before trying again.";
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

function resetPinToggleState(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal || typeof modal.querySelectorAll !== 'function') return;
    modal.querySelectorAll('.pin-toggle-btn').forEach(btn => {
        btn.setAttribute('aria-label', 'Show PIN');
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
}

export function togglePinVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (btnEl) {
        btnEl.setAttribute('aria-label', isPassword ? 'Hide PIN' : 'Show PIN');
        btnEl.innerHTML = isPassword
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
}

export async function copyActiveSessionId() {
    const sid = AppState.currentSessionId;
    if (!sid) return;
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(sid);
            showFlashMessage("Session ID copied!");
            return;
        }
    } catch (_) {
        // Fallback below
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = sid;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showFlashMessage("Session ID copied!");
    } catch (_) {
        showAppAlert("Copy Failed", "Could not copy Session ID.");
    }
}

export function openLinkPhoneModal() {
    closeModal('modal-profile-hub');
    const phoneInput = document.getElementById('link-phone-input');
    const pinInput = document.getElementById('link-pin-input');
    const confirmInput = document.getElementById('link-pin-confirm');
    const errorEl = document.getElementById('link-phone-error');
    clearInputError(phoneInput);
    clearInputError(pinInput);
    clearInputError(confirmInput);
    
    if (phoneInput) {
        const existingEmail = AppState.currentUser?.providerData?.find(p => p.providerId === 'password')?.email;
        if (existingEmail && existingEmail.startsWith('phone_')) {
            const extracted = existingEmail.replace('phone_', '').replace('@amolnama.internal', '');
            phoneInput.value = extracted;
        } else {
            phoneInput.value = '';
        }
    }
    if (pinInput) {
        pinInput.value = '';
        pinInput.type = 'password';
    }
    if (confirmInput) {
        confirmInput.value = '';
        confirmInput.type = 'password';
    }
    resetPinToggleState('modal-link-phone');
    if (errorEl) errorEl.innerText = '';
    
    openModal('modal-link-phone');
}

export async function linkPhoneAndPin() {
    if (!auth.currentUser) {
        showAppAlert("Not Signed In", "Please sign in first with Google to link your phone.");
        return;
    }

    const phoneInput = document.getElementById('link-phone-input');
    const pinInput = document.getElementById('link-pin-input');
    const confirmInput = document.getElementById('link-pin-confirm');
    clearInputError(phoneInput);
    clearInputError(pinInput);
    clearInputError(confirmInput);
    const rawPhone = phoneInput ? phoneInput.value.trim() : '';
    const pin = pinInput ? pinInput.value.trim() : '';
    const confirmPin = confirmInput ? confirmInput.value.trim() : '';
    const errorEl = document.getElementById('link-phone-error');
    if (errorEl) errorEl.innerText = '';

    const cleanPhone = rawPhone ? getCleanPhoneNumber(rawPhone) : '';
    if (!cleanPhone || !/^01[3-9]\d{8}$/.test(cleanPhone)) {
        markInputError(phoneInput);
        showAppAlert("Invalid Phone", "Please enter a valid 11-digit mobile number (e.g. 017XXXXXXXX).");
        return;
    }
    if (!pin || pin.length < 6 || pin.length > 8) {
        markInputError(pinInput);
        showAppAlert("Invalid PIN", "Please enter a security PIN of 6 to 8 digits.");
        return;
    }
    if (pin !== confirmPin) {
        markInputError(confirmInput);
        showAppAlert("PIN Mismatch", "The PIN and confirmation PIN do not match.");
        return;
    }

    const virtualEmail = getPhoneVirtualEmail(cleanPhone);
    const saveBtn = document.getElementById('btn-save-phone-pin');
    saveBtn.disabled = true;
    saveBtn.innerText = "SAVING...";

    try {
        const credential = EmailAuthProvider.credential(virtualEmail, pin);
        
        // Check if user already has an email/password credential linked
        const emailProvider = auth.currentUser.providerData?.find(p => p.providerId === 'password');
        
        if (emailProvider) {
            if (emailProvider.email && emailProvider.email !== virtualEmail) {
                await updateEmail(auth.currentUser, virtualEmail);
            }
            await updatePassword(auth.currentUser, pin);
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

        if (typeof auth.currentUser.reload === 'function') {
            try { await auth.currentUser.reload(); } catch (_) {}
        }

        closeModal('modal-link-phone');
        showAppAlert("Phone & PIN Linked", `Phone ${cleanPhone} is now linked to your account! You can now sign in using this phone number and PIN anytime.`);
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
    document.getElementById('hub-user-email').innerText = formatUserIdentifier(AppState.currentUser.email);
    
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
    
    if (roleBadge) {
        roleBadge.innerText = displayRole;
        if (isHighLevel) {
            roleBadge.style.background = 'var(--info-bg)';
            roleBadge.style.color = 'var(--info-text)';
            roleBadge.style.borderColor = 'var(--info-border)';
        } else {
            roleBadge.style.background = 'var(--bg-color)';
            roleBadge.style.color = 'var(--text-secondary)';
            roleBadge.style.borderColor = 'var(--border-color)';
        }
    }
    
    // STRICT RULE: Only Center Admin can manage and change systems
    const adminSection = document.getElementById('hub-admin-section');
    if (adminSection) {
        adminSection.style.display = userRole === 'admin' ? 'flex' : 'none';
    }

    // Show attention count badge on Recycle SIM Tracker if arrived/overdue items await action
    const recycleBadge = document.getElementById('hub-recycle-attention-badge');
    if (recycleBadge) {
        const attentionCount = getRecycleAttentionCount();
        if (attentionCount > 0) {
            recycleBadge.innerText = `${attentionCount} action`;
            recycleBadge.style.display = 'inline-flex';
        } else {
            recycleBadge.style.display = 'none';
        }
    }
    
    // Populate Diagnostic Info
    document.getElementById('hub-active-desk').innerText = AppState.currentDeskName || 'None';
    document.getElementById('hub-active-session').innerText = AppState.currentSessionId || 'None';
    const copySessionBtn = document.getElementById('hub-copy-session-btn');
    if (copySessionBtn) {
        copySessionBtn.style.display = AppState.currentSessionId ? 'inline-flex' : 'none';
    }
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
            dbStatusEl.style.color = 'var(--warning-text)';
        } else {
            dbStatusEl.innerText = 'Online';
            dbStatusEl.style.color = 'var(--success-text)';
        }
    } else {
        dbStatusEl.innerText = 'Offline (Device)';
        dbStatusEl.style.color = 'var(--danger-text)';
    }

    const scrollBody = document.querySelector('#modal-profile-hub .hub-scroll-body');
    if (scrollBody) scrollBody.scrollTop = 0;

    syncThemeToggleUI();
    
    openModal('modal-profile-hub');
}

// ==========================================
//   GLOBAL THEME (LIGHT / DARK) MANAGEMENT
// ==========================================
const THEME_STORAGE_KEY = 'amolnama_theme';

export function isDarkModeActive() {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    const explicitAttr = root?.getAttribute?.('data-theme');
    if (explicitAttr === 'dark') return true;
    if (explicitAttr === 'light') return false;

    try {
        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null;
        if (stored === 'dark') return true;
        if (stored === 'light') return false;
    } catch (_) {
        // Ignore storage restrictions
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return Boolean(window.matchMedia('(prefers-color-scheme: dark)')?.matches);
    }
    return false;
}

export function syncThemeToggleUI() {
    if (typeof document === 'undefined') return;
    const dark = isDarkModeActive();
    const toggleBtn = document.getElementById('hub-theme-toggle');
    const trackEl = document.getElementById('hub-theme-switch-track');
    const descEl = document.getElementById('hub-theme-desc');
    const iconEl = document.getElementById('hub-theme-icon');

    if (toggleBtn && typeof toggleBtn.setAttribute === 'function') {
        toggleBtn.setAttribute('aria-checked', dark ? 'true' : 'false');
    }
    if (trackEl && trackEl.classList && typeof trackEl.classList.toggle === 'function') {
        trackEl.classList.toggle('is-on', dark);
    }
    if (descEl) {
        descEl.innerText = dark ? 'Dark theme active' : 'Light theme active';
    }
    if (iconEl) {
        if (iconEl.style) {
            iconEl.style.background = dark ? 'var(--purple-bg)' : 'var(--info-bg)';
            iconEl.style.color = dark ? 'var(--purple-text)' : 'var(--info-text)';
        }
        iconEl.innerHTML = dark
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
    }
}

export function applyTheme(mode, { persist = true } = {}) {
    const normalized = mode === 'dark' ? 'dark' : 'light';
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-theme', normalized);
        if (document.documentElement.style) {
            document.documentElement.style.colorScheme = normalized;
        }
        const metaTheme = typeof document.querySelector === 'function' ? document.querySelector('meta[name="theme-color"]') : null;
        if (metaTheme && typeof metaTheme.setAttribute === 'function') {
            metaTheme.setAttribute('content', normalized === 'dark' ? '#0e1621' : '#007bff');
        }
    }

    if (persist) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(THEME_STORAGE_KEY, normalized);
            }
        } catch (_) {
            // Ignore storage errors
        }
    }

    syncThemeToggleUI();
    return normalized;
}

export function toggleDarkMode() {
    const nextMode = isDarkModeActive() ? 'light' : 'dark';
    applyTheme(nextMode, { persist: true });
    showFlashMessage(nextMode === 'dark' ? 'Dark Mode enabled' : 'Light Mode enabled');
    return nextMode;
}

export function initTheme() {
    let saved = null;
    try {
        saved = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null;
    } catch (_) {
        saved = null;
    }

    if (saved === 'dark' || saved === 'light') {
        applyTheme(saved, { persist: false });
    } else {
        syncThemeToggleUI();
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemChange = () => {
            try {
                const currentSaved = typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null;
                if (!currentSaved) syncThemeToggleUI();
            } catch (_) {
                syncThemeToggleUI();
            }
        };
        if (mql && typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', handleSystemChange);
        }
    }
}

