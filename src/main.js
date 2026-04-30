// ==========================================
//    0. SERVICE WORKER FOR PWA INSTALL
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
          .then(reg => {
              console.log('Service Worker registered:', reg);
              reg.update();
              reg.addEventListener('updatefound', () => {
                  const newWorker = reg.installing;
                  newWorker.addEventListener('statechange', () => {
                      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                          showAppAlert(
                              "App Update Available", 
                              "A new version of Amolnama has been downloaded. Please refresh to apply the update.",
                                true,
                                () => {
                                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                                    setTimeout(() => window.location.reload(), 200);
                                },
                                "Refresh Now"
                          );
                      }
                  });
              });
          })
          .catch(err => console.error('Service Worker registration failed:', err));
    });
    
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

// ==========================================
//    0.5 NATIVE APP INSTALL PROMPT
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) installBtn.style.display = 'flex';
});

window.installPWA = async function() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        document.getElementById('install-app-btn').style.display = 'none';
    }
    deferredPrompt = null;
}

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) installBtn.style.display = 'none';
    deferredPrompt = null;
});

// ==========================================
//    1. FIREBASE CONFIGURATION
// ==========================================
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, query, where, getDocs, enableIndexedDbPersistence, orderBy, limit, serverTimestamp, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyA4YyIOi1xSddHCeLMdBN5mwrjQbJPn_Iw",
    authDomain: "amolnama-cc2bf.firebaseapp.com",
    projectId: "amolnama-cc2bf",
    storageBucket: "amolnama-cc2bf.firebasestorage.app",
    messagingSenderId: "283254200113",
    appId: "1:283254200113:web:248a3bff50f167568ec210"
};

let app, auth, db;

if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') console.warn("Offline persistence only works when one tab of the app is open.");
    });
}

// Global User State
let currentUser = null;
const userCurrency = 'Tk';
let userDisplayName = 'ERS';
let userNickname = ''; 
let currentUserRole = 'user';

function getStrictDate() { 
    const t = new Date(); 
    return `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`; 
}

function generateReceiptNo() {
    const date = new Date();
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TXN-${d}${m}-${random}`;
}

function showAuditTrail(txId) {
    let tx = transactions.find(t => t.id == txId) || trashTransactions.find(t => t.id == txId);
    if (!tx) return;
    
    let msg = `Receipt: ${tx.receiptNo || tx.id}\nCreated by: ${tx.agentName} at ${tx.time}\n\n`;
    
    if (tx.editHistory && tx.editHistory.length > 0) {
        msg += `--- EDIT HISTORY ---\n`;
        tx.editHistory.forEach((edit, idx) => {
            let d = new Date(edit.editedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            msg += `[${idx+1}] Changed by ${edit.editedBy} at ${d}.\nPrevious State: ${edit.qty}x, ${edit.amount} Tk (${edit.payment})\n\n`;
        });
    }
    
    if (tx.isRestored) {
        let rd = tx.restoredAt ? new Date(tx.restoredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
        msg += `--- RESTORED ---\nRestored by ${tx.restoredBy || 'Unknown'} at ${rd}\n\n`;
    }
    
    if (tx.isDeleted) {
        let dd = tx.deletedAt ? new Date(tx.deletedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
        msg += `--- DELETED ---\nDeleted by ${tx.deletedBy || 'Unknown'} at ${dd}\n\n`;
    }
    
    showAppAlert("Transaction Audit Trail", msg);
}

// ==========================================
//   UI: NATIVE ALERTS & MESSAGES
// ==========================================
let alertConfirmCallback = null;

function showAppAlert(title, message, isConfirm = false, confirmCallback = null, confirmText = "OK") {
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]); 
    
    document.getElementById('app-alert-title').innerText = title;
    document.getElementById('app-alert-message').innerText = message;
    
    let cancelBtn = document.getElementById('app-alert-cancel');
    let confirmBtn = document.getElementById('app-alert-confirm');
    let iconBox = document.getElementById('app-alert-icon');
    
    confirmBtn.innerText = confirmText;
    
    if (isConfirm) {
        cancelBtn.style.display = 'block';
        iconBox.style.color = '#f59e0b'; 
        iconBox.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
        confirmBtn.style.background = 'var(--accent-color)';
    } else {
        cancelBtn.style.display = 'none';
        iconBox.style.color = '#ef4444'; 
        iconBox.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';
        confirmBtn.style.background = '#ef4444'; 
    }
    
    alertConfirmCallback = confirmCallback;
    document.getElementById('modal-app-alert').classList.add('active');
}

window.executeAlertConfirm = function() {
    closeModal('modal-app-alert');
    if (alertConfirmCallback) alertConfirmCallback();
}

function showFlashMessage(text) {
    if (navigator.vibrate) navigator.vibrate(50); 
    let msg = document.createElement('div'); 
    msg.className = 'flash-pill';
    msg.innerHTML = `${text}`;
    document.body.appendChild(msg); 
    
    setTimeout(() => {
        msg.classList.add('fade-out');
        setTimeout(() => msg.remove(), 300);
    }, 2700);
}

// ==========================================
//   TRAFFIC COP: MASTER INVENTORY LOGIC
// ==========================================
function getInventoryChange(tx) {
    if (!tx.trackAs || !globalInventoryGroups.includes(tx.trackAs)) return 0;
    if (tx.name === 'Physical Cash' || tx.name === 'ERS Flexiload') return 0;
    
    let q = Math.abs(parseInt(tx.qty) || 0); 
    
    if (tx.type === 'transfer_in') return q;           
    if (tx.type === 'transfer_out') return -q;         
    if (tx.type === 'adjustment') return parseInt(tx.qty) || 0; 
    
    return -q; 
}

function getAvailableStock(itemName) {
    let catItem = Object.values(globalCatalog).find(c => c.name === itemName);
    let trackAs = catItem ? (catItem.trackAs || itemName) : itemName; 
    
    if (!globalInventoryGroups.includes(trackAs)) return Infinity; 

    let stock = currentOpeningInv[trackAs] || 0; 

    transactions.forEach(tx => {
        if (tx.deskId === currentDeskId && !tx.isDeleted && tx.trackAs === trackAs) {
            stock += getInventoryChange(tx); 
        }
    });
    return stock;
}

function passStockFirewall(itemName, requestedQty) {
    let catItem = Object.values(globalCatalog).find(c => c.name === itemName);
    let trackAs = catItem ? (catItem.trackAs || itemName) : itemName; 
    
    if (!globalInventoryGroups.includes(trackAs)) return true; 

    let available = getAvailableStock(itemName);
    if (available < requestedQty) {
        showAppAlert("Insufficient Stock", `You only have ${available}x ${trackAs} available in your drawer. You cannot complete this transaction.`);
        return false; 
    }
    return true; 
}

// --- DESK & SESSION STATE ---
let currentDeskId = null; 
let currentSessionId = null;
let currentDeskName = '';
let currentOpeningCash = 0; 
let currentOpeningInv = {}; 
let rolloverStock = {}; 

// --- GLOBAL DATABASE STRUCTURE ---
let globalCatalog = {}; 
let globalInventoryGroups = []; 

const defaultInventoryGroups = ['Regular Kit', 'Skitto Kit', 'eSIM', 'Skitto eSIM', 'Power Prime', 'Recycle SIM', 'No. 1 Plan', 'Prime', 'Djuice'];

const defaultCatalog = {
    "sim_no1": { name: 'No. 1 Plan', display: 'No. 1 Plan', price: 497, cat: 'new-sim', trackAs: 'No. 1 Plan', isActive: true, order: 1 },
    "sim_prime": { name: 'Prime', display: 'Prime', price: 400, cat: 'new-sim', trackAs: 'Prime', isActive: true, order: 2 },
    "sim_djuice": { name: 'Djuice', display: 'Djuice', price: 400, cat: 'new-sim', trackAs: 'Djuice', isActive: true, order: 3 },
    "sim_skitto": { name: 'Skitto', display: 'Skitto', price: 400, cat: 'new-sim', trackAs: 'Skitto Kit', isActive: true, order: 4 },
    "sim_esim_pre": { name: 'eSIM Prepaid', display: 'eSIM Prepaid', price: 400, cat: 'new-sim', trackAs: 'eSIM', isActive: true, order: 5 },
    "sim_esim_post": { name: 'eSIM Postpaid', display: 'eSIM Postpaid', price: 400, cat: 'new-sim', trackAs: 'eSIM', isActive: true, order: 6 },
    "sim_power": { name: 'Power Prime', display: 'Power Prime', price: 1499, cat: 'new-sim', trackAs: 'Power Prime', isActive: true, order: 7 },
    "sim_recycle": { name: 'Recycle SIM', display: 'Recycle SIM', price: 400, cat: 'new-sim', trackAs: 'Recycle SIM', isActive: true, order: 8 },
    "sim_my": { name: 'My SIM', display: 'My SIM', price: 400, cat: 'new-sim', trackAs: 'Regular Kit', isActive: true, order: 9 },
    "rep_regular": { name: 'Regular Replacement', display: 'Regular', price: 400, cat: 'paid-rep', trackAs: 'Regular Kit', isActive: true, order: 10 },
    "rep_skitto": { name: 'Skitto Replacement', display: 'Skitto', price: 400, cat: 'paid-rep', trackAs: 'Skitto Kit', isActive: true, order: 11 },
    "rep_esim": { name: 'eSIM Replacement', display: 'eSIM', price: 349, cat: 'paid-rep', trackAs: 'eSIM', isActive: true, order: 12 },
    "rep_skitto_esim": { name: 'Skitto eSIM Replacement', display: 'Skitto eSIM', price: 349, cat: 'paid-rep', trackAs: 'Skitto eSIM', isActive: true, order: 13 },
    "foc_regular": { name: 'FOC Regular', display: 'Regular', price: 0, cat: 'foc', trackAs: 'Regular Kit', isActive: true, order: 14 },
    "foc_skitto": { name: 'FOC Skitto', display: 'Skitto', price: 0, cat: 'foc', trackAs: 'Skitto Kit', isActive: true, order: 15 },
    "foc_esim": { name: 'FOC eSIM', display: 'eSIM', price: 0, cat: 'foc', trackAs: 'eSIM', isActive: true, order: 16 },
    "foc_skitto_esim": { name: 'FOC Skitto eSIM', display: 'Skitto eSIM', price: 0, cat: 'foc', trackAs: 'Skitto eSIM', isActive: true, order: 17 },
    "srv_recycle": { name: 'Recycle SIM Reissue', display: 'Recycle SIM Reissue', price: 115, cat: 'service', trackAs: '', isActive: true, order: 18 },
    "srv_itemized": { name: 'Itemized Bill', display: 'Itemized Bill', price: 230, cat: 'service', trackAs: '', isActive: true, order: 19 },
    "srv_owner": { name: 'Ownership Transfer', display: 'Ownership Transfer', price: 115, cat: 'service', trackAs: '', isActive: true, order: 20 },
    "srv_mnp": { name: 'MNP', display: 'MNP', price: 457.50, cat: 'service', trackAs: '', isActive: true, order: 21 },
    "foc_corp": { name: 'Corporate Replacement', display: 'Corporate Replacement', price: 0, cat: 'free-action', trackAs: '', isActive: true, order: 22 }
};

function getPhysicalItems() { return globalInventoryGroups; }

let transactions = []; 
let trashTransactions = []; 
let txListenerUnsubscribe = null; 

// --- AUTHENTICATION LOGIC ---
let isInitialLoad = true;

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    onAuthStateChanged(auth, user => {
            if (user) {
                currentUser = user;
                userDisplayName = user.displayName || 'User';
                document.getElementById('modal-auth').classList.remove('active');
                document.getElementById('settings-btn').style.display = 'none';
                document.getElementById('logout-btn').style.display = 'none';
                initUserData(); 
            } else {
                currentUser = null;
                document.getElementById('modal-auth').classList.add('active');
                if (isInitialLoad) { document.getElementById('splash-screen').classList.remove('active'); isInitialLoad = false; }
            }
        });
    })
    .catch((error) => console.error("Error setting persistence:", error));

function showAuthError(msg) { document.getElementById('auth-error').innerText = msg; }
function signInWithGoogle() { const provider = new GoogleAuthProvider(); signInWithPopup(auth, provider).catch(error => showAuthError(error.message)); }

function logout() {
  signOut(auth).then(() => {
        closeModal('modal-settings');
        document.getElementById('dev-note-fab').style.display = 'none';
        transactions = []; trashTransactions = [];
        renderPersonalReport();
        switchTab('ers', 'ERS'); 
    });
}

// ==========================================
//    THE LAZY AUTO-CLOSE
// ==========================================
async function performLazyAutoClose() {
    const todayStr = getStrictDate();
    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        for (const docSnap of activeSessionsSnap.docs) {
            const sessionData = docSnap.data();
            if (sessionData.dateStr !== todayStr) {
                
                let expectedInv = { ...(sessionData.openingBalances.inventory || {}) };
                const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', docSnap.id), where('isDeleted', '==', false)));
                
                txSnap.forEach(txDoc => {
                    let change = getInventoryChange(txDoc.data());
                    if (change !== 0) {
                        expectedInv[txDoc.data().trackAs] = (expectedInv[txDoc.data().trackAs] || 0) + change;
                    }
                });

                await updateDoc(doc(db, 'sessions', docSnap.id), {
                    status: 'closed', closedBy: 'System Auto-Close', closedByUid: 'system', closedAt: serverTimestamp(),
                    hasDiscrepancy: true, variance: 'Unknown - Auto Closed',
                    expectedClosing: { cash: sessionData.openingBalances.cash, inventory: expectedInv },
                    actualClosing: { cash: 0, inventory: expectedInv }
                });
                
                await setDoc(doc(db, 'desks', sessionData.deskId), { status: 'closed', currentSessionId: null }, { merge: true });
                
                const stuckUsers = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', sessionData.deskId)));
                stuckUsers.forEach(async (u) => {
                    await updateDoc(doc(db, 'users', u.id), { assignedDeskId: null, assignedDate: null });
                });
            }
        }
    } catch(e) {
        console.error("System Error: Lazy auto-close failed. Some desks may still appear open.", e);
    }
}


// ==========================================
//    SHIFT MANAGEMENT
// ==========================================
async function loadFloorMap() {
    const container = document.getElementById('desk-list-container');
    container.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';
    document.getElementById('modal-desk-select').classList.add('active');

    try {
        const desksSnapshot = await getDocs(collection(db, 'desks'));
        let sharedDesksHTML = '';
        let personalDeskHTML = '';
        
        const personalDeskId = 'personal_' + currentUser.uid;
        let foundPersonal = false;

        if (desksSnapshot.empty) {
            await setDoc(doc(db, 'desks', 'desk_1'), { name: 'Desk 1', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_2'), { name: 'Desk 2', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_3'), { name: 'Desk 3', status: 'closed', currentSessionId: null });
            loadFloorMap(); return;
        }

        desksSnapshot.forEach(docSnap => {
            const desk = docSnap.data();
            const isOpen = desk.status === 'open';
            const statusDot = isOpen ? '<div style="width: 10px; height: 10px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);"></div>' : '<div style="width: 10px; height: 10px; border-radius: 50%; background-color: #94a3b8;"></div>';
            const statusText = isOpen ? '<span style="color: #10b981; font-size: 0.8rem; font-weight: 600;">Open</span>' : '<span style="color: #94a3b8; font-size: 0.8rem; font-weight: 600;">Closed</span>';
            
            if (docSnap.id === personalDeskId) {
                foundPersonal = true;
                personalDeskHTML = `
                    <div style="margin-bottom: 32px;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">My Workspace</div>
                        <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.04);" onclick="handleDeskSelect('${docSnap.id}', 'Personal Drawer', '${desk.status}', '${desk.currentSessionId}')">
                            <div style="display: flex; align-items: center; gap: 16px;">
                                <div style="width: 48px; height: 48px; border-radius: 12px; background: #ede9fe; color: #8b5cf6; display: flex; align-items: center; justify-content: center;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">Personal Drawer</h3>
                                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                        ${statusDot} ${statusText}
                                    </div>
                                </div>
                            </div>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                        </div>
                    </div>
                `;
            } else if (!desk.isPersonal && docSnap.id !== 'sandbox') {
                sharedDesksHTML += `
                    <div class="admin-form-card" style="padding: 16px; margin-bottom: 12px; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.02);" onclick="handleDeskSelect('${docSnap.id}', '${desk.name}', '${desk.status}', '${desk.currentSessionId}')">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="width: 48px; height: 48px; border-radius: 12px; background: #f1f5f9; color: #475569; display: flex; align-items: center; justify-content: center;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">${desk.name}</h3>
                                <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                    ${statusDot} ${statusText}
                                </div>
                            </div>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                `;
            }
        });

        if (!foundPersonal) {
            await setDoc(doc(db, 'desks', personalDeskId), { name: 'Personal Drawer', status: 'closed', currentSessionId: null, isPersonal: true });
            personalDeskHTML = `
                <div style="margin-bottom: 32px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">My Workspace</div>
                    <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.04);" onclick="handleDeskSelect('${personalDeskId}', 'Personal Drawer', 'closed', 'null')">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="width: 48px; height: 48px; border-radius: 12px; background: #ede9fe; color: #8b5cf6; display: flex; align-items: center; justify-content: center;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">Personal Drawer</h3>
                                <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                    <div style="width: 10px; height: 10px; border-radius: 50%; background-color: #94a3b8;"></div> <span style="color: #94a3b8; font-size: 0.8rem; font-weight: 600;">Closed</span>
                                </div>
                            </div>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </div>
            `;
        }

        if (sharedDesksHTML) {
            sharedDesksHTML = `
                <div style="margin-bottom: 24px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">Shared Floor Desks</div>
                    ${sharedDesksHTML}
                </div>
            `;
        }
        
        let adminToolsHTML = '';
        if (currentUserRole === 'admin') {
            adminToolsHTML = `
                <div style="margin-top: auto; padding-top: 24px; display: flex; gap: 16px; justify-content: center; opacity: 0.8;">
                    <button style="border: none; background: transparent; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); cursor: pointer;" onclick="adminBypass()">Global View</button>
                    <span style="color: var(--border-color);">|</span>
                    <button style="border: none; background: transparent; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); cursor: pointer;" onclick="enterSandboxMode()">Test Sandbox</button>
                </div>
            `;
        }
        
        container.innerHTML = personalDeskHTML + sharedDesksHTML + adminToolsHTML;
    } catch (e) { container.innerHTML = `<div style="color:#ef4444; padding:16px;">Error loading map. Refresh app.</div>`; }
}

function adminBypass() {
    document.getElementById('modal-desk-select').classList.remove('active');
    currentDeskId = null; currentSessionId = null; currentDeskName = 'Global Admin Mode';
    document.getElementById('header-title').innerText = 'Global Admin Mode';
    switchTab('floor', 'Live Floor Map');
    fetchTransactionsForDate(); showFlashMessage("Admin Mode Activated");
}

function enterSandboxMode() {
    if (txListenerUnsubscribe) { txListenerUnsubscribe(); txListenerUnsubscribe = null; }
    currentDeskId = 'sandbox';
    currentSessionId = 'sandbox_session';
    currentDeskName = 'Sandbox';
    currentOpeningCash = 10000; 
    
    currentOpeningInv = {};
    getPhysicalItems().forEach(item => currentOpeningInv[item] = 50);
    
    transactions = [];
    trashTransactions = [];
    
    document.getElementById('modal-desk-select').classList.remove('active');
    document.getElementById('header-title').innerHTML = `Sandbox <span style="font-size:0.7rem; background:#ef4444; color:#fff; padding:2px 6px; border-radius:8px;">LOCAL</span>`;
    
    renderPersonalReport();
    if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
    
    showFlashMessage("Entered Sandbox Mode!");
}

async function handleDeskSelect(deskId, deskName, status, sessionId) {
        currentDeskId = deskId;
        currentDeskName = deskName;

        if (status === 'open' && sessionId) {
            currentSessionId = sessionId;
            const todayStr = getStrictDate();
            try { 
                await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: currentDeskId, assignedDate: todayStr }, { merge: true }); 
            } catch(e) {
                console.error("Failed to assign desk to user profile:", e);
            }

            document.getElementById('modal-desk-select').classList.remove('active');
            document.getElementById('header-title').innerText = `${deskName}`;
            
            try {
                const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
                if (sessionSnap.exists() && sessionSnap.data().openingBalances) {
                    currentOpeningCash = parseFloat(sessionSnap.data().openingBalances.cash) || 0;
                    currentOpeningInv = sessionSnap.data().openingBalances.inventory || {}; 
                }
            } catch(e) {
                showAppAlert("Sync Warning", "Could not fetch opening balances. Desk data might be incomplete.");
                console.error("Session fetch error:", e);
            }

            await fetchTransactionsForDate(); 
            showFlashMessage(`Joined ${deskName}!`);
    } else {
        document.getElementById('open-desk-title').innerText = `Open ${deskName}`;
        document.getElementById('open-cash-float').value = '';
        document.getElementById('open-desk-inventory-container').innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';
        openModal('modal-open-desk');

        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('deskId', '==', deskId), orderBy('closedAt', 'desc'), limit(1));
        
        rolloverStock = {}; 
        try {
            const lastSessionSnap = await getDocs(q);
            if (!lastSessionSnap.empty) {
                const lastSession = lastSessionSnap.docs[0].data();
                if (lastSession.actualClosing && lastSession.actualClosing.inventory) rolloverStock = lastSession.actualClosing.inventory;
            }
        } catch (e) {
            console.error("Could not fetch rollover stock from previous session:", e);
        }

        let rolloverHTML = '';
        const physicalItems = getPhysicalItems(); 
        
        physicalItems.forEach(itemName => {
            let expectedQty = rolloverStock[itemName] || 0;
            rolloverHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <label class="admin-label" style="margin:0; font-size:0.85rem; color:#334155;">${itemName}</label>
                    <input type="number" class="settings-input open-inv-input" data-name="${itemName}" value="${expectedQty === 0 ? '' : expectedQty}" placeholder="0" style="width:80px; text-align:center; padding:8px; border-color:#cbd5e1;">
                </div>
            `;
        });

        if (!rolloverHTML) rolloverHTML = '<em style="color:#64748b; font-size:0.9rem;">No physical items in catalog.</em>';
        document.getElementById('open-desk-inventory-container').innerHTML = rolloverHTML;
    }
}

let isProcessingDesk = false;
async function confirmOpenDesk() {
    if (isProcessingDesk) return; 

    let floatAmount = parseFloat(document.getElementById('open-cash-float').value);
    if (isNaN(floatAmount) || floatAmount < 0) { showAppAlert("Invalid Input", "You must enter the exact physical cash float provided by the manager."); return; }

    let verifiedStartingInventory = {};
    document.querySelectorAll('.open-inv-input').forEach(input => {
        let qty = parseInt(input.value) || 0;
        if (qty > 0) verifiedStartingInventory[input.getAttribute('data-name')] = qty;
    });

    isProcessingDesk = true; 

    try {
        const deskRef = doc(db, 'desks', currentDeskId);
        const deskCheck = await getDoc(deskRef);
        
        if (deskCheck.exists() && deskCheck.data().status === 'open') {
            showAppAlert("Desk Unavailable", "This desk was just opened by another agent. Please refresh the floor map.");
            closeModal('modal-open-desk'); loadFloorMap(); isProcessingDesk = false; return;
        }

        const newSessionRef = doc(collection(db, 'sessions'));
        currentSessionId = newSessionRef.id;
        currentOpeningCash = floatAmount;
        currentOpeningInv = verifiedStartingInventory; 
        const todayStr = getStrictDate();

        const sessionData = {
            deskId: currentDeskId, dateStr: todayStr, openedBy: userNickname || userDisplayName, openedByUid: currentUser.uid, openedAt: serverTimestamp(),
            status: 'open', openingBalances: { cash: floatAmount, inventory: verifiedStartingInventory }
        };

        await setDoc(newSessionRef, sessionData);
        await setDoc(deskRef, { status: 'open', currentSessionId: currentSessionId, name: currentDeskName }, { merge: true });
        await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: currentDeskId, assignedDate: todayStr }, { merge: true });

        closeModal('modal-open-desk');
        document.getElementById('modal-desk-select').classList.remove('active');
        document.getElementById('header-title').innerText = `${currentDeskName}`;
        
        transactions = []; trashTransactions = [];
        await fetchTransactionsForDate();
        showFlashMessage(`${currentDeskName} is now OPEN!`);

    } catch (e) { showAppAlert("System Error", e.message); } 
    finally { isProcessingDesk = false; }
}


// ==========================================
//    CLOSE DESK & RECONCILIATION
// ==========================================
let expectedClosingStats = { cash: 0, inventory: {} };
let actualClosingStats = { cash: 0, inventory: {} };

async function initiateCloseDesk() {
    if (!currentSessionId) { showAppAlert("Error", "You are not assigned to an open desk."); return; }

    const sessionSnap = await getDoc(doc(db, 'sessions', currentSessionId));
    if (!sessionSnap.exists()) return;

    const sessionData = sessionSnap.data();
    let expectedCash = parseFloat(sessionData.openingBalances.cash) || 0;
    let expectedMfs = 0;
    let expectedInv = { ...(sessionData.openingBalances.inventory || {}) };

    const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', currentSessionId), where('isDeleted', '==', false)));

    txSnap.forEach(docSnap => {
        let tx = docSnap.data();
        expectedCash += (tx.cashAmt || 0); 
        expectedMfs += (tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0));
        
        let change = getInventoryChange(tx);
        if (change !== 0) {
            expectedInv[tx.trackAs] = (expectedInv[tx.trackAs] || 0) + change;
        }
    });

    expectedClosingStats = { cash: expectedCash, mfs: expectedMfs, inventory: expectedInv };

    let invHTML = '';
    let itemsToCount = Object.keys(expectedInv);
    
    if(itemsToCount.length === 0) invHTML = '<p style="text-align:center;">No physical inventory tracked today.</p>';
    else {
        itemsToCount.forEach(itemName => {
            invHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <label class="admin-label" style="margin:0; font-size:0.85rem; color:#334155;">${itemName}</label>
                    <input type="number" class="actual-inv-input settings-input" data-name="${itemName}" style="width:80px; text-align:center; padding:8px; border-color:#cbd5e1;" placeholder="0">
                </div>
            `;
        });
    }

    const modalContent = `
        <div style="background-color: var(--surface-color); padding: calc(16px + env(safe-area-inset-top)) 20px 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 10;">
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">Close ${currentDeskName}</h3>
            <button style="background: none; border: none; color: #ef4444; font-weight: 600; font-size: 1rem; padding: 4px 0; cursor: pointer;" onclick="closeModal('modal-close-desk')">Cancel</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 24px 20px; padding-bottom: calc(24px + env(safe-area-inset-bottom));">
            <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 24px;">Step 1 of 2: Reconcile your drawer.</p>
            
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center; box-shadow: 0 2px 8px rgba(22, 101, 52, 0.05);">
                <span style="font-size: 0.85rem; color: #166534; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total MFS Collected Today</span>
                <div style="font-size: 1.75rem; font-weight: 800; color: #15803d; margin-top: 4px;">${expectedClosingStats.mfs} Tk</div>
            </div>

            <div class="admin-form-card" style="margin-bottom: 24px; padding: 20px; border: 2px solid #0ea5e9; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.1);">
                <label style="display: block; font-size: 0.85rem; font-weight: 700; color: #0ea5e9; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Actual Cash in Drawer</label>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.75rem; font-weight: bold; color: #0ea5e9;">Tk</span>
                    <input type="number" id="actual-cash-input" class="settings-input" style="font-size: 1.75rem; font-weight: 800; padding: 12px 16px; border-color: #0ea5e9; color: #0ea5e9; background: #f0f9ff;" placeholder="0">
                </div>
            </div>

            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Count Physical Inventory</div>
            <div class="admin-form-card" style="padding: 16px; margin-bottom: 32px;">
                ${invHTML}
            </div>

            <button class="btn-primary-full" style="padding: 16px; font-size: 1.1rem; background-color: #0ea5e9;" onclick="processCloseDeskStep2()">NEXT: MANAGER DROP ➡️</button>
        </div>
    `;
    document.getElementById('close-desk-content').innerHTML = modalContent;
    openModal('modal-close-desk');
}

function processCloseDeskStep2() {
    let actualCash = parseFloat(document.getElementById('actual-cash-input').value);
    if (isNaN(actualCash) || actualCash < 0) { showAppAlert("Invalid Input", "Please enter the total physical cash."); return; }

    actualClosingStats.cash = actualCash;
    actualClosingStats.inventory = {};

    document.querySelectorAll('.actual-inv-input').forEach(input => {
        let itemName = input.getAttribute('data-name');
        actualClosingStats.inventory[itemName] = parseInt(input.value) || 0;
    });

    let variance = actualCash - expectedClosingStats.cash;
    let warningHTML = '';
    if (variance < 0) warningHTML = `<div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 12px; padding: 16px; margin-bottom: 24px;"><h4 style="color: #b91c1c; margin-bottom: 8px;">SHORTAGE DETECTED</h4><p style="color: #991b1b; font-size: 0.95rem; margin-bottom: 0;">You are short <strong>${Math.abs(variance)} Tk</strong>. Expected: ${expectedClosingStats.cash} Tk.</p></div>`;
    else if (variance > 0) warningHTML = `<div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 16px; margin-bottom: 24px;"><h4 style="color: #15803d; margin-bottom: 8px;">OVERAGE DETECTED</h4><p style="color: #166534; font-size: 0.95rem; margin-bottom: 0;">You have an overage of <strong>+${variance} Tk</strong>. Expected: ${expectedClosingStats.cash} Tk.</p></div>`;
    else warningHTML = `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;"><h4 style="color: #0ea5e9; margin-bottom: 0;">DRAWER IS PERFECTLY BALANCED</h4></div>`;

    const modalContent = `
        <div style="background-color: var(--surface-color); padding: calc(16px + env(safe-area-inset-top)) 20px 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 10;">
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-primary);">Finalize Handover</h3>
            <button style="background: none; border: none; color: #64748b; font-weight: 600; font-size: 1rem; padding: 4px 0; cursor: pointer;" onclick="initiateCloseDesk()">Back</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 24px 20px; padding-bottom: calc(24px + env(safe-area-inset-bottom));">
            <p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 24px;">Step 2 of 2: Log your manager cash drop.</p>
            
            ${warningHTML}

            <div class="admin-form-card" style="margin-bottom: 32px; padding: 20px; border: 2px solid #8b5cf6; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);">
                <label style="display: block; font-size: 0.85rem; font-weight: 700; color: #8b5cf6; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Manager Drop</label>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 16px;">How much of the <strong>${actualCash} Tk</strong> are you handing to the manager?</p>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 1.75rem; font-weight: bold; color: #8b5cf6;">Tk</span>
                    <input type="number" id="manager-drop-input" class="settings-input" style="font-size: 1.75rem; font-weight: 800; padding: 12px 16px; border-color: #8b5cf6; color: #8b5cf6; background: #f5f3ff;" placeholder="0" oninput="calculateRetained()">
                </div>
                <div style="margin-top: 20px; font-size: 1rem; color: #475569; padding-top: 16px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600;">Retained Float:</span> 
                    <strong id="retained-float-display" style="color: #0f172a; font-size: 1.2rem;">${actualCash} Tk</strong>
                </div>
            </div>

            <button class="btn-primary-full" style="padding: 16px; font-size: 1.1rem; background: ${variance < 0 ? '#ef4444' : '#8b5cf6'};" onclick="finalizeCloseDesk(${variance})">
                ${variance < 0 ? 'FORCE CLOSE & LOG SHORTAGE' : 'CONFIRM & CLOSE DESK'}
            </button>
        </div>
    `;
    document.getElementById('close-desk-content').innerHTML = modalContent;
}

function calculateRetained() {
    let drop = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let retained = actualClosingStats.cash - drop;
    let maxAllowedDrop = actualClosingStats.cash;
    
    let displayEl = document.getElementById('retained-float-display');
    if (drop > maxAllowedDrop) displayEl.innerHTML = `<span style="color: #ef4444;">Error: Exceeds System Total</span>`;
    else displayEl.innerText = retained + " Tk";
}

async function finalizeCloseDesk(variance) {
    let dropAmount = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let maxAllowedDrop = actualClosingStats.cash;

    if (dropAmount < 0 || dropAmount > maxAllowedDrop) { 
        showAppAlert("Error", `You cannot drop more than ${maxAllowedDrop} Tk.`); 
        return; 
    }

    let retainedFloat = actualClosingStats.cash - dropAmount;
    actualClosingStats.inventory = { ...actualClosingStats.inventory }; 

    try {
        await updateDoc(doc(db, 'sessions', currentSessionId), {
            closedBy: userNickname || userDisplayName, 
            closedByUid: currentUser.uid, 
            closedAt: serverTimestamp(), 
            status: 'closed',
            expectedClosing: expectedClosingStats, 
            actualClosing: actualClosingStats, 
            variance: variance,
            hasDiscrepancy: variance !== 0, 
            managerDrop: dropAmount, 
            retainedFloat: retainedFloat
        });
        await setDoc(doc(db, 'desks', currentDeskId), { status: 'closed', currentSessionId: null }, { merge: true });
        await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
    } catch (e) { 
        showFlashMessage("Offline: Desk close queued for sync."); 
    } finally {
        currentDeskId = null; 
        currentSessionId = null; 
        currentDeskName = '';
        closeModal('modal-close-desk');
        showFlashMessage("Desk Successfully Closed!");
        loadFloorMap();
    }
}

// ==========================================
//    PHASE 3: DESK ACTIONS & TRANSFERS
// ==========================================

function openManagerCashModal() {
    if(!currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('mgr-cash-amount').value = '';
    openModal('modal-manager-cash');
}

function saveManagerCash() {
    let amount = parseFloat(document.getElementById('mgr-cash-amount').value) || 0;
    if (amount <= 0) { showAppAlert("Invalid Input", "Enter a valid amount."); return; }
    let action = document.getElementById('mgr-cash-action').value; 
    let finalValue = action === 'receive' ? amount : -amount;
    let paymentLabel = action === 'receive' ? 'Received from Manager' : 'Dropped to Manager';

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: 'adjustment', name: 'Physical Cash', trackAs: 'Physical Cash', amount: amount, qty: 1,
        payment: paymentLabel, cashAmt: finalValue, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName
    };

    closeModal('modal-manager-cash');
    let msg = action === 'receive' ? `Received ${amount} Tk Float!` : `Dropped ${amount} Tk!`;
    
    addDoc(collection(db, 'transactions'), tx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? msg : "Offline: Cash queued");
}

function openMainStockModal() {
    if(!currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('main-stock-qty').value = '';
    let selectEl = document.getElementById('main-stock-item');
    selectEl.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        selectEl.appendChild(opt);
    });
    openModal('modal-main-stock');
}

function saveMainStock() {
    let qty = parseInt(document.getElementById('main-stock-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter a valid quantity."); return; }
    let itemName = document.getElementById('main-stock-item').value;

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty,
        payment: 'Received from Main Stock', cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName
    };

    closeModal('modal-main-stock');
    let msg = `+${qty}x ${itemName} Added!`;
    
    addDoc(collection(db, 'transactions'), tx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? msg : "Offline: Stock queued");
}

function openReturnStockModal() {
    if(!currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('return-stock-qty').value = '';
    let selectEl = document.getElementById('return-stock-item');
    selectEl.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        selectEl.appendChild(opt);
    });
    openModal('modal-return-stock');
}

function saveReturnStock() {
    let qty = parseInt(document.getElementById('return-stock-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter a valid quantity."); return; }
    let itemName = document.getElementById('return-stock-item').value;

    // The Stock Firewall ensures the agent actually has the stock to return
    if (!passStockFirewall(itemName, qty)) return;

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty,
        payment: 'Returned to Main Stock', cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName
    };

    closeModal('modal-return-stock');
    let msg = `-${qty}x ${itemName} Returned!`;
    
    addDoc(collection(db, 'transactions'), tx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? msg : "Offline: Return queued");
}

async function openDeskTransfer() {
    if(!currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('desk-transfer-qty').value = '';
    
    let itemSelect = document.getElementById('desk-transfer-item');
    itemSelect.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        itemSelect.appendChild(opt);
    });

    let targetSelect = document.getElementById('desk-transfer-target');
    targetSelect.innerHTML = '<option value="">Loading active desks...</option>';
    openModal('modal-desk-transfer');

    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        let optionsHTML = '';
        activeSessionsSnap.forEach(docSnap => {
            let deskData = docSnap.data();
            if(deskData.deskId !== currentDeskId) {
                let displayName = deskData.deskId.replace('_', ' ').toUpperCase();
                
                // If it's a personal drawer, grab the agent's first name
                if (deskData.deskId.startsWith('personal_')) {
                    let agentFirstName = deskData.openedBy ? deskData.openedBy.split(' ')[0] : 'Agent';
                    displayName = `${agentFirstName}'s Drawer`;
                }
                
                optionsHTML += `<option value="${deskData.deskId}|${docSnap.id}">${displayName}</option>`;
            }
        });
        targetSelect.innerHTML = optionsHTML || '<option value="">No other desks open</option>';
    } catch(e) { targetSelect.innerHTML = '<option value="">Offline: Cannot fetch desks</option>'; }
}

function executeDeskTransfer() {
    if (!navigator.onLine) {
        showAppAlert("Connection Required", "Desk-to-desk transfers require an active internet connection so the receiving desk gets the stock immediately. Please connect and try again.");
        return;
    }

    let qty = parseInt(document.getElementById('desk-transfer-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter valid quantity."); return; }

    let itemName = document.getElementById('desk-transfer-item').value;
    
    if (!passStockFirewall(itemName, qty)) return;

    let targetSelect = document.getElementById('desk-transfer-target');
    let targetVal = targetSelect.value;
    if (!targetVal) { showAppAlert("Error", "Please select an active destination desk."); return; }
    
    // Grab the clean name directly from the dropdown text
    let targetDeskName = targetSelect.options[targetSelect.selectedIndex].text;
    
    let [targetDeskId, targetSessionId] = targetVal.split('|');
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    // Use the clean targetDeskName instead of the raw ID
    const senderTx = { id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName };
    const receiverTx = { id: Date.now() + 1, receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${currentDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetDeskId, sessionId: targetSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName, isRemoteTransfer: true };

    closeModal('modal-desk-transfer');
    let msg = `Sent ${qty}x ${itemName} to ${targetDeskName}!`;
    
    addDoc(collection(db, 'transactions'), senderTx).catch(e => console.error(e));
    addDoc(collection(db, 'transactions'), receiverTx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? msg : "Offline: Transfer queued");
}

let targetTransferDeskId = null; 
let targetTransferSessionId = null;
let targetTransferDeskName = ''; // Add this tracking variable

function openTransferModal(targetDesk, targetSession, targetName) {
    targetTransferDeskId = targetDesk; 
    targetTransferSessionId = targetSession;
    
    // Determine the clean name
    targetTransferDeskName = targetDesk.startsWith('personal_') ? (targetName || "Personal Drawer") : targetDesk.replace('_', ' ').toUpperCase();
    
    document.getElementById('transfer-target-name').innerText = targetTransferDeskName;
    document.getElementById('transfer-qty').value = '';
    let selectEl = document.getElementById('transfer-item-select');
    selectEl.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        selectEl.appendChild(opt);
    });
    openModal('modal-transfer');
}

function executeTransfer() {
    let qty = parseInt(document.getElementById('transfer-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter valid quantity."); return; }
    let itemName = document.getElementById('transfer-item-select').value;
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    // Admin transfers use "Admin" or the current desk name as the sender
    let senderName = currentDeskName || "Admin";

    const senderTx = { id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetTransferDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: currentDeskId || "Admin", sessionId: currentSessionId || "Admin", agentId: currentUser.uid, agentName: userNickname || userDisplayName };
    const receiverTx = { id: Date.now() + 1, receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${senderName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetTransferDeskId, sessionId: targetTransferSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName, isRemoteTransfer: true };

    closeModal('modal-transfer');
    
    addDoc(collection(db, 'transactions'), senderTx).catch(e => console.error(e));
    addDoc(collection(db, 'transactions'), receiverTx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? `Sent to ${targetTransferDeskName}!` : "Offline: Queued for sync.");
}

// --- RENDER FLOOR MAP & PEEK AT DESK ---
async function renderLiveFloorTab() {
    const container = document.getElementById('live-floor-container');
    container.innerHTML = '<div class="spinner" style="align-self: center; margin-top: 40px;"></div>';

    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        if (activeSessionsSnap.empty) { container.innerHTML = '<p class="placeholder-text">No desks open.</p>'; return; }

        let docsArray = [...activeSessionsSnap.docs];
        
        // 1. Sort all desks numerically (Desk 1, Desk 2, Desk 3...)
        docsArray.sort((a, b) => a.data().deskId.localeCompare(b.data().deskId, undefined, { numeric: true }));
        
        // 2. If the current user has a desk, pin it to the very top (Index 0)
        let myIndex = docsArray.findIndex(doc => doc.id === currentSessionId);
        if (myIndex > 0) {
            let myDoc = docsArray.splice(myIndex, 1)[0];
            docsArray.unshift(myDoc);
        }

        let floorHTML = '';
        for (const docSnap of docsArray) {
            const session = docSnap.data(); const sid = docSnap.id;
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', sid), where('isDeleted', '==', false)));

            let liveCash = parseFloat(session.openingBalances.cash) || 0;
      let liveInv = { ...(session.openingBalances.inventory || {}) };
      let liveServicesCount = 0;

      txSnap.forEach(txDoc => {
        let tx = txDoc.data();
        liveCash += (tx.cashAmt || 0);
       
        let change = getInventoryChange(tx);
        if (change !== 0) {
          liveInv[tx.trackAs] = (liveInv[tx.trackAs] || 0) + change;
        } else if (tx.cat === 'service' || tx.cat === 'free-action') {
          liveServicesCount += Math.abs(tx.qty);
        }
      });

      let invDisplay = '';
      for (const [name, qty] of Object.entries(liveInv)) {
        if (qty !== 0) {
          let color = qty < 3 ? '#ef4444' : '#475569';
          invDisplay += `<span style="display:inline-block; background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin:2px; color:${color}; font-weight:600;">${name}: ${qty}</span>`;
        }
      }
      if (liveServicesCount > 0) {
        invDisplay += `<span style="display:inline-block; background:#fef3c7; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin:2px; color:#92400e; font-weight:600;">Services: ${liveServicesCount}</span>`;
      }
      if(!invDisplay) invDisplay = '<span style="font-size:0.8rem; color:#94a3b8;">No physical stock.</span>';

            const isMyDesk = sid === currentSessionId;

            let displayDeskName = session.deskId.replace('_', ' ').toUpperCase();
            if (session.deskId.startsWith('personal_')) {
                if (isMyDesk) {
                    displayDeskName = "My Drawer";
                } else {
                    displayDeskName = `${session.openedBy.split(' ')[0]}'s Drawer`;
                }
            }

            // ESCAPE THE APOSTROPHE so it doesn't break the HTML onclick tag
            let safeDeskName = displayDeskName.replace(/'/g, "\\'");

            let actionBtn = isMyDesk 
                ? `<button class="btn-primary-full" style="width: 100%; background: #0ea5e9; padding: 10px; margin-top: 12px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);" onclick="openMyDeskDashboard()">Open My Drawer</button>`
                : `<button class="btn-outline" style="width: 100%; color: #8b5cf6; border-color: #8b5cf6; background: transparent; padding: 10px; margin-top: 12px;" onclick="peekAtDesk('${session.deskId}', '${safeDeskName}')">View Details</button>`;

            let agentNamesStr = 'Loading...';
            try {
                const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', session.deskId)));
                let names = [];
                agentsSnap.forEach(aDoc => { names.push(aDoc.data().nickname || aDoc.data().displayName || aDoc.data().email?.split('@')[0] || 'Agent'); });
                agentNamesStr = names.length > 0 ? names.join(', ') : 'Empty';
            } catch(e) { agentNamesStr = 'Unknown'; }

            let cardStyle = isMyDesk 
                ? `margin-bottom: 0; padding: 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; border-radius: 12px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.1);`
                : `margin-bottom: 0; padding: 16px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);`;

            floorHTML += `
                <div style="${cardStyle}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid ${isMyDesk ? '#bae6fd' : 'var(--border-color)'}; padding-bottom: 12px;">
                        <h4 style="margin: 0; color: ${isMyDesk ? '#0369a1' : 'var(--text-primary)'}; font-size: 1.15rem; font-weight: 700; display: flex; align-items: center;">
                            ${displayDeskName}
                        </h4>
                        <div style="font-size: 0.85rem; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; font-weight: 600; text-align: right; max-width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${agentNamesStr}
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 0.85rem; font-weight: bold; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'};">Live Cash:</span>
                        <span style="font-size: 1.1rem; font-weight: bold; color: #10b981;">${liveCash} Tk</span>
                    </div>

                    <div style="margin-bottom: 16px; padding-top: 12px; border-top: 1px dashed ${isMyDesk ? '#bae6fd' : 'var(--border-color)'};">
                        <span style="display: block; font-size: 0.8rem; font-weight: bold; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; margin-bottom: 6px;">Remaining Physical Stock:</span>
                        <div>${invDisplay}</div>
                    </div>
                    
                    ${actionBtn}
                </div>
            `;
        }
        container.innerHTML = floorHTML;
    } catch (e) { container.innerHTML = '<p class="placeholder-text" style="color: #ef4444;">Offline: Could not load.</p>'; }
}

function openMyDeskDashboard() {
    document.getElementById('desk-peek-header').style.display = 'none';
    document.getElementById('desk-action-buttons').style.display = 'block';
    document.getElementById('desk-dashboard-title').innerText = currentDeskName + ' (My Drawer)';
    switchTab('desk', currentDeskName);
    renderDeskDashboard(currentDeskId);
}

function peekAtDesk(targetDeskId, targetDeskName) {
    if (targetDeskId === currentDeskId) {
        openMyDeskDashboard(); 
    } else {
        document.getElementById('desk-action-buttons').style.display = 'none';
        document.getElementById('desk-peek-header').style.display = 'flex';
        document.getElementById('desk-dashboard-title').innerText = targetDeskName;
        switchTab('desk', targetDeskName + ' (Peek)');
        renderDeskDashboard(targetDeskId);
    }
}

// ==========================================
//    EDIT, SPLIT PAYMENT, & TRASH
// ==========================================
let currentEditTxId = null;

function openEditTx(id) {
    let tx = transactions.find(t => t.id === id);
    if(!tx) return;
    currentEditTxId = id;

    document.getElementById('edit-tx-name').innerText = "Edit: " + tx.name;
    document.getElementById('edit-tx-qty').value = tx.qty || 1;
    document.getElementById('edit-tx-amount').value = tx.amount;

    let paymentSelect = document.getElementById('edit-tx-payment');
    let splitFields = document.getElementById('edit-split-fields');

    if (tx.cashAmt > 0 && tx.mfsAmt > 0) {
        paymentSelect.value = 'Split'; splitFields.style.display = 'flex';
        document.getElementById('edit-tx-cash').value = tx.cashAmt;
        document.getElementById('edit-tx-mfs').value = tx.mfsAmt;
    } else { paymentSelect.value = tx.payment; splitFields.style.display = 'none'; }
    openModal('modal-edit-tx');
}

function toggleEditSplitFields() {
    if (document.getElementById('edit-tx-payment').value === 'Split') {
        document.getElementById('edit-split-fields').style.display = 'flex';
        document.getElementById('edit-tx-cash').value = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
        document.getElementById('edit-tx-mfs').value = 0;
    } else document.getElementById('edit-split-fields').style.display = 'none';
}

function updateSplitTotal() {}

function saveTxEdit() {
    let txIndex = transactions.findIndex(t => t.id === currentEditTxId);
    if(txIndex === -1) return;

    let tx = transactions[txIndex];
    let newQty = parseInt(document.getElementById('edit-tx-qty').value) || 0;
    let newAmount = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
    let method = document.getElementById('edit-tx-payment').value;
    let finalCash = 0, finalMfs = 0;

    let diff = newQty - tx.qty; 
    if (diff > 0 && !passStockFirewall(tx.name, diff)) return; 

    if (method === 'Cash') finalCash = newAmount;
    else if (method === 'MFS') finalMfs = newAmount;
    else if (method === 'Split') {
        finalCash = parseFloat(document.getElementById('edit-tx-cash').value) || 0;
        finalMfs = parseFloat(document.getElementById('edit-tx-mfs').value) || 0;
        if (finalCash + finalMfs !== newAmount) { showAppAlert("Error", "Cash + MFS must equal Total Tk."); return; }
    }

    let prevTxState = {
        qty: tx.qty, amount: tx.amount, payment: tx.payment, cashAmt: tx.cashAmt, mfsAmt: tx.mfsAmt,
        editedAt: new Date().toISOString(), editedBy: userNickname || userDisplayName, editedByUid: currentUser.uid
    };
    let updatedEditHistory = tx.editHistory ? [...tx.editHistory, prevTxState] : [prevTxState];

    closeModal('modal-edit-tx');
    
    if (currentDeskId === 'sandbox') {
        tx.qty = newQty; tx.amount = newAmount; tx.payment = method === 'Split' ? 'Split' : method; tx.cashAmt = finalCash; tx.mfsAmt = finalMfs; tx.isEdited = true; tx.editHistory = updatedEditHistory;
        renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
        showFlashMessage("Sandbox Transaction Updated!"); return;
    }

    if (tx.docId) {
        let msg = `${tx.name} Updated!`;
        updateDoc(doc(db, 'transactions', tx.docId), { qty: newQty, amount: newAmount, payment: method === 'Split' ? 'Split' : method, cashAmt: finalCash, mfsAmt: finalMfs, isEdited: true, editHistory: updatedEditHistory }).catch(e => console.error(e));
        showFlashMessage(navigator.onLine ? msg : "Offline: Edit queued");
    }
}

function deleteTransaction(docId, localId) {
    showAppAlert("Delete Item", "Are you sure you want to move this transaction to the trash?", true, () => {
        let nowStr = new Date().toISOString();
        let agentStr = userNickname || userDisplayName;

        if (currentDeskId === 'sandbox') {
            let tx = transactions.find(t => t.id === localId);
            if(tx) { 
                tx.isDeleted = true; 
                tx.deletedBy = agentStr; tx.deletedByUid = currentUser.uid; tx.deletedAt = nowStr;
                trashTransactions.push(tx); 
                renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
                showFlashMessage("Moved to Sandbox Trash!"); 
            }
            return;
        }

        if(docId) {
            updateDoc(doc(db, 'transactions', docId), { isDeleted: true, deletedBy: agentStr, deletedByUid: currentUser.uid, deletedAt: nowStr }).catch(e => console.error(e));
            showFlashMessage(navigator.onLine ? "Moved to Trash!" : "Offline: Trash queued");
        }
    }, "Move to Trash");
}

function openTrash() { renderTrash(); openModal('modal-trash'); }

function renderTrash() {
    let html = '';
    if(trashTransactions.length === 0) html = '<p class="placeholder-text">Trash is empty</p>';
    else {
        trashTransactions.sort((a,b) => b.id - a.id).forEach(tx => {
            html += `
                <div style="border:1px solid var(--border-color); padding:12px; margin-bottom:8px; border-radius:8px; background: var(--surface-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong style="color: var(--text-primary); text-decoration: line-through;">${tx.qty}x ${tx.name}</strong> 
                        <span style="font-weight:bold; color:#ef4444;">${tx.amount} Tk</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${tx.time} | ${tx.payment}</span>
                        <div style="display:flex; gap: 8px;">
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: #10b981; gap: 6px;" onclick="restoreTx('${tx.docId}', ${tx.id})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Restore
                            </button>
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: #ef4444; gap: 6px; background: #fef2f2;" onclick="permanentlyDeleteTx('${tx.docId}', ${tx.id})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    document.getElementById('trash-log').innerHTML = html;
}

function restoreTx(docId, localId) {
    let nowStr = new Date().toISOString();
    let agentStr = userNickname || userDisplayName;

    if (currentDeskId === 'sandbox') {
        let txIndex = trashTransactions.findIndex(t => t.id === localId);
        if (txIndex > -1) {
            let tx = trashTransactions[txIndex];
            if (!passStockFirewall(tx.name, tx.qty)) return;
            tx.isDeleted = false; tx.isRestored = true;
            tx.restoredBy = agentStr; tx.restoredByUid = currentUser.uid; tx.restoredAt = nowStr;
            trashTransactions.splice(txIndex, 1);
            renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
            showFlashMessage("Sandbox Transaction Restored!");
            setTimeout(() => { renderTrash(); if(trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
        }
        return;
    }

    if(docId) {
        try {
            let tx = trashTransactions.find(t => t.docId === docId);
            if (tx && !passStockFirewall(tx.name, tx.qty)) return;

            updateDoc(doc(db, 'transactions', docId), { isDeleted: false, isRestored: true, restoredBy: agentStr, restoredByUid: currentUser.uid, restoredAt: nowStr }).catch(e => console.error(e));
            showFlashMessage(navigator.onLine ? (tx ? `${tx.name} Restored!` : "Transaction Restored!") : "Offline: Restore queued");
            setTimeout(() => { renderTrash(); if(trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
        } catch(e) {
            showAppAlert("Restore Failed", "Could not restore. Please check your connection.");
            console.error("Restore error:", e);
        }
    }
}

function permanentlyDeleteTx(docId, localId) {
    showAppAlert("Permanent Delete", "This transaction will be permanently erased. This cannot be undone.", true, () => {
        if(docId) { 
            deleteDoc(doc(db, 'transactions', docId)).catch(e => console.error(e)); 
            showFlashMessage(navigator.onLine ? "Permanently Deleted!" : "Offline: Delete queued"); 
        }
    }, "Delete Forever");
}

function emptyTrash() {
    if(trashTransactions.length === 0) return;
    showAppAlert("Empty Trash", "Are you sure you want to permanently delete ALL items in the trash?", true, () => {
        const idsToDelete = trashTransactions.map(t => t.docId).filter(id => id);
        closeModal('modal-trash');
        for (const id of idsToDelete) { 
            deleteDoc(doc(db, 'transactions', id)).catch(e => console.error(`Error deleting trash item ${id}:`, e)); 
        }
        trashTransactions = [];
        renderTrash();
        showFlashMessage("Trash Emptied!");
    }, "Empty Trash");
}

// ==========================================
//    UI NAVIGATION & CORE APP LOGIC
// ==========================================
function switchTab(tabId, title) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    
    if(event && event.currentTarget) {
         event.currentTarget.classList.add('active');
    }
    
    document.getElementById('header-title').innerText = tabId === 'ers' ? (currentDeskName || userNickname || userDisplayName) : title;
    if(tabId === 'floor') renderLiveFloorTab();

    if (tabId === 'report' && currentUser) {
        document.getElementById('settings-btn').style.display = currentUserRole === 'admin' ? 'block' : 'none';
        document.getElementById('logout-btn').style.display = 'block';
    } else {
        document.getElementById('settings-btn').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none';
    }
}

function updateCurrencyUI() { document.querySelectorAll('.ers-currency').forEach(el => { if(!el.innerText.includes('Qty')) el.innerText = userCurrency; }); }

// --- ERS LOGIC ---
let currentErsAmount = '0';
const ersDisplay = document.getElementById('ers-display');
function updateErsDisplay() { ersDisplay.innerText = currentErsAmount; }

function ersKeyPress(num) {
    if (currentErsAmount === '0') { if (num !== '00' && num !== '0') currentErsAmount = num; } 
    else { if ((currentErsAmount + num).length <= 5) currentErsAmount += num; }
    updateErsDisplay();
}
function ersBackspace() { currentErsAmount = currentErsAmount.length > 1 ? currentErsAmount.slice(0, -1) : '0'; updateErsDisplay(); }
function saveErs(paymentMethod) {
    const amount = parseInt(currentErsAmount);
    if (amount <= 0) { showAppAlert("Invalid Input", "Please enter a valid amount."); return; }
    addTransactionToCloud('ERS', 'ERS Flexiload', amount, 1, paymentMethod);
    currentErsAmount = '0'; updateErsDisplay();
}

// --- SIMS & MODALS LOGIC ---
let isMfs = false; let currentItemName = ''; let currentItemPrice = 0; let currentQty = '1';

function toggleMFS() {
    isMfs = !isMfs;
    document.querySelectorAll('.sync-cash').forEach(el => el.classList.toggle('active', !isMfs));
    document.querySelectorAll('.sync-mfs').forEach(el => el.classList.toggle('active', isMfs));
}

function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay') && !['modal-auth', 'splash-screen', 'modal-desk-select', 'modal-nicknames', 'modal-app-alert'].includes(event.target.id)) {
        closeModal(event.target.id);
    }
});

// --- NATIVE BOTTOM SHEET DRAG PHYSICS ---
function setupBottomSheetDrag() {
    document.querySelectorAll('.bottom-sheet').forEach(sheet => {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        sheet.addEventListener('touchstart', (e) => {
            // Only allow the sheet to be dragged if the user is scrolled to the very top
            if (sheet.scrollTop > 0) return; 
            
            startY = e.touches[0].clientY;
            isDragging = true;
            
            // Remove CSS animation transitions so the sheet sticks to the thumb perfectly 1:1
            sheet.style.transition = 'none'; 
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            let delta = currentY - startY;

            // Only allow dragging downwards (positive delta)
            if (delta > 0) {
                sheet.style.transform = `translateY(${delta}px)`;
            }
        }, { passive: true });

        sheet.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            let delta = currentY - startY;
            let threshold = sheet.offsetHeight * 0.25; // 25% threshold to trigger a close

            // Re-apply the smooth bezier transition for the snap-back or close animation
            sheet.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

            if (delta > threshold) {
                // User dragged far enough -> Slide it completely off screen
                sheet.style.transform = `translateY(100%)`;
                
                // Wait for the animation to finish, then safely remove it from the DOM
                setTimeout(() => {
                    let modal = sheet.closest('.modal-overlay');
                    if (modal) closeModal(modal.id);
                    
                    // Reset the inline styles so it works normally the next time it's opened
                    setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = ''; }, 50);
                }, 250);
            } else {
                // User didn't drag far enough -> Snap it smoothly back into place
                sheet.style.transform = 'translateY(0)';
                setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = ''; }, 250);
            }
        });
    });
}

// Initialize the drag listeners once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', setupBottomSheetDrag);

function selectItem(itemName, price) {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
    currentItemName = itemName; currentItemPrice = price; currentQty = '1';
    updateQtyDisplay(); openModal('modal-quantity');
}

function updateQtyDisplay() {
    document.getElementById('qty-item-name').innerText = currentItemName;
    document.getElementById('qty-display').innerText = currentQty;
    let qtyInt = parseInt(currentQty) || 0;
    document.getElementById('qty-calc-display').innerText = currentItemPrice === 0 ? `Inventory Update (0 ${userCurrency})` : `${qtyInt} x ${currentItemPrice} = ${qtyInt * currentItemPrice} ${userCurrency}`;
}

function qtyKeyPress(num) { if (currentQty === '0') currentQty = num; else if (currentQty.length < 3) currentQty += num; updateQtyDisplay(); }
function qtyBackspace() { currentQty = currentQty.length > 1 ? currentQty.slice(0, -1) : '0'; updateQtyDisplay(); }
function saveQuantity() {
    let qtyInt = parseInt(currentQty) || 0;
    if (qtyInt <= 0) { showAppAlert("Invalid Input", "Please enter a quantity of 1 or more."); return; }
    
    if (!passStockFirewall(currentItemName, qtyInt)) return;

    addTransactionToCloud('Item', currentItemName, qtyInt * currentItemPrice, qtyInt, (currentItemPrice > 0 && isMfs) ? "MFS" : "Cash");
    closeModal('modal-quantity');
}

function instantSaveItem(itemName, price) {
  if (!passStockFirewall(itemName, 1)) return;
 
  addTransactionToCloud('Item', itemName, price, 1, (price > 0 && isMfs) ? "MFS" : "Cash");
 
  // Tiny delay to absorb the browser's synthetic ghost click
  setTimeout(() => {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
  }, 100);
}

// --- DATE FILTER LOGIC ---
function formatToGBDate(iso) { if(!iso) return getStrictDate(); const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; }

async function fetchTransactionsForDate() {
    if (!currentUser) return;
    
    const datePicker = document.getElementById('report-date-picker');
    if (!datePicker.value) {
        const t = new Date(); 
        datePicker.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
    const targetDateStr = formatToGBDate(datePicker.value);
    const isToday = targetDateStr === getStrictDate();
    const dateLabel = isToday ? 'Today' : targetDateStr;

    if (txListenerUnsubscribe) { txListenerUnsubscribe(); txListenerUnsubscribe = null; }

    try {
        txListenerUnsubscribe = onSnapshot(
            query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr)),
            { includeMetadataChanges: true },
            (txSnapshot) => {
            transactions = []; trashTransactions = []; 
            txSnapshot.forEach(doc => {
                let tx = doc.data(); tx.docId = doc.id; 
                tx.isPending = doc.metadata.hasPendingWrites;
                if (!tx.isDeleted) {
                    transactions.push(tx);
                } else if (tx.agentId === currentUser.uid) {
                    trashTransactions.push(tx); 
                }
            });
            
            transactions.sort((a, b) => a.id - b.id);
            trashTransactions.sort((a, b) => a.id - b.id);
            
            renderPersonalReport();
            
            if (document.getElementById('tab-desk').classList.contains('active')) {
                renderDeskDashboard();
            } else if (currentDeskId) {
                renderDeskDashboard(currentDeskId); 
            }
            
            const financialLabel = document.getElementById('financial-date-label');
            if (financialLabel) financialLabel.innerHTML = `${dateLabel}`;
            if (document.getElementById('tab-floor').classList.contains('active')) renderLiveFloorTab();
        });
    } catch (e) { console.error(e); }
}

// --- UI RENDERING FOR CATALOG ---
function renderAppUI() {
    document.querySelectorAll('.dynamic-item').forEach(el => el.remove());
    Object.values(globalCatalog).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(item => {
        if (!item.isActive) return;
        let safePrice = parseFloat(item.price) || 0;
        let containerId = "";
        let iconSVG = "";

        if (item.cat === 'new-sim') {
            containerId = 'container-new-sim';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
        }
        else if (item.cat === 'paid-rep') {
            containerId = 'container-paid-rep';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
        }
        else if (item.cat === 'foc' || item.cat === 'free-action') {
            containerId = item.cat === 'foc' ? 'container-foc' : 'container-free-actions';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        }
        else if (item.cat === 'service') {
            containerId = 'container-services';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
        }

        let container = document.getElementById(containerId);
        if (!container) return;

        let row = document.createElement('div');
        row.className = 'dynamic-item';
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-color); cursor: pointer; user-select: none; transition: background-color 0.1s;';
        
        let pressTimer;
        let isLongPress = false;
        let isCancelled = false;

        const startPress = (e) => {
            if (e.button && e.button !== 0) return; 
            isLongPress = false;
            isCancelled = false;
            row.style.backgroundColor = 'var(--bg-color)'; 
            pressTimer = setTimeout(() => {
                isLongPress = true;
                if (navigator.vibrate) navigator.vibrate([50]); 
                selectItem(item.name, safePrice); 
                row.style.backgroundColor = 'transparent';
            }, 500); 
        };

        const cancelPress = () => {
            isCancelled = true;
            row.style.backgroundColor = 'transparent';
            clearTimeout(pressTimer);
        };

        const endPress = (e) => {
            clearTimeout(pressTimer);
            row.style.backgroundColor = 'transparent';
            if (!isLongPress && !isCancelled) {
                instantSaveItem(item.name, safePrice);
            }
        };

        row.addEventListener('pointerdown', startPress);
        row.addEventListener('pointerup', endPress);
        row.addEventListener('pointerleave', cancelPress);
        row.addEventListener('pointercancel', cancelPress);
        row.oncontextmenu = (e) => { e.preventDefault(); return false; };
        
        let priceDisplay = safePrice > 0 ? `<span style="font-size: 0.9rem; font-weight: 700; color: var(--text-secondary);">${safePrice} ${userCurrency}</span>` : `<span style="font-size: 0.9rem; font-weight: 700; color: #10b981;">Free</span>`;

        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 14px;">
                ${iconSVG}
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1.05rem;">${item.display || item.name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                ${priceDisplay}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>
        `;
        container.appendChild(row);
    });
}

// ==========================================
//        FIRESTORE CLOUD DATA LOGIC
// ==========================================
async function initUserData() {
    if(!currentUser) return;
    try {
        await performLazyAutoClose(); 

        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        const todayStr = getStrictDate();

        let userData = {};
        if (userDocSnap.exists()) {
            userData = userDocSnap.data();
            currentUserRole = userData.role || 'user';
            userNickname = userData.nickname || ''; 
            if (userData.devNotes) {
                document.getElementById('dev-notes-text').value = userData.devNotes;
            }
        } else { 
            currentUserRole = 'user'; 
        }

        await setDoc(userDocRef, { email: currentUser.email, displayName: userDisplayName, role: currentUserRole }, { merge: true });

        const globalDoc = await getDoc(doc(db, 'global', 'settings'));
        if (globalDoc.exists() && globalDoc.data().catalog) {
            globalCatalog = globalDoc.data().catalog;
            globalInventoryGroups = globalDoc.data().inventoryGroups || defaultInventoryGroups;
        } else {
            globalCatalog = defaultCatalog;
            globalInventoryGroups = defaultInventoryGroups;
            if (currentUserRole === 'admin') await setDoc(doc(db, 'global', 'settings'), { catalog: globalCatalog, inventoryGroups: globalInventoryGroups }, { merge: true });
        }

        document.getElementById('report-user-name').innerText = userDisplayName;
        if (currentUser.email) document.getElementById('report-user-email').innerText = currentUser.email;
        let toggleWrapper = document.getElementById('admin-report-toggle-wrapper');
        if (toggleWrapper) toggleWrapper.style.display = currentUserRole === 'admin' ? 'flex' : 'none';
        if (currentUser.photoURL) {
            document.getElementById('report-user-photo').src = currentUser.photoURL;
            document.getElementById('header-user-photo').src = currentUser.photoURL;
        }
        if(document.getElementById('tab-ers').classList.contains('active')) document.getElementById('header-title').innerText = userNickname || userDisplayName;

        document.getElementById('dev-note-fab').style.display = 'flex';

        updateCurrencyUI(); renderAppUI();
        
        const t = new Date(); 
        document.getElementById('report-date-picker').value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        
        if (userData.assignedDate === todayStr && userData.assignedDeskId) {
            currentDeskId = userData.assignedDeskId;
            
            const deskSnap = await getDoc(doc(db, 'desks', currentDeskId));
            if (deskSnap.exists() && deskSnap.data().status === 'open') {
                currentSessionId = deskSnap.data().currentSessionId;
                currentDeskName = deskSnap.data().name;
                document.getElementById('header-title').innerText = `${currentDeskName}`;
                try {
                    const sessionSnap = await getDoc(doc(db, 'sessions', currentSessionId));
                    if (sessionSnap.exists() && sessionSnap.data().openingBalances) {
                        currentOpeningCash = parseFloat(sessionSnap.data().openingBalances.cash) || 0;
                        currentOpeningInv = sessionSnap.data().openingBalances.inventory || {}; 
                    }
                } catch(e) {
                    console.error("Failed to recover session balances on app load:", e);
                }
            } else {
                currentDeskName = deskSnap.exists() ? deskSnap.data().name : currentDeskId;
                document.getElementById('header-title').innerText = `${currentDeskName} (Closed)`;
                currentSessionId = null; 
            }
            document.getElementById('modal-desk-select').classList.remove('active');
            await fetchTransactionsForDate();
        } else {
            await loadFloorMap();
        }
    } catch(e) { console.error(e); } finally {
        if (isInitialLoad) { document.getElementById('splash-screen').classList.remove('active'); isInitialLoad = false; }
    }
    setTimeout(setupBottomSheetDrag, 300); // Failsafe to attach drag physics
}

function addTransactionToCloud(type, name, amount, qty, payment, cashAmt = 0, mfsAmt = 0) {
    if(!currentUser) return;
    if (payment === 'Cash') { cashAmt = amount; mfsAmt = 0; }
    if (payment === 'MFS') { cashAmt = 0; mfsAmt = amount; }

    let catItem = Object.values(globalCatalog).find(c => c.name === name);
    let trackAs = catItem ? (catItem.trackAs || name) : name; 

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: type, name: name, trackAs: trackAs, amount: amount, qty: qty,
        payment: payment, cashAmt: cashAmt, mfsAmt: mfsAmt, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(),
        deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName
    };

    if (currentDeskId === 'sandbox') {
        tx.docId = 'local_' + tx.id;
        transactions.push(tx);
        transactions.sort((a, b) => a.id - b.id);
        renderPersonalReport();
        if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
        showFlashMessage("Saved to Sandbox!");
        if (isMfs) toggleMFS();
        return;
    }

    let confirmMsg = type === 'ERS' ? `ERS ${amount} Tk Logged!` : `${qty}x ${name} Logged!`;

    addDoc(collection(db, 'transactions'), tx).catch(e => {
        showAppAlert("Storage Error", "Could not save locally. Check storage.");
        console.error(e);
    });

    if (navigator.onLine) {
        showFlashMessage(confirmMsg);
    } else {
        showFlashMessage("Offline: Queued for sync");
    }

    if (isMfs) {
        toggleMFS();
    }
}

// ==========================================
//   ADMIN DASHBOARD CONTROLS
// ==========================================
function filterAdminCatalog() {
    let text = document.getElementById('admin-search').value.toLowerCase();
    document.querySelectorAll('.admin-row-card').forEach(row => { row.style.display = row.querySelector('.i-name').value.toLowerCase().includes(text) ? 'flex' : 'none'; });
}

function toggleAddForm() { let f = document.getElementById('admin-add-form'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; }

function renderInventoryGroupsAdmin() {
    let html = '';
    globalInventoryGroups.forEach((group, index) => {
        html += `<span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
            ${group} <button style="background: none; border: none; color: #ef4444; font-weight: bold; cursor: pointer;" onclick="removeInventoryGroup(${index})">✕</button>
        </span>`;
    });
    document.getElementById('admin-inventory-groups').innerHTML = html;
    populateTrackAsDropdowns();
}

function addInventoryGroup() {
    let val = document.getElementById('new-inv-group-name').value.trim();
    if (val && !globalInventoryGroups.includes(val)) {
        globalInventoryGroups.push(val);
        document.getElementById('new-inv-group-name').value = '';
        renderInventoryGroupsAdmin();
        openSettings(); 
    }
}

function removeInventoryGroup(index) {
    showAppAlert("Confirm Removal", "Remove this physical item from the Master List? Menu buttons tied to it will need to be reassigned.", true, () => {
        globalInventoryGroups.splice(index, 1);
        renderInventoryGroupsAdmin();
        openSettings();
    });
}

function populateTrackAsDropdowns() {
    let newSelect = document.getElementById('new-item-track');
    if(newSelect) {
        let options = '<option value="">None (Digital/Service)</option>';
        globalInventoryGroups.forEach(g => options += `<option value="${g}">${g}</option>`);
        newSelect.innerHTML = options;
    }
    let transSelect = document.getElementById('transfer-item-select');
    if (transSelect) {
        transSelect.innerHTML = '';
        globalInventoryGroups.forEach(itemName => {
            let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
            transSelect.appendChild(opt);
        });
    }
}

function openSettings() {
    let container = document.getElementById('settings-list-container');
    container.innerHTML = ''; document.getElementById('admin-search').value = ''; document.getElementById('admin-add-form').style.display = 'none';
    
    renderInventoryGroupsAdmin();
    renderUserManagementAdmin(); 

    const categories = [
        { id: 'new-sim', title: 'New SIMs', color: '#10b981' },
        { id: 'paid-rep', title: 'Paid Replacements', color: '#f59e0b' },
        { id: 'foc', title: 'Free of Cost', color: '#0ea5e9' },
        { id: 'service', title: 'Services', color: '#8b5cf6' },
        { id: 'free-action', title: 'Free Actions', color: '#64748b' }
    ];

    let activeItems = Object.entries(globalCatalog).map(([key, item]) => ({key, ...item})).filter(i => i.isActive).sort((a, b) => (a.order || 0) - (b.order || 0));

    categories.forEach(cat => {
        let catItems = activeItems.filter(i => i.cat === cat.id);
        if(catItems.length > 0) {
            let catHeader = document.createElement('div');
            catHeader.className = 'admin-group-title';
            catHeader.style.color = cat.color;
            catHeader.innerText = cat.title;
            container.appendChild(catHeader);

            catItems.forEach(item => {
                let trackOptions = '<option value="">None (Digital/Service)</option>';
                globalInventoryGroups.forEach(g => {
                    let sel = (item.trackAs === g) ? 'selected' : '';
                    trackOptions += `<option value="${g}" ${sel}>${g}</option>`;
                });

                let row = document.createElement('div'); row.className = 'admin-row-card admin-row'; row.setAttribute('data-key', item.key);
                row.innerHTML = `
                    <div class="admin-row-header">
                        <span class="drag-handle">⋮⋮</span>
                        <input type="text" class="settings-input i-name" style="flex:1; border:none; background:transparent; font-weight:700; color:#0f172a; padding:0; min-width:0;" value="${item.name}">
                        <button class="delete-btn" style="color: #ef4444; padding: 4px 8px; font-size: 1.1rem; flex-shrink: 0;" onclick="removeRow(this)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                    <div class="admin-row-body">
                        <div><label class="admin-label">Price (${userCurrency})</label><input type="number" class="settings-input i-price" style="padding: 10px; width: 100%; box-sizing: border-box;" value="${item.price}"></div>
                        <div>
                            <label class="admin-label">Category</label>
                            <select class="settings-input i-cat" style="padding: 10px; width: 100%; box-sizing: border-box;">
                                <option value="new-sim" ${item.cat==='new-sim'?'selected':''}>New SIM</option>
                                <option value="paid-rep" ${item.cat==='paid-rep'?'selected':''}>Paid Rep</option>
                                <option value="foc" ${item.cat==='foc'?'selected':''}>FOC</option>
                                <option value="service" ${item.cat==='service'?'selected':''}>Service</option>
                                <option value="free-action" ${item.cat==='free-action'?'selected':''}>Free Action</option>
                            </select>
                        </div>
                        <div style="grid-column: span 2;">
                            <label class="admin-label">Deducts from Physical Inventory:</label>
                            <select class="settings-input i-track" style="padding: 10px; width: 100%; box-sizing: border-box;">
                                ${trackOptions}
                            </select>
                        </div>
                    </div>
                `;
                container.appendChild(row); setupDragAndDrop(row); 
            });
        }
    });
    openModal('modal-settings');
}

let draggedEl = null;
function setupDragAndDrop(row) {
    const handle = row.querySelector('.drag-handle'); row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', () => { draggedEl = row; setTimeout(() => row.style.opacity = '0.5', 0); });
    row.addEventListener('dragend', () => { draggedEl.style.opacity = '1'; draggedEl = null; });
    row.addEventListener('dragover', (e) => { e.preventDefault(); if (!draggedEl || draggedEl === row) return; const box = row.getBoundingClientRect(); const offset = e.clientY - box.top - box.height / 2; if (offset > 0) row.parentNode.insertBefore(draggedEl, row.nextSibling); else row.parentNode.insertBefore(draggedEl, row); });
    handle.addEventListener('touchstart', () => { draggedEl = row; row.style.opacity = '0.5'; row.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }, { passive: true });
    handle.addEventListener('touchmove', (e) => { if (!draggedEl) return; e.preventDefault(); const touch = e.touches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY); const targetRow = target ? target.closest('.admin-row') : null; if (targetRow && targetRow !== draggedEl) { const box = targetRow.getBoundingClientRect(); const offset = touch.clientY - box.top - box.height / 2; if (offset > 0) targetRow.parentNode.insertBefore(draggedEl, targetRow.nextSibling); else targetRow.parentNode.insertBefore(draggedEl, targetRow); } }, { passive: false });
    handle.addEventListener('touchend', () => { if(!draggedEl) return; draggedEl.style.opacity = '1'; draggedEl.style.boxShadow = 'none'; draggedEl = null; });
}

function removeRow(btn) { 
    showAppAlert("Delete Item", "Are you sure you want to delete this menu button?", true, () => {
        let row = btn.closest('.admin-row'); row.style.display = 'none'; row.classList.add('deleted-row'); 
    });
}

function addNewItem() {
    let nameVal = document.getElementById('new-item-name').value.trim();
    let priceVal = parseFloat(document.getElementById('new-item-price').value);
    let catVal = document.getElementById('new-item-category').value;
    let trackVal = document.getElementById('new-item-track').value;

    if (nameVal && !isNaN(priceVal) && priceVal >= 0) {
        let newKey = "item_" + Date.now(); let newOrder = Object.keys(globalCatalog).length + 1;
        globalCatalog[newKey] = { name: nameVal, display: nameVal, price: priceVal, cat: catVal, trackAs: trackVal, isActive: true, order: newOrder };
        document.getElementById('new-item-name').value = ''; document.getElementById('new-item-price').value = '';
        renderAppUI(); openSettings(); showFlashMessage("Item Added! Click Save to publish.");
    } else showAppAlert("Error", "Please enter a valid name and price.");
}

async function saveSettings() {
    if(!currentUser) return;
    let orderCounter = 1;
    document.querySelectorAll('.admin-row').forEach(row => {
        let key = row.getAttribute('data-key');
        if (globalCatalog[key]) {
            if (row.classList.contains('deleted-row')) globalCatalog[key].isActive = false; 
            else {
                globalCatalog[key].name = row.querySelector('.i-name').value;
                globalCatalog[key].display = row.querySelector('.i-name').value; 
                globalCatalog[key].price = parseFloat(row.querySelector('.i-price').value) || 0;
                globalCatalog[key].cat = row.querySelector('.i-cat').value;
                globalCatalog[key].trackAs = row.querySelector('.i-track').value;
                globalCatalog[key].order = orderCounter++; 
            }
        }
    });
    try {
        if (currentUserRole === 'admin') await setDoc(doc(db, 'global', 'settings'), { catalog: globalCatalog, inventoryGroups: globalInventoryGroups }, { merge: true });
        renderAppUI(); closeModal('modal-settings'); showFlashMessage("Settings Saved & Synced!");
    } catch(e) { showAppAlert("Error", "Error saving settings."); }
}

// ==========================================
//  ADMIN CENTRALIZED NICKNAME MANAGER
// ==========================================
async function openNicknameManager() {
    openModal('modal-nicknames');
    const container = document.getElementById('nickname-list-container');
    container.innerHTML = '<div class="spinner" style="margin: 0 auto; border-top-color: #0ea5e9;"></div>';
    
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let html = '';
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            const uid = docSnap.id;
            const userEmail = u.email || 'No email linked';
            const currentNick = u.nickname || '';
            
            html += `
                <div class="admin-form-card" style="padding: 12px; margin-bottom: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: #0ea5e9; margin-bottom: 4px;">${userEmail}</div>
                        <input type="text" id="nick_${uid}" class="settings-input" style="padding: 8px;" placeholder="Set nickname..." value="${currentNick}">
                    </div>
                    <button class="btn-outline" style="height: auto; padding: 8px 16px; border-color: #10b981; color: #10b981; margin-top: auto;" onclick="saveAdminNickname('${uid}', 'nick_${uid}')">Save</button>
                </div>
            `;
        });
        container.innerHTML = html || '<p>No users found in database.</p>';
    } catch(e) {
        container.innerHTML = '<p style="color: #ef4444;">Error loading users.</p>';
    }
}

async function saveAdminNickname(uid, inputId) {
    const newNick = document.getElementById(inputId).value.trim();
    try {
        await updateDoc(doc(db, 'users', uid), { nickname: newNick });
        showFlashMessage("Nickname saved!");
        
        if (uid === currentUser.uid) {
            userNickname = newNick;
            document.getElementById('report-user-name').innerText = userNickname || userDisplayName;
            if(!currentDeskId && document.getElementById('tab-ers').classList.contains('active')) {
                document.getElementById('header-title').innerText = userNickname || userDisplayName;
            }
        }
        
        if (currentDeskId) renderDeskDashboard(currentDeskId);
        if (document.getElementById('tab-floor').classList.contains('active')) renderLiveFloorTab();
        renderUserManagementAdmin();
        
    } catch(e) { showAppAlert("Error", "Error saving nickname."); }
}

// ==========================================
//   USER MANAGEMENT & DANGER ZONE
// ==========================================
async function renderUserManagementAdmin() {
    const container = document.getElementById('admin-user-management-list');
    if (!container) return;
    container.innerHTML = '<div class="spinner" style="width: 24px; height: 24px; border-width: 3px; margin: 0 auto; border-top-color: #f59e0b;"></div>';

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let html = ''; let activeCount = 0;

        usersSnap.forEach(docSnap => {
            const u = docSnap.data(); const uid = docSnap.id;
            if (u.assignedDeskId) {
                activeCount++;
                const deskName = u.assignedDeskId.replace('_', ' ').toUpperCase();
                const displayName = u.nickname || u.displayName || u.email?.split('@')[0] || 'Unknown';

                html += `
                    <div style="background: #ffffff; border: 1px solid #fcd34d; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <strong style="color: #92400e; font-size: 0.95rem;">${displayName}</strong>
                            <div style="font-size: 0.8rem; color: #b45309;">${deskName}</div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: auto; border-color: #f59e0b; color: #d97706;" onclick="kickAgent('${uid}')">Kick</button>
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: auto; border-color: #ef4444; color: #ef4444; background: #fef2f2;" onclick="nukeAgent('${uid}', '${displayName}')">Nuke & Kick</button>
                        </div>
                    </div>
                `;
            }
        });
        container.innerHTML = activeCount > 0 ? html : '<p style="font-size: 0.85rem; color: #b45309; margin: 0;">No agents currently locked to a desk.</p>';
    } catch (e) { container.innerHTML = '<p style="color: #ef4444; font-size: 0.85rem;">Offline: Cannot fetch users.</p>'; }
}

function kickAgent(uid) {
    showAppAlert("Kick Agent", "Kick this agent from their desk? Their sales data will remain intact.", true, async () => {
        try {
            await setDoc(doc(db, 'users', uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
            showFlashMessage("Agent Kicked Successfully!");
            renderUserManagementAdmin();
        } catch(e) { showAppAlert("Error", "Error kicking agent."); }
    });
}

function nukeAgent(uid, agentName) {
    showAppAlert("Burn Notice", `WARNING: You are about to kick ${agentName} AND permanently delete EVERY transaction they made today. Proceed?`, true, async () => {
        try {
            await setDoc(doc(db, 'users', uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
            const targetDateStr = getStrictDate();
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('agentId', '==', uid), where('dateStr', '==', targetDateStr)));
            txSnap.forEach(async (t) => { await deleteDoc(doc(db, 'transactions', t.id)); });
            showFlashMessage(`Agent Nixed & Data Erased!`);
            renderUserManagementAdmin();
        } catch(e) { showAppAlert("Error", "Error executing Burn Notice."); }
    }, "Nuke Data");
}

function resetMyDeskLock() {
    showAppAlert("Release Desk", "Release your desk assignment? You will be sent back to the floor map.", true, async () => {
        await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
        window.location.reload();
    });
}

function forceCloseAllDesks() {
    showAppAlert("Force Close All", "FORCE CLOSE ALL DESKS? This will instantly log out every agent on the floor.", true, async () => {
        const snap = await getDocs(collection(db, 'desks'));
        snap.forEach(async (d) => { await setDoc(doc(db, 'desks', d.id), { status: 'closed', currentSessionId: null }, { merge: true }); });
        const sSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        sSnap.forEach(async (s) => { await updateDoc(doc(db, 'sessions', s.id), { status: 'closed', closedBy: 'Admin Override' }); });
        window.location.reload();
    }, "Force Close");
}

function nukeTodaysLedger() {
    showAppAlert("Delete Ledger", "PERMANENTLY DELETE TODAY'S LEDGER? This cannot be undone!", true, async () => {
        const targetDateStr = getStrictDate();
        const snap = await getDocs(query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr)));
        snap.forEach(async (t) => { await deleteDoc(doc(db, 'transactions', t.id)); });
        window.location.reload();
    }, "Delete Entire Ledger");
}

function fixPastManagerDrops() {
    showAppAlert("Fix Drops", "Fix past 0 Tk Manager Drops in the database?", true, async () => {
        try {
            const q = query(collection(db, 'transactions'), where('type', '==', 'adjustment'));
            const snap = await getDocs(q);
            let count = 0;
            
            for (const docSnap of snap.docs) {
                let tx = docSnap.data();
                if (tx.name === 'Physical Cash' && tx.amount === 0 && tx.cashAmt !== 0) {
                    await updateDoc(doc(db, 'transactions', docSnap.id), {
                        amount: Math.abs(tx.cashAmt), 
                        qty: 1
                    });
                    count++;
                }
            }
            alert(`Successfully fixed ${count} past manager drop(s)! Reloading...`);
            window.location.reload();
        } catch (e) {
            showAppAlert("Error", "Error fixing drops: " + e.message);
        }
    }, "Run Fix");
}

// ==========================================
//   ENGINE A: PERSONAL & FLOOR REPORT LOGIC
// ==========================================
let currentReportMode = 'personal';

window.toggleReportMode = function(mode) {
    currentReportMode = mode;
    document.getElementById('toggle-personal').classList.toggle('active', mode === 'personal');
    document.getElementById('toggle-floor').classList.toggle('active', mode === 'floor');
    renderPersonalReport();
}

async function renderPersonalReport() {
    let filterVal = document.getElementById('personal-history-filter') ? document.getElementById('personal-history-filter').value : 'all';
    
    let myCash = 0, myMfs = 0;
    let myErsCount = 0, myErsTotal = 0;
    let myItemsSold = {}; 
    let historyHTML = '';

    let targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());

    let floorOpeningCash = 0;
    let floorManagerDrops = 0;
    
    // NEW: Detailed Floor Inventory Stats Object
    let floorInvStats = {};
    getPhysicalItems().forEach(item => {
        floorInvStats[item] = { open: 0, inOut: 0, sold: 0, rem: 0 };
    });

    // IF ADMIN VIEW: Fetch all opening balances for the day
    if (currentReportMode === 'floor') {
        try {
            const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
            sessSnap.forEach(docSnap => {
                let s = docSnap.data();
                floorOpeningCash += parseFloat(s.openingBalances?.cash) || 0;
                let inv = s.openingBalances?.inventory || {};
                for (let [item, qty] of Object.entries(inv)) {
                    if (floorInvStats[item]) {
                        floorInvStats[item].open += qty;
                        floorInvStats[item].rem += qty;
                    }
                }
            });
        } catch(e) { console.error("Could not fetch floor sessions", e); }
    }

    [...transactions].reverse().forEach(tx => {
        if (tx.isDeleted) return;
        
        // Mode Branching: Filter out other agents if we are in Personal view
        if (currentReportMode === 'personal' && tx.agentId !== currentUser.uid) return;
        if (currentReportMode === 'personal' && tx.isRemoteTransfer) return; // Hide ghost transfers for personal view

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        
        // Track Aggregated Sales
        if (tx.type === 'adjustment' && tx.name === 'Physical Cash') {
            floorManagerDrops += safeCashAmt;
        } else if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            myCash += safeCashAmt; 
            myMfs += safeMfsAmt;
            
            if (tx.name === 'ERS Flexiload') {
                myErsCount += Math.abs(tx.qty);
                myErsTotal += tx.amount;
            } else if (tx.name !== 'Physical Cash') {
                myItemsSold[tx.name] = (myItemsSold[tx.name] || 0) + Math.abs(tx.qty); 
            }
        }

        // Track Floor-Wide Detailed Inventory Math
        if (currentReportMode === 'floor' && globalInventoryGroups.includes(tx.trackAs)) {
            let trackAs = tx.trackAs;
            let q = Math.abs(tx.qty);
            
            if (tx.type === 'transfer_in') { floorInvStats[trackAs].inOut += q; floorInvStats[trackAs].rem += q; }
            else if (tx.type === 'transfer_out') { floorInvStats[trackAs].inOut -= q; floorInvStats[trackAs].rem -= q; }
            else if (tx.type === 'adjustment') { floorInvStats[trackAs].inOut += q; floorInvStats[trackAs].rem += q; }
            else { 
                floorInvStats[trackAs].sold += q; 
                floorInvStats[trackAs].rem -= q; 
            }
        }
        
        // FILTER & UI RENDERING
        let catItem = Object.values(globalCatalog).find(c => c.name === tx.name);
        let txCat = catItem ? catItem.cat : null;
        let showTx = false;
        
        if (filterVal === 'all') showTx = true;
        else if (filterVal === 'ers' && tx.name === 'ERS Flexiload') showTx = true;
        else if (filterVal === 'cash_ops' && tx.type === 'adjustment' && tx.name === 'Physical Cash') showTx = true;
        else if (filterVal === 'transfers' && (tx.type === 'transfer_in' || tx.type === 'transfer_out')) showTx = true;
        else if (filterVal === txCat) showTx = true;

        if (!showTx) return;
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Pending</span>';
        if (tx.isEdited) badges += `<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold; cursor: pointer;" onclick="showAuditTrail('${tx.id}')">Edited</span>`;
        let agentBadge = currentReportMode === 'floor' ? `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 12px; font-weight: 700; letter-spacing: 0.5px;">${tx.agentName.split(' ')[0]}</span>` : '';

        let actionBtns = '';
        
        if (currentReportMode === 'personal' || currentUserRole === 'admin') {
            actionBtns = `
                <div class="tx-actions" style="display: none; width: 100%; padding-top: 12px; margin-top: 12px; border-top: 1px dashed var(--border-color); justify-content: flex-end; gap: 8px;">
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: var(--accent-color); border-color: var(--accent-color); gap: 6px;" onclick="event.stopPropagation(); openEditTx(${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Edit
                    </button>
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: #ef4444; border-color: #fca5a5; background: #fef2f2; gap: 6px;" onclick="event.stopPropagation(); deleteTransaction('${tx.docId}', ${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Trash
                    </button>
                </div>
            `;
        }

        historyHTML += `
            <div class="history-item" style="cursor: pointer; flex-direction: column; align-items: stretch; transition: background-color 0.15s;" onclick="const actions = this.querySelector('.tx-actions'); if(actions) { actions.style.display = actions.style.display === 'none' ? 'flex' : 'none'; }">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div class="history-info" style="flex: 1; padding-right: 12px;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; margin-bottom: 2px;">
                            <span class="history-title" style="margin-right: 8px;">${tx.qty}x ${tx.name}</span>
                            ${badges}
                        </div>
                        <span class="history-meta">${tx.receiptNo || tx.id} • ${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0; padding-top: 2px;">
                        ${agentBadge}
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    });

    // UPDATE UI METRICS & HEADER
    if (currentReportMode === 'floor') {
        document.getElementById('report-user-name').innerText = "Consolidated Floor Report";
        document.getElementById('report-user-email').innerText = `Floor Opening Cash: ${floorOpeningCash} Tk | Manager Drops: ${floorManagerDrops} Tk`;
        document.getElementById('report-user-photo').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666666'%3E%3Cpath d='M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z'/%3E%3C/svg%3E";
    } else {
        document.getElementById('report-user-name').innerText = userDisplayName;
        document.getElementById('report-user-email').innerText = currentUser.email || 'email@example.com';
        if (currentUser.photoURL) document.getElementById('report-user-photo').src = currentUser.photoURL;
    }

    if(document.getElementById('report-total-all')) document.getElementById('report-total-all').innerText = (myCash + myMfs) + ' ' + userCurrency;
    if(document.getElementById('tot-cash-sales')) {
        document.getElementById('tot-cash-sales').innerText = myCash + ' ' + userCurrency;
        document.getElementById('tot-cash-sales').style.color = '#0ea5e9';
    }
    if(document.getElementById('tot-mfs')) {
        document.getElementById('tot-mfs').innerText = myMfs + ' ' + userCurrency;
        document.getElementById('tot-mfs').style.color = '#10b981';
    }
    if(document.getElementById('tot-ers')) {
        document.getElementById('tot-ers').innerText = myErsTotal + ' ' + userCurrency;
        document.getElementById('tot-ers').style.color = '#f59e0b';
    }

    // PREMIUM SCORECARD: Unified Flat List
    let invHTML = '';
    for (const [name, qty] of Object.entries(myItemsSold)) {
        invHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 4px; border-bottom: 1px solid var(--border-color);">
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1rem;">${name}</span>
                <span style="font-weight: 800; color: var(--text-secondary); font-size: 1.1rem;">${qty}x</span>
            </div>
        `;
    }

    let finalInventoryListHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No items sold yet</div>';

    // Inject Detailed Grid for Floor Mode
    if (currentReportMode === 'floor') {
        let liveStockHTML = `
            <div style="margin-top: 24px; font-size: 0.95rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; padding: 0 4px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">Consolidated Floor Stock</div>
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; padding: 12px 4px 8px 4px; border-bottom: 2px solid var(--border-color); font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                <div>Item</div>
                <div style="text-align: center;">Start</div>
                <div style="text-align: center;">In/Out</div>
                <div style="text-align: center;">Sold</div>
                <div style="text-align: center; color: #0ea5e9;">Exp.</div>
            </div>
        `;
        
        let hasLiveStock = false;
        for (const [item, d] of Object.entries(floorInvStats)) {
            if (d.open === 0 && d.inOut === 0 && d.sold === 0 && d.rem === 0) continue;
            hasLiveStock = true;
            
            let inOutColor = d.inOut > 0 ? '#10b981' : (d.inOut < 0 ? '#ef4444' : 'var(--text-secondary)');
            let inOutStr = d.inOut > 0 ? `+${d.inOut}` : (d.inOut < 0 ? `${d.inOut}` : `0`);

            liveStockHTML += `
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; align-items: center; padding: 12px 4px; border-bottom: 1px dashed var(--border-color); font-size: 0.85rem;">
                    <div style="font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; cursor: pointer;" onclick="showTooltip(this, '${item}')">${item}</div>
                    <div style="text-align: center; color: var(--text-secondary); font-weight: 600;">${d.open}</div>
                    <div style="text-align: center; color: ${inOutColor}; font-weight: 700;">${inOutStr}</div>
                    <div style="text-align: center; color: #f59e0b; font-weight: 700;">${d.sold}</div>
                    <div style="text-align: center; color: #0ea5e9; font-weight: 800; font-size: 1rem;">${d.rem}</div>
                </div>
            `;
        }
        
        if (!hasLiveStock) liveStockHTML += '<div style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No physical stock recorded today</div>';
        finalInventoryListHTML += liveStockHTML;
    }

    document.getElementById('inventory-list').innerHTML = finalInventoryListHTML;
    
    // UPDATE HISTORY LOG
    document.getElementById('history-log').innerHTML = historyHTML || `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <p>No transactions found</p>
        </div>`;
}

function buildLifecycleText(txList, openingInv) {
    let stats = {};
    let hasItems = false;
    
    getPhysicalItems().forEach(item => {
        let openQty = openingInv[item] || 0;
        if (openQty > 0) {
            stats[item] = { open: openQty, in: 0, out: 0, sold: 0, rem: openQty, rev: 0 };
            hasItems = true;
        }
    });

    txList.forEach(tx => {
        if (tx.isDeleted || tx.name === 'Physical Cash' || tx.name === 'ERS Flexiload') return;
        
        let trackAs = tx.trackAs;
        if (!globalInventoryGroups.includes(trackAs)) return;

        if (!stats[trackAs]) stats[trackAs] = { open: 0, in: 0, out: 0, sold: 0, rem: 0, rev: 0 };
        
        hasItems = true;
        let q = Math.abs(tx.qty);
        
        if (tx.type === 'transfer_in') { stats[trackAs].in += q; stats[trackAs].rem += q; }
        else if (tx.type === 'transfer_out') { stats[trackAs].out += q; stats[trackAs].rem -= q; }
        else if (tx.type === 'adjustment') { stats[trackAs].in += q; stats[trackAs].rem += q; }
        else { 
            stats[trackAs].sold += q; 
            stats[trackAs].rem -= q; 
            stats[trackAs].rev += (tx.amount || 0); 
        }
    });

    if (!hasItems) return "None\n";

    let text = "";
    for (const [item, data] of Object.entries(stats)) {
        if (data.open === 0 && data.in === 0 && data.sold === 0 && data.out === 0) continue;
        text += `> ${item}\n`;
        text += `  Opened: ${data.open} | In: ${data.in} | Out: ${data.out} | Sold: ${data.sold}\n`;
        text += `  Remaining: ${data.rem} | Revenue: ${data.rev} Tk\n\n`;
    }
    return text;
}

function shareReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let totalRevenue = document.getElementById('report-total-all') ? document.getElementById('report-total-all').innerText : "0 Tk";
    let totalMfs = document.getElementById('tot-mfs').innerText;
    let totalCash = document.getElementById('tot-cash-sales').innerText;
    let totalErs = document.getElementById('tot-ers').innerText;
    
    let reportText = "";
    
    if (currentReportMode === 'floor') {
        reportText = `CONSOLIDATED FLOOR REPORT: ${dateStr}\n\nSALES SUMMARY\nTotal Revenue: ${totalRevenue}\nCash Collected: ${totalCash}\nMFS Collected: ${totalMfs}\nERS Disbursed: ${totalErs}\n\n`;
        // Only shares the top line financial math for the whole store for quick text messages
    } else {
        reportText = `My Daily Report: ${dateStr}\nAgent: ${userNickname || userDisplayName}\n\nPERSONAL SALES SUMMARY\nTotal Revenue: ${totalRevenue}\nCash Collected: ${totalCash}\nMFS Collected: ${totalMfs}\nERS Disbursed: ${totalErs}\n\nPHYSICAL INVENTORY LIFECYCLE\n`;
        let myTx = transactions.filter(t => t.agentId === currentUser.uid);
        reportText += buildLifecycleText(myTx, currentOpeningInv);
    }

    if (navigator.share) navigator.share({ title: 'Report', text: reportText }).catch(e => console.log(e));
    else { try { navigator.clipboard.writeText(reportText).then(() => showFlashMessage("Report Copied!")).catch(() => fallbackCopy(reportText)); } catch (e) { fallbackCopy(reportText); } }
}

function shareDeskReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let deskTitle = document.getElementById('desk-dashboard-title').innerText;
    let activeAgents = document.getElementById('desk-logged-agents').innerText;

    let opening = document.getElementById('desk-tot-opening').innerText;
    let cashSales = document.getElementById('desk-tot-cash-sales').innerText;
    let mgrDrop = document.getElementById('desk-tot-manager').innerText;
    let expected = document.getElementById('desk-tot-expected-cash').innerText;
    
    let deskTx = transactions.filter(t => t.deskId === currentDeskId && t.dateStr === dateStr);
    let deskMfs = 0;
    deskTx.forEach(tx => {
        if(!tx.isDeleted) {
            deskMfs += (tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0));
        }
    });

    let reportText = `Desk Report: ${dateStr}\n${deskTitle}\nAgents: ${activeAgents}\n\nDRAWER SUMMARY\nOpening Cash: ${opening}\nCash Sales: ${cashSales}\nManager Drops: ${mgrDrop}\n------------------------\nExpected Cash: ${expected}\nExpected MFS: ${deskMfs} Tk\n\nPHYSICAL INVENTORY LIFECYCLE\n`;

    reportText += buildLifecycleText(deskTx, currentOpeningInv);

    if (navigator.share) navigator.share({ title: 'Desk Report', text: reportText }).catch(e => console.log(e));
    else { try { navigator.clipboard.writeText(reportText).then(() => showFlashMessage("Desk Report Copied!")).catch(() => fallbackCopy(reportText)); } catch (e) { fallbackCopy(reportText); } }
}

function generateDashboardHTML(cashMath, mfsTotal, ersData, invStats, deskItemsSold) {
    let { opening, sales, drops, expected } = cashMath;
    
    // --- 1. BUILD THE SMART ACCORDION FOR PHYSICAL STOCK ---
    let invRows = '';
    let activeItemCount = 0; 
    
    for (const [item, d] of Object.entries(invStats)) {
        if (d.open === 0 && d.inOut === 0 && d.sold === 0 && d.rem === 0) continue;
        activeItemCount++; 
        
        let inOutColor = d.inOut > 0 ? '#10b981' : (d.inOut < 0 ? '#ef4444' : 'var(--text-secondary)');
        let inOutStr = d.inOut > 0 ? `+${d.inOut}` : (d.inOut < 0 ? `${d.inOut}` : `0`);

        invRows += `
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">
                <div style="font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; cursor: pointer;" onclick="showTooltip(this, '${item}')">${item}</div>
                <div style="text-align: center; color: var(--text-secondary); font-weight: 600;">${d.open}</div>
                <div style="text-align: center; color: ${inOutColor}; font-weight: 700;">${inOutStr}</div>
                <div style="text-align: center; color: #f59e0b; font-weight: 700;">${d.sold}</div>
                <div style="text-align: center; color: #0ea5e9; font-weight: 800; font-size: 1rem;">${d.rem}</div>
            </div>
        `;
    }

    if (!invRows) invRows = `<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">No physical stock recorded today</div>`;
    
    let summaryText = activeItemCount > 0 ? `Physical Stock: ${activeItemCount} Active Items` : 'Physical Stock: No Movement';
    let summaryColor = activeItemCount > 0 ? '#0ea5e9' : '#64748b';
    let summaryBg = activeItemCount > 0 ? '#f0f9ff' : '#f8fafc';
    let summaryBorder = activeItemCount > 0 ? '#bae6fd' : 'var(--border-color)';

    // --- 2. BUILD THE UNIFIED FLAT LIST ---
    let itemsHTML = '';
    for (const [name, qty] of Object.entries(deskItemsSold)) {
        itemsHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 4px; border-bottom: 1px solid var(--border-color);">
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1rem;">${name}</span>
                <span style="font-weight: 800; color: var(--text-secondary); font-size: 1.1rem;">${qty}x</span>
            </div>
        `;
    }
    if (!itemsHTML) itemsHTML = '<div style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No items or services sold yet</div>';

    let formattedDrops = drops !== 0 ? drops : '0';

    // --- 3. RETURN THE FINAL ASSEMBLED HTML ---
    return `
        <div class="admin-form-card" style="padding: 16px; margin-bottom: 16px; background: #f8fafc; border: 1px solid #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px;">Physical Cash Formula</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 500;">Opening Float</span>
                <strong style="font-size: 1.05rem; color: var(--text-primary);">${opening} Tk</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 500;">+ Cash Sales</span>
                <strong style="font-size: 1.05rem; color: #10b981;">+${sales} Tk</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 16px;">
                <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 500;">- Manager Drops</span>
                <strong style="font-size: 1.05rem; color: #ef4444;">${formattedDrops} Tk</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 1rem; font-weight: 800; color: #0ea5e9; text-transform: uppercase;">Expected Cash</span>
                <strong style="font-size: 1.5rem; font-weight: 800; color: #0ea5e9;">${expected} Tk</strong>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 12px; text-align: center; box-shadow: 0 2px 4px rgba(22,101,52,0.05);">
                <div style="font-size: 0.75rem; font-weight: 800; color: #166534; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">Total MFS</div>
                <div style="font-size: 1.35rem; font-weight: 800; color: #15803d;">${mfsTotal} Tk</div>
            </div>
            <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 16px; border-radius: 12px; text-align: center; box-shadow: 0 2px 4px rgba(180,83,9,0.05);">
                <div style="font-size: 0.75rem; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">ERS Sent (${ersData.count}x)</div>
                <div style="font-size: 1.35rem; font-weight: 800; color: #d97706;">${ersData.total} Tk</div>
            </div>
        </div>

        <div class="admin-form-card" style="padding: 0; margin-bottom: 24px; overflow: hidden; border: 1px solid ${summaryBorder}; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
            <div style="background: ${summaryBg}; padding: 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="const c = document.getElementById('inv-grid-content'); const i = document.getElementById('inv-grid-icon'); if(c.style.display==='none'){c.style.display='block'; i.style.transform='rotate(180deg)';}else{c.style.display='none'; i.style.transform='rotate(0deg)';}">
                <div style="font-size: 0.85rem; font-weight: 800; color: ${summaryColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${summaryText}
                </div>
                <svg id="inv-grid-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${summaryColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div id="inv-grid-content" style="display: none; background: #ffffff; border-top: 1px solid ${summaryBorder};">
                <div style="padding: 0 16px;">
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; padding: 12px 0; border-bottom: 2px solid var(--border-color); font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                        <div>Item</div>
                        <div style="text-align: center;">Start</div>
                        <div style="text-align: center;">In/Out</div>
                        <div style="text-align: center;">Sold</div>
                        <div style="text-align: center; color: #0ea5e9;">Exp.</div>
                    </div>
                    ${invRows}
                </div>
            </div>
        </div>

        <div style="margin-bottom: 24px;">
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; padding: 0 4px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">Desk Items & Services Sold</div>
            ${itemsHTML}
        </div>
    `;
}

// ==========================================
//   ENGINE B: DESK DASHBOARD LOGIC
// ==========================================
async function renderDeskDashboard(targetDeskId = currentDeskId) {
    if (!targetDeskId) return;

    let filterVal = document.getElementById('desk-history-filter') ? document.getElementById('desk-history-filter').value : 'all';
    let historyHTML = '';
    
    let deskOpeningCash = 0;
    let activeSessionId = null;
    let activeOpeningInv = {};

    const targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
    const isToday = targetDateStr === getStrictDate();

    if (targetDeskId === currentDeskId && isToday && currentSessionId) {
        activeSessionId = currentSessionId;
        deskOpeningCash = currentOpeningCash;
        activeOpeningInv = currentOpeningInv;
    } else {
        try {
            const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
            let bestSession = null;
            sessSnap.forEach(docSnap => {
                let s = docSnap.data();
                if (s.deskId === targetDeskId) {
                    if (!bestSession || (s.openedAt?.toMillis() || 0) > (bestSession.openedAt?.toMillis() || 0)) {
                        bestSession = { id: docSnap.id, ...s };
                    }
                }
            });
            if (bestSession) {
                activeSessionId = bestSession.id;
                if (bestSession.openingBalances) {
                    deskOpeningCash = parseFloat(bestSession.openingBalances.cash) || 0;
                    activeOpeningInv = bestSession.openingBalances.inventory || {};
                }
            }
        } catch(e) { console.error(e); }
    }

    // Engine Variables
    let deskCashSales = 0, mgrDropRcv = 0, deskMfs = 0, deskErsCount = 0, deskErsTotal = 0;
    let deskItemsSold = {}; // Tracks BOTH physical and digital in one flat list
    let invStats = {}; // Strictly for the physical counting accordion
    
    getPhysicalItems().forEach(item => {
        let o = activeOpeningInv[item] || 0;
        invStats[item] = { open: o, inOut: 0, sold: 0, rem: o };
    });

    [...transactions].reverse().forEach(tx => {
        if (tx.isDeleted) return;
        if (tx.sessionId !== activeSessionId) return;

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0); 
        
        deskMfs += safeMfsAmt;

        // Sales Math & Flat List Generation
        if (tx.type === 'adjustment' && tx.name === 'Physical Cash') {
            mgrDropRcv += safeCashAmt; 
        } else if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            deskCashSales += safeCashAmt; 
            
            if (tx.name === 'ERS Flexiload') {
                deskErsCount += Math.abs(tx.qty);
                deskErsTotal += tx.amount;
            } else if (tx.name !== 'Physical Cash') {
                // ADD TO FLAT LIST (Captures Skitto Kits, MNP, Ownership Transfers alike)
                deskItemsSold[tx.name] = (deskItemsSold[tx.name] || 0) + Math.abs(tx.qty);
            }
        }

        // Strict Physical Inventory Grid Math
        if (globalInventoryGroups.includes(tx.trackAs)) {
            let trackAs = tx.trackAs;
            let q = Math.abs(tx.qty);
            
            if (tx.type === 'transfer_in') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
            else if (tx.type === 'transfer_out') { invStats[trackAs].inOut -= q; invStats[trackAs].rem -= q; }
            else if (tx.type === 'adjustment') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
            else { 
                invStats[trackAs].sold += q; 
                invStats[trackAs].rem -= q; 
            }
        }
        
        // Filter Logic for History Log
        let catItem = Object.values(globalCatalog).find(c => c.name === tx.name);
        let txCat = catItem ? catItem.cat : null;
        let showTx = false;
        
        if (filterVal === 'all') showTx = true;
        else if (filterVal === 'ers' && tx.name === 'ERS Flexiload') showTx = true;
        else if (filterVal === 'cash_ops' && tx.type === 'adjustment' && tx.name === 'Physical Cash') showTx = true;
        else if (filterVal === 'transfers' && (tx.type === 'transfer_in' || tx.type === 'transfer_out')) showTx = true;
        else if (filterVal === txCat) showTx = true;

        if (!showTx) return;
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Pending</span>';
        if (tx.isEdited) badges += `<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold; cursor: pointer;" onclick="showAuditTrail('${tx.id}')">Edited</span>`;
        let agentBadge = `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 12px; font-weight: 700; letter-spacing: 0.5px;">${tx.agentName.split(' ')[0]}</span>`;

        let actionBtns = '';
        
        // Only show edit/trash inside the desk view if it's the user's active desk, or if they are an admin
        if (targetDeskId === currentDeskId || currentUserRole === 'admin') {
            actionBtns = `
                <div class="tx-actions" style="display: none; width: 100%; padding-top: 12px; margin-top: 12px; border-top: 1px dashed var(--border-color); justify-content: flex-end; gap: 8px;">
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: var(--accent-color); border-color: var(--accent-color); gap: 6px;" onclick="event.stopPropagation(); openEditTx(${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Edit
                    </button>
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: #ef4444; border-color: #fca5a5; background: #fef2f2; gap: 6px;" onclick="event.stopPropagation(); deleteTransaction('${tx.docId}', ${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Trash
                    </button>
                </div>
            `;
        }

        historyHTML += `
            <div class="history-item" style="cursor: pointer; flex-direction: column; align-items: stretch; transition: background-color 0.15s;" onclick="const actions = this.querySelector('.tx-actions'); if(actions) { actions.style.display = actions.style.display === 'none' ? 'flex' : 'none'; }">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div class="history-info" style="flex: 1; padding-right: 12px;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; margin-bottom: 2px;">
                            <span class="history-title" style="margin-right: 8px;">${tx.qty}x ${tx.name}</span>
                            ${badges}
                        </div>
                        <span class="history-meta">${tx.receiptNo || tx.id} • ${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0; padding-top: 2px;">
                        ${agentBadge}
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    });

    let cashMath = { opening: deskOpeningCash, sales: deskCashSales, drops: mgrDropRcv, expected: (deskOpeningCash + deskCashSales + mgrDropRcv) };
    let ersData = { count: deskErsCount, total: deskErsTotal };

    document.getElementById('live-dashboard-wrapper').innerHTML = generateDashboardHTML(cashMath, deskMfs, ersData, invStats, deskItemsSold);
    document.getElementById('desk-history-log').innerHTML = historyHTML || '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><p>Drawer is empty</p></div>';

    try {
        const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', targetDeskId)));
        let names = [];
        agentsSnap.forEach(doc => { names.push(doc.data().nickname || doc.data().displayName || doc.data().email?.split('@')[0] || 'Agent'); });
        document.getElementById('desk-logged-agents').innerText = names.length > 0 ? names.join(', ') : 'None';
    } catch(e) { document.getElementById('desk-logged-agents').innerText = 'Unknown'; }
}

// ==========================================
//   ADMIN CSV EXPORT & AUDIT LOGS
// ==========================================
async function exportLedgerCSV() {
    let targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
    try {
        const txSnap = await getDocs(query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr)));
        let csvContent = "data:text/csv;charset=utf-8,ID,Time,Desk,Agent,Type,Item,Qty,TotalAmount,CashAmount,MfsAmount,PaymentMethod,IsEdited,IsDeleted\n";
        
        let rows = [];
        txSnap.forEach(doc => { rows.push(doc.data()); });
        
        rows.sort((a,b) => a.id - b.id).forEach(t => {
            let row = [
                t.id, t.time, t.deskId || 'None', `"${t.agentName || 'Unknown'}"`, t.type || '', 
                `"${t.name}"`, t.qty || 0, t.amount || 0, t.cashAmt || 0, t.mfsAmt || 0, 
                t.payment || '', !!t.isEdited, !!t.isDeleted
            ];
            csvContent += row.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Amolnama_Ledger_${targetDateStr.replace(/\//g, '-')}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch(e) { showAppAlert("Export Error", e.message); }
}

function openAuditModal() {
    openModal('modal-audit');
    const t = new Date(); 
    document.getElementById('audit-date').value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    fetchAuditLogs();
}

async function fetchAuditLogs() {
    let val = document.getElementById('audit-date').value;
    if(!val) return;
    let targetDateStr = formatToGBDate(val);
    let container = document.getElementById('audit-results');
    container.innerHTML = '<div class="spinner" style="margin: 20px auto; border-top-color: #f59e0b;"></div>';

    try {
        const snap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr), where('status', '==', 'closed')));
        if(snap.empty) { container.innerHTML = '<p class="placeholder-text">No closed sessions found for this date.</p>'; return; }

        let html = '';
        snap.forEach(docSnap => {
            let s = docSnap.data();
            let vColor = s.variance < 0 ? '#ef4444' : (s.variance > 0 ? '#22c55e' : '#64748b');
            let vText = s.variance < 0 ? `Shortage: ${s.variance} Tk` : (s.variance > 0 ? `Overage: +${s.variance} Tk` : 'Perfectly Balanced');

            html += `
                <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; border-left: 4px solid ${vColor};">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                        <h4 style="margin:0; color:#0f172a; font-size: 1.1rem;">${(s.deskId || 'Unknown').replace('_',' ').toUpperCase()}</h4>
                        <span style="font-size:0.8rem; color:#64748b; font-weight: 600;">Closed by: ${s.closedBy || 'Unknown'}</span>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem; color: #475569; margin-bottom: 12px;">
                        <div>Morning Open: <strong style="color: #0f172a;">${s.openingBalances?.cash || 0} Tk</strong></div>
                        <div>Mid-Day Drop: <strong style="color: #0ea5e9;">${s.managerDrop || 0} Tk</strong></div>
                        <div>Expected Cash: <strong style="color: #10b981;">${s.expectedClosing?.cash || 0} Tk</strong></div>
                        <div>Actual Count: <strong style="color: #0f172a;">${s.actualClosing?.cash || 0} Tk</strong></div>
                    </div>
                    <div style="padding-top: 12px; border-top: 1px dashed #e2e8f0; font-weight: bold; font-size: 0.95rem; color: ${vColor}; text-align: center;">
                        ${vText}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch(e) { container.innerHTML = `<p style="color:#ef4444;">Error loading logs.</p>`; }
}

function fallbackCopy(text) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        showFlashMessage("Report Copied!");
    } catch (err) {
        showAppAlert("Error", "Could not copy report to clipboard.");
    }
}

function openDevNotes() {
    openModal('modal-dev-notes');
}

async function saveDevNotes() {
    if (!currentUser) return;
    const notes = document.getElementById('dev-notes-text').value;
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), { devNotes: notes }, { merge: true });
        showFlashMessage("Notes Saved!");
        closeModal('modal-dev-notes');
    } catch(e) {
        showAppAlert("Error", "Could not save notes. Please check your connection.");
    }
}

// ==========================================
//    NATIVE TOOLTIP ENGINE
// ==========================================
window.showTooltip = function(element, text) {
    // 1. Destroy any existing tooltips instantly so they don't pile up
    document.querySelectorAll('.mobile-tooltip').forEach(el => el.remove());
    
    // 2. Create the new bubble
    let tooltip = document.createElement('div');
    tooltip.className = 'mobile-tooltip';
    tooltip.innerText = text;
    document.body.appendChild(tooltip);
    
    // 3. Measure where the user tapped
    let rect = element.getBoundingClientRect();
    
    // 4. Center it directly above the item they tapped
    tooltip.style.left = (rect.left + (rect.width / 2)) + 'px';
    tooltip.style.top = (rect.top - 10) + 'px'; 
    
    // 5. Trigger the fluid CSS animation
    setTimeout(() => tooltip.classList.add('show'), 10);
    
    // 6. Auto-destroy after 2.5 seconds
    setTimeout(() => {
        tooltip.classList.remove('show');
        setTimeout(() => tooltip.remove(), 200); // Wait for fade-out before removing from DOM
    }, 2500);
};

// --- VITE EXPORTS ---
window.signInWithGoogle = signInWithGoogle; window.logout = logout; window.switchTab = switchTab;
window.openDevNotes = openDevNotes; window.saveDevNotes = saveDevNotes;
window.ersKeyPress = ersKeyPress; window.ersBackspace = ersBackspace; window.saveErs = saveErs;
window.toggleMFS = toggleMFS; window.openModal = openModal; window.closeModal = closeModal;
window.selectItem = selectItem; window.qtyKeyPress = qtyKeyPress; window.qtyBackspace = qtyBackspace;
window.saveQuantity = saveQuantity; window.openSettings = openSettings; window.removeRow = removeRow;
window.addNewItem = addNewItem; window.saveSettings = saveSettings; window.shareReport = shareReport;
window.fetchTransactionsForDate = fetchTransactionsForDate; window.filterAdminCatalog = filterAdminCatalog; window.toggleAddForm = toggleAddForm;
window.loadFloorMap = loadFloorMap; window.handleDeskSelect = handleDeskSelect; window.confirmOpenDesk = confirmOpenDesk;
window.initiateCloseDesk = initiateCloseDesk; window.processCloseDeskStep2 = processCloseDeskStep2; window.calculateRetained = calculateRetained;
window.finalizeCloseDesk = finalizeCloseDesk; 
window.openManagerCashModal = openManagerCashModal; window.saveManagerCash = saveManagerCash;
window.openMainStockModal = openMainStockModal; window.saveMainStock = saveMainStock;
window.openReturnStockModal = openReturnStockModal; window.saveReturnStock = saveReturnStock;
window.openDeskTransfer = openDeskTransfer; window.executeDeskTransfer = executeDeskTransfer;
window.renderLiveFloorTab = renderLiveFloorTab; window.openTransferModal = openTransferModal; window.executeTransfer = executeTransfer;
window.openEditTx = openEditTx; window.toggleEditSplitFields = toggleEditSplitFields; window.updateSplitTotal = updateSplitTotal; window.showAuditTrail = showAuditTrail;
window.saveTxEdit = saveTxEdit; window.deleteTransaction = deleteTransaction; window.openTrash = openTrash;
window.restoreTx = restoreTx; window.emptyTrash = emptyTrash; window.permanentlyDeleteTx = permanentlyDeleteTx;
window.addInventoryGroup = addInventoryGroup; window.removeInventoryGroup = removeInventoryGroup;
window.adminBypass = adminBypass; window.enterSandboxMode = enterSandboxMode; window.peekAtDesk = peekAtDesk; window.openMyDeskDashboard = openMyDeskDashboard;
window.resetMyDeskLock = resetMyDeskLock; window.forceCloseAllDesks = forceCloseAllDesks; window.nukeTodaysLedger = nukeTodaysLedger; window.fixPastManagerDrops = fixPastManagerDrops;
window.kickAgent = kickAgent; window.nukeAgent = nukeAgent;
window.openNicknameManager = openNicknameManager; window.saveAdminNickname = saveAdminNickname;
window.shareDeskReport = shareDeskReport;
window.exportLedgerCSV = exportLedgerCSV; window.openAuditModal = openAuditModal; window.fetchAuditLogs = fetchAuditLogs;
window.renderPersonalReport = renderPersonalReport; window.renderDeskDashboard = renderDeskDashboard;
window.toggleReportMode = toggleReportMode;