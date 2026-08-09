// src/features/auth.js
import { auth } from '../config/firebase.js';
import { setPersistence, browserLocalPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber } from "firebase/auth";
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { AppState, resetAppState } from '../core/state.js';

let phoneConfirmationResult = null;
let phoneRecaptchaVerifier = null;
let linkConfirmationResult = null;
let linkRecaptchaVerifier = null;

function formatToE164(phone) {
    let clean = phone.replace(/[\s\-\(\)]/g, '');
    if (clean.startsWith('01')) {
        clean = '+880' + clean.substring(1);
    } else if (clean.startsWith('8801')) {
        clean = '+' + clean;
    } else if (!clean.startsWith('+')) {
        clean = '+88' + clean;
    }
    return clean;
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
//   PHONE SIGN-IN HANDLERS
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
    if (phoneRecaptchaVerifier) {
        try { phoneRecaptchaVerifier.clear(); } catch(e){}
        phoneRecaptchaVerifier = null;
    }
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';

    document.getElementById('phone-step-number').style.display = 'flex';
    document.getElementById('phone-step-otp').style.display = 'none';
    document.getElementById('auth-otp-input').value = '';
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';
}

export async function sendPhoneLoginOtp() {
    const rawPhone = document.getElementById('auth-phone-input').value.trim();
    if (!rawPhone) {
        showAppAlert("Missing Input", "Please enter your mobile phone number.");
        return;
    }
    const formattedPhone = formatToE164(rawPhone);
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';

    const sendBtn = document.getElementById('btn-send-phone-otp');
    sendBtn.disabled = true;
    sendBtn.innerText = "SENDING OTP...";

    try {
        if (phoneRecaptchaVerifier) {
            try { phoneRecaptchaVerifier.clear(); } catch(e){}
            phoneRecaptchaVerifier = null;
        }
        const container = document.getElementById('recaptcha-container');
        if (container) container.innerHTML = '';

        phoneRecaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'invisible'
        });

        phoneConfirmationResult = await signInWithPhoneNumber(auth, formattedPhone, phoneRecaptchaVerifier);
        document.getElementById('phone-step-number').style.display = 'none';
        document.getElementById('phone-step-otp').style.display = 'flex';
        document.getElementById('phone-otp-sent-to').innerText = `6-digit code sent to ${formattedPhone}`;
        showFlashMessage("Verification code sent via SMS!");
    } catch (err) {
        console.error("Phone sign in error:", err);
        if (errorEl) errorEl.innerText = err.message || "Failed to send SMS code.";
        showAppAlert("SMS Failed", err.message || "Could not send verification code. Please check number or connection.");
        if (phoneRecaptchaVerifier) {
            try { phoneRecaptchaVerifier.clear(); } catch(e){}
            phoneRecaptchaVerifier = null;
        }
        const container = document.getElementById('recaptcha-container');
        if (container) container.innerHTML = '';
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerText = "SEND VERIFICATION CODE";
    }
}

export async function verifyPhoneLoginOtp() {
    const otpCode = document.getElementById('auth-otp-input').value.trim();
    if (!otpCode || otpCode.length < 6) {
        showAppAlert("Invalid Code", "Please enter the complete 6-digit verification code.");
        return;
    }
    if (!phoneConfirmationResult) {
        showAppAlert("Session Expired", "Please request a new verification code.");
        resetPhoneLoginView();
        return;
    }

    const verifyBtn = document.getElementById('btn-verify-phone-otp');
    verifyBtn.disabled = true;
    verifyBtn.innerText = "VERIFYING...";
    const errorEl = document.getElementById('auth-error');
    if (errorEl) errorEl.innerText = '';

    try {
        await phoneConfirmationResult.confirm(otpCode);
        showFlashMessage("Signed in successfully!");
    } catch (err) {
        console.error("OTP verification error:", err);
        if (errorEl) errorEl.innerText = err.message || "Invalid verification code.";
        showAppAlert("Verification Failed", "The verification code entered is invalid or has expired.");
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerText = "VERIFY & SIGN IN";
    }
}

// ==========================================
//   PHONE LINKING HANDLERS
// ==========================================

export function openLinkPhoneModal() {
    closeModal('modal-profile-hub');
    resetLinkPhoneView();
    const phoneInput = document.getElementById('link-phone-input');
    if (phoneInput) {
        const existingPhone = AppState.currentUser?.phoneNumber || (AppState.currentUser?.providerData?.find(p => p.providerId === 'phone')?.phoneNumber) || '';
        phoneInput.value = existingPhone ? existingPhone.replace('+88', '') : '';
    }
    openModal('modal-link-phone');
}

export function resetLinkPhoneView() {
    if (linkRecaptchaVerifier) {
        try { linkRecaptchaVerifier.clear(); } catch(e){}
        linkRecaptchaVerifier = null;
    }
    const container = document.getElementById('link-recaptcha-container');
    if (container) container.innerHTML = '';

    document.getElementById('link-phone-step-number').style.display = 'flex';
    document.getElementById('link-phone-step-otp').style.display = 'none';
    document.getElementById('link-otp-input').value = '';
    const errorEl = document.getElementById('link-phone-error');
    if (errorEl) errorEl.innerText = '';
}

export async function sendLinkPhoneOtp() {
    if (!auth.currentUser) {
        showAppAlert("Not Signed In", "Please sign in first to link a phone number.");
        return;
    }
    const rawPhone = document.getElementById('link-phone-input').value.trim();
    if (!rawPhone) {
        showAppAlert("Missing Input", "Please enter your mobile phone number.");
        return;
    }
    const formattedPhone = formatToE164(rawPhone);
    const errorEl = document.getElementById('link-phone-error');
    if (errorEl) errorEl.innerText = '';

    const sendBtn = document.getElementById('btn-send-link-otp');
    sendBtn.disabled = true;
    sendBtn.innerText = "SENDING OTP...";

    try {
        if (linkRecaptchaVerifier) {
            try { linkRecaptchaVerifier.clear(); } catch(e){}
            linkRecaptchaVerifier = null;
        }
        const container = document.getElementById('link-recaptcha-container');
        if (container) container.innerHTML = '';

        linkRecaptchaVerifier = new RecaptchaVerifier(auth, 'link-recaptcha-container', {
            size: 'invisible'
        });

        linkConfirmationResult = await linkWithPhoneNumber(auth.currentUser, formattedPhone, linkRecaptchaVerifier);
        document.getElementById('link-phone-step-number').style.display = 'none';
        document.getElementById('link-phone-step-otp').style.display = 'flex';
        document.getElementById('link-otp-sent-to').innerText = `6-digit code sent to ${formattedPhone}`;
        showFlashMessage("Verification code sent via SMS!");
    } catch (err) {
        console.error("Link phone error:", err);
        if (errorEl) errorEl.innerText = err.message || "Failed to send SMS code.";
        showAppAlert("SMS Failed", err.message || "Could not send verification code. If this number is already linked to another account, you may need to unlink it first.");
        if (linkRecaptchaVerifier) {
            try { linkRecaptchaVerifier.clear(); } catch(e){}
            linkRecaptchaVerifier = null;
        }
        const container = document.getElementById('link-recaptcha-container');
        if (container) container.innerHTML = '';
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerText = "SEND VERIFICATION CODE";
    }
}

export async function verifyLinkPhoneOtp() {
    const otpCode = document.getElementById('link-otp-input').value.trim();
    if (!otpCode || otpCode.length < 6) {
        showAppAlert("Invalid Code", "Please enter the complete 6-digit verification code.");
        return;
    }
    if (!linkConfirmationResult) {
        showAppAlert("Session Expired", "Please request a new verification code.");
        resetLinkPhoneView();
        return;
    }

    const verifyBtn = document.getElementById('btn-verify-link-otp');
    verifyBtn.disabled = true;
    verifyBtn.innerText = "LINKING...";
    const errorEl = document.getElementById('link-phone-error');
    if (errorEl) errorEl.innerText = '';

    try {
        await linkConfirmationResult.confirm(otpCode);
        closeModal('modal-link-phone');
        showAppAlert("Phone Linked! 🎉", "Your phone number has been linked to your account. You can now log in using either Google or your Phone Number!");
        openProfileHub();
    } catch (err) {
        console.error("Link OTP verification error:", err);
        if (errorEl) errorEl.innerText = err.message || "Invalid verification code.";
        showAppAlert("Verification Failed", "The verification code entered is invalid or has expired.");
    } finally {
        verifyBtn.disabled = false;
        verifyBtn.innerText = "VERIFY & LINK PHONE";
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
    
    const phoneLinked = AppState.currentUser?.phoneNumber || (AppState.currentUser?.providerData?.find(p => p.providerId === 'phone')?.phoneNumber);
    const linkPhoneTitle = document.getElementById('hub-link-phone-title');
    const linkPhoneDesc = document.getElementById('hub-link-phone-desc');
    if (linkPhoneTitle && linkPhoneDesc) {
        if (phoneLinked) {
            linkPhoneTitle.innerText = "Linked: " + phoneLinked;
            linkPhoneDesc.innerText = "Phone is linked. Tap to update or change number";
        } else {
            linkPhoneTitle.innerText = "Link Phone Number";
            linkPhoneDesc.innerText = "Connect your phone to sign in with SMS code";
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
