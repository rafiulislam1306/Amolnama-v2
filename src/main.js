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
                              () => window.location.reload(), 
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
                await updateDoc(doc(db, 'sessions', docSnap.id), {
                    status: 'closed', closedBy: 'System Auto-Close', closedByUid: 'system', closedAt: serverTimestamp(),
                    hasDiscrepancy: true, variance: 'Unknown - Auto Closed'
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
        let deskHTML = '';

        if (desksSnapshot.empty) {
            await setDoc(doc(db, 'desks', 'desk_1'), { name: 'Desk 1', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_2'), { name: 'Desk 2', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_3'), { name: 'Desk 3', status: 'closed', currentSessionId: null });
            loadFloorMap(); return;
        }

        desksSnapshot.forEach(docSnap => {
            const desk = docSnap.data();
            const isOpen = desk.status === 'open';
            const btnColor = isOpen ? '#10b981' : '#0ea5e9'; 
            const actionText = isOpen ? 'Join Active Desk' : 'Open Desk';

            deskHTML += `
                <div class="admin-form-card" style="margin-bottom: 0; padding: 16px; border-left: 4px solid ${btnColor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h3 style="margin: 0; font-size: 1.2rem; color: #0f172a;">${desk.name}</h3>
                        <span style="font-size: 0.8rem; font-weight: bold; color: ${btnColor}; background: ${isOpen ? '#d1fae5' : '#e0f2fe'}; padding: 4px 8px; border-radius: 12px;">
                            ${isOpen ? 'OPEN' : 'CLOSED'}
                        </span>
                    </div>
                    <button class="btn-primary-full" style="background: ${btnColor};" onclick="handleDeskSelect('${docSnap.id}', '${desk.name}', '${desk.status}', '${desk.currentSessionId}')">
                        ${actionText}
                    </button>
                </div>
            `;
        });
        
        if (currentUserRole === 'admin') {
            deskHTML += `
                <div style="margin-top: 32px; border-top: 1px dashed var(--border-color); padding-top: 16px;">
                    <span style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; text-align: center;">Admin & Developer Tools</span>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-outline" style="flex: 1; padding: 12px 8px; font-size: 0.85rem; font-weight: 600; border-color: var(--border-color); color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 6px; background: transparent; transition: all 0.2s;" onclick="adminBypass()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Global View
                        </button>
                        <button class="btn-outline" style="flex: 1; padding: 12px 8px; font-size: 0.85rem; font-weight: 600; border-color: var(--border-color); color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; gap: 6px; background: transparent; transition: all 0.2s;" onclick="enterSandboxMode()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d=\"M8.5 2h7\"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d=\"M5.52 16h12.96\"/></svg> Test Env
                        </button>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = deskHTML;
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
    let expectedInv = { ...(sessionData.openingBalances.inventory || {}) };

    const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', currentSessionId), where('isDeleted', '==', false)));

    txSnap.forEach(docSnap => {
        let tx = docSnap.data();
        expectedCash += (tx.cashAmt || 0); 
        
        let change = getInventoryChange(tx);
        if (change !== 0) {
            expectedInv[tx.trackAs] = (expectedInv[tx.trackAs] || 0) + change;
        }
    });

    expectedClosingStats = { cash: expectedCash, inventory: expectedInv };

    let invHTML = '';
    let itemsToCount = Object.keys(expectedInv);
    
    if(itemsToCount.length === 0) invHTML = '<p style="text-align:center;">No physical inventory tracked today.</p>';
    else {
        itemsToCount.forEach(itemName => {
            invHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <label class="admin-label" style="margin:0; font-size:0.85rem; color:#334155;">${itemName}</label>
                    <input type="number" class="settings-input actual-inv-input" data-name="${itemName}" style="width:80px; text-align:center; padding:8px; border-color:#cbd5e1;" placeholder="0">
                </div>
            `;
        });
    }

    const modalContent = `
        <h3 class="modal-title" style="color: #0f172a; margin-bottom: 4px;">Close ${currentDeskName}</h3>
        <p style="text-align: center; color: #64748b; font-size: 0.9rem; margin-bottom: 24px;">Step 1: Physical Reconciliation</p>
        <div class="admin-form-card" style="padding: 16px; margin-bottom: 16px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; margin-bottom: 8px;">Actual Cash in Drawer</label>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 1.5rem; font-weight: bold;">Tk</span>
                <input type="number" id="actual-cash-input" class="settings-input" style="font-size: 1.5rem; padding: 12px;" placeholder="0">
            </div>
        </div>
        <div class="admin-form-card" style="padding: 16px; margin-bottom: 24px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; margin-bottom: 16px;">Count Physical Inventory</label>
            ${invHTML}
        </div>
        <button class="btn-primary-full" onclick="processCloseDeskStep2()">NEXT STEP ➡️</button>
        <button class="modal-close" style="color: #ef4444;" onclick="closeModal('modal-close-desk')">Cancel</button>
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
        <h3 class="modal-title" style="color: #0f172a; margin-bottom: 4px;">Finalize Handover</h3>
        <p style="text-align: center; color: #64748b; font-size: 0.9rem; margin-bottom: 24px;">Step 2: Manager Drop & Close</p>
        ${warningHTML}
        <div class="admin-form-card" style="padding: 16px; margin-bottom: 24px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; margin-bottom: 8px;">Cash Drop to Manager</label>
            <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 12px;">How much of the <strong>${actualCash} Tk</strong> are you handing to the manager?</p>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 1.5rem; font-weight: bold;">Tk</span>
                <input type="number" id="manager-drop-input" class="settings-input" style="font-size: 1.5rem; padding: 12px;" placeholder="0" oninput="calculateRetained()">
            </div>
            <div style="margin-top: 16px; font-size: 0.95rem; color: #475569; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                Retained Drawer Float: <strong id="retained-float-display" style="color: #0ea5e9;">${actualCash} Tk</strong>
            </div>
        </div>
        <button class="btn-primary-full" style="background: ${variance < 0 ? '#ef4444' : '#0ea5e9'};" onclick="finalizeCloseDesk(${variance})">
            ${variance < 0 ? 'FORCE CLOSE & LOG SHORTAGE' : 'CONFIRM & CLOSE DESK'}
        </button>
        <button class="modal-close" style="color: #64748b;" onclick="initiateCloseDesk()">Go Back to Edit Counts</button>
    `;
    document.getElementById('close-desk-content').innerHTML = modalContent;
}

function calculateRetained() {
    let drop = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let retained = actualClosingStats.cash - drop;
    let maxAllowedDrop = Math.min(actualClosingStats.cash, expectedClosingStats.cash);
    
    let displayEl = document.getElementById('retained-float-display');
    if (drop > maxAllowedDrop) displayEl.innerHTML = `<span style="color: #ef4444;">Error: Exceeds System Total</span>`;
    else displayEl.innerText = retained + " Tk";
}

async function finalizeCloseDesk(variance) {
    let dropAmount = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let maxAllowedDrop = Math.min(actualClosingStats.cash, expectedClosingStats.cash);

    if (dropAmount < 0 || dropAmount > maxAllowedDrop) { showAppAlert("Error", `You cannot drop more than ${maxAllowedDrop} Tk.`); return; }

    let retainedFloat = actualClosingStats.cash - dropAmount;
    actualClosingStats.inventory = { ...actualClosingStats.inventory }; 

    try {
        await updateDoc(doc(db, 'sessions', currentSessionId), {
            closedBy: userNickname || userDisplayName, closedByUid: currentUser.uid, closedAt: serverTimestamp(), status: 'closed',
            expectedClosing: expectedClosingStats, actualClosing: actualClosingStats, variance: variance,
            hasDiscrepancy: variance !== 0, managerDrop: dropAmount, retainedFloat: retainedFloat
        });
        await setDoc(doc(db, 'desks', currentDeskId), { status: 'closed', currentSessionId: null }, { merge: true });

        currentDeskId = null; currentSessionId = null; currentDeskName = '';
        closeModal('modal-close-desk');
        showFlashMessage("Desk Successfully Closed!");
        
        await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
        loadFloorMap(); 
    } catch (e) { showAppAlert("Offline", "Could not close desk right now. Queued for sync."); }
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
        id: Date.now(), type: 'adjustment', name: 'Physical Cash', trackAs: 'Physical Cash', amount: amount, qty: 1,
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
        id: Date.now(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty,
        payment: 'Received from Main Stock', cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName
    };

    closeModal('modal-main-stock');
    let msg = `+${qty}x ${itemName} Added!`;
    
    addDoc(collection(db, 'transactions'), tx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? msg : "Offline: Stock queued");
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
                optionsHTML += `<option value="${deskData.deskId}|${docSnap.id}">${deskData.deskId.replace('_', ' ').toUpperCase()}</option>`;
            }
        });
        targetSelect.innerHTML = optionsHTML || '<option value="">No other desks open</option>';
    } catch(e) { targetSelect.innerHTML = '<option value="">Offline: Cannot fetch desks</option>'; }
}

function executeDeskTransfer() {
    let qty = parseInt(document.getElementById('desk-transfer-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter valid quantity."); return; }

    let itemName = document.getElementById('desk-transfer-item').value;
    
    if (!passStockFirewall(itemName, qty)) return;

    let targetVal = document.getElementById('desk-transfer-target').value;
    if (!targetVal) { showAppAlert("Error", "Please select an active destination desk."); return; }
    
    let [targetDeskId, targetSessionId] = targetVal.split('|');
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    const senderTx = { id: Date.now(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetDeskId}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName };
    const receiverTx = { id: Date.now() + 1, type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${currentDeskId}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetDeskId, sessionId: targetSessionId, agentId: "system", agentName: `Transfer from ${userNickname || userDisplayName}` };

    closeModal('modal-desk-transfer');
    let msg = `Sent ${qty}x ${itemName} to ${targetDeskId.replace('_', ' ').toUpperCase()}!`;
    
    addDoc(collection(db, 'transactions'), senderTx).catch(e => console.error(e));
    addDoc(collection(db, 'transactions'), receiverTx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? msg : "Offline: Transfer queued");
}

let targetTransferDeskId = null; let targetTransferSessionId = null;
function openTransferModal(targetDesk, targetSession) {
    targetTransferDeskId = targetDesk; targetTransferSessionId = targetSession;
    document.getElementById('transfer-target-name').innerText = targetDesk.replace('_', ' ').toUpperCase();
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

    const senderTx = { id: Date.now(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetTransferDeskId}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: currentDeskId || "Admin", sessionId: currentSessionId || "Admin", agentId: currentUser.uid, agentName: userNickname || userDisplayName };
    const receiverTx = { id: Date.now() + 1, type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${currentDeskId || "Admin"}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetTransferDeskId, sessionId: targetTransferSessionId, agentId: "system", agentName: `Transfer from ${userNickname || userDisplayName}` };

    closeModal('modal-transfer');
    
    addDoc(collection(db, 'transactions'), senderTx).catch(e => console.error(e));
    addDoc(collection(db, 'transactions'), receiverTx).catch(e => console.error(e));
    showFlashMessage(navigator.onLine ? "Transfer Successful!" : "Offline: Queued for sync.");
}

// --- RENDER FLOOR MAP & PEEK AT DESK ---
async function renderLiveFloorTab() {
    const container = document.getElementById('live-floor-container');
    container.innerHTML = '<div class="spinner" style="align-self: center; margin-top: 40px;"></div>';

    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        if (activeSessionsSnap.empty) { container.innerHTML = '<p class="placeholder-text">No desks open.</p>'; return; }

        let floorHTML = '';
        for (const docSnap of activeSessionsSnap.docs) {
            const session = docSnap.data(); const sid = docSnap.id;
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', sid), where('isDeleted', '==', false)));

            let liveCash = parseFloat(session.openingBalances.cash) || 0;
            let liveInv = { ...(session.openingBalances.inventory || {}) };

            txSnap.forEach(txDoc => {
                let tx = txDoc.data();
                liveCash += (tx.cashAmt || 0);
                
                let change = getInventoryChange(tx);
                if (change !== 0) {
                    liveInv[tx.trackAs] = (liveInv[tx.trackAs] || 0) + change;
                }
            });

            let invDisplay = '';
            for (const [name, qty] of Object.entries(liveInv)) {
                if (qty !== 0) {
                    let color = qty < 3 ? '#ef4444' : '#475569';
                    invDisplay += `<span style="display:inline-block; background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin:2px; color:${color}; font-weight:600;">${name}: ${qty}</span>`;
                }
            }
            if(!invDisplay) invDisplay = '<span style="font-size:0.8rem; color:#94a3b8;">No physical stock.</span>';

            const isMyDesk = sid === currentSessionId;
            const badge = isMyDesk ? '<span style="background:#0ea5e9; color:white; font-size:0.7rem; padding:2px 6px; border-radius:12px; font-weight:bold; margin-left: 8px;">YOUR DESK</span>' : '';

            let actionBtn = isMyDesk 
                ? `<button class="btn-primary-full" style="width: 100%; background: #0ea5e9; padding: 10px; margin-top: 12px;" onclick="openMyDeskDashboard()">Open My Drawer</button>`
                : `<button class="btn-outline" style="width: 100%; color: #8b5cf6; border-color: #8b5cf6; background: transparent; padding: 10px; margin-top: 12px;" onclick="peekAtDesk('${session.deskId}', '${session.deskId.replace('_', ' ').toUpperCase()}')">View Details</button>`;

            let agentNamesStr = 'Loading...';
            try {
                const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', session.deskId)));
                let names = [];
                agentsSnap.forEach(aDoc => { names.push(aDoc.data().nickname || aDoc.data().displayName || aDoc.data().email?.split('@')[0] || 'Agent'); });
                agentNamesStr = names.length > 0 ? names.join(', ') : 'Empty';
            } catch(e) { agentNamesStr = 'Unknown'; }

            floorHTML += `
                <div class="admin-form-card" style="margin-bottom: 0; padding: 16px; border-top: 4px solid ${isMyDesk ? '#0ea5e9' : '#8b5cf6'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                        <h4 style="margin: 0; color: var(--text-primary); font-size: 1.1rem; display: flex; align-items: center;">
                            ${session.deskId.replace('_', ' ').toUpperCase()} ${badge}
                        </h4>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; text-align: right; max-width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${agentNamesStr}
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 0.85rem; font-weight: bold; color: var(--text-secondary);">Live Cash:</span>
                        <span style="font-size: 1.1rem; font-weight: bold; color: #10b981;">${liveCash} Tk</span>
                    </div>

                    <div style="margin-bottom: 16px; padding-top: 12px; border-top: 1px dashed var(--border-color);">
                        <span style="display: block; font-size: 0.8rem; font-weight: bold; color: var(--text-secondary); margin-bottom: 6px;">Remaining Physical Stock:</span>
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

    closeModal('modal-edit-tx');
    
    if (currentDeskId === 'sandbox') {
        tx.qty = newQty; tx.amount = newAmount; tx.payment = method === 'Split' ? 'Split' : method; tx.cashAmt = finalCash; tx.mfsAmt = finalMfs; tx.isEdited = true;
        renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
        showFlashMessage("Sandbox Transaction Updated!"); return;
    }

    if (tx.docId) {
        let msg = `${tx.name} Updated!`;
        updateDoc(doc(db, 'transactions', tx.docId), { qty: newQty, amount: newAmount, payment: method === 'Split' ? 'Split' : method, cashAmt: finalCash, mfsAmt: finalMfs, isEdited: true }).catch(e => console.error(e));
        showFlashMessage(navigator.onLine ? msg : "Offline: Edit queued");
    }
}

function deleteTransaction(docId, localId) {
    showAppAlert("Delete Item", "Are you sure you want to move this transaction to the trash?", true, () => {
        if (currentDeskId === 'sandbox') {
            let tx = transactions.find(t => t.id === localId);
            if(tx) { 
                tx.isDeleted = true; 
                trashTransactions.push(tx); 
                renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
                showFlashMessage("Moved to Sandbox Trash!"); 
            }
            return;
        }

        if(docId) {
            updateDoc(doc(db, 'transactions', docId), { isDeleted: true }).catch(e => console.error(e));
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
    if (currentDeskId === 'sandbox') {
        let txIndex = trashTransactions.findIndex(t => t.id === localId);
        if (txIndex > -1) {
            let tx = trashTransactions[txIndex];
            if (!passStockFirewall(tx.name, tx.qty)) return;
            tx.isDeleted = false; tx.isRestored = true;
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

            updateDoc(doc(db, 'transactions', docId), { isDeleted: false, isRestored: true }).catch(e => console.error(e));
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
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
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
        let containerId = "", isModal = false;
        
        if (item.cat === 'new-sim') { containerId = 'container-new-sim'; isModal = true; }
        else if (item.cat === 'paid-rep') { containerId = 'container-paid-rep'; isModal = true; }
        else if (item.cat === 'foc') { containerId = 'container-foc'; isModal = true; }
        else if (item.cat === 'service') containerId = 'container-services';
        else if (item.cat === 'free-action') containerId = 'container-free-actions';

        let container = document.getElementById(containerId);
        if (!container) return;

        let btn = document.createElement('button');
        btn.className = (isModal ? 'modal-item' : 'action-btn') + ' dynamic-item';
        
        let pressTimer;
        let isLongPress = false;
        let isCancelled = false;

        const startPress = (e) => {
            if (e.button && e.button !== 0) return; 
            isLongPress = false;
            isCancelled = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                if (navigator.vibrate) navigator.vibrate([50]); 
                selectItem(item.name, safePrice); 
            }, 500); 
        };

        const cancelPress = () => {
            isCancelled = true;
            clearTimeout(pressTimer);
        };

        const endPress = (e) => {
            clearTimeout(pressTimer);
            if (!isLongPress && !isCancelled) {
                instantSaveItem(item.name, safePrice);
            }
        };

        btn.addEventListener('pointerdown', startPress);
        btn.addEventListener('pointerup', endPress);
        btn.addEventListener('pointerleave', cancelPress);
        btn.addEventListener('pointercancel', cancelPress);
        btn.oncontextmenu = (e) => { e.preventDefault(); return false; };
        
        if (isModal) {
            btn.className = 'list-menu-item dynamic-item';
            let priceDisplay = safePrice > 0 ? `${safePrice} ${userCurrency}` : 'Free';
            let priceColorStyle = safePrice === 0 ? 'color: #10b981;' : ''; 

            btn.innerHTML = `
                <div class="list-item-content">
                    <span class="list-item-title">${item.display || item.name}</span>
                    <span class="list-item-price" style="${priceColorStyle}">${priceDisplay}</span>
                </div>
                <svg class="list-item-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            `;
            container.appendChild(btn); 
        } else {
            btn.innerText = item.display || item.name;
            container.appendChild(btn);
        }
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
        if (currentUser.photoURL) {
            document.getElementById('report-user-photo').src = currentUser.photoURL;
            document.getElementById('header-user-photo').src = currentUser.photoURL;
        }
        if(document.getElementById('tab-ers').classList.contains('active')) document.getElementById('header-title').innerText = userNickname || userDisplayName;

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
}

function addTransactionToCloud(type, name, amount, qty, payment, cashAmt = 0, mfsAmt = 0) {
    if(!currentUser) return;
    if (payment === 'Cash') { cashAmt = amount; mfsAmt = 0; }
    if (payment === 'MFS') { cashAmt = 0; mfsAmt = amount; }

    let catItem = Object.values(globalCatalog).find(c => c.name === name);
    let trackAs = catItem ? (catItem.trackAs || name) : name; 

    const tx = {
        id: Date.now(), type: type, name: name, trackAs: trackAs, amount: amount, qty: qty,
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
//     ENGINE A: PERSONAL REPORT LOGIC
// ==========================================
function renderPersonalReport() {
    let myCash = 0, myMfs = 0, myErs = 0;
    let myItemsSold = {}; let historyHTML = '';

    [...transactions].reverse().forEach(tx => {
        if (tx.agentId !== currentUser.uid) return; 

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        
        if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            myCash += safeCashAmt; myMfs += safeMfsAmt;
            if (tx.name === 'ERS Flexiload') myErs += tx.amount;
            else if (tx.name !== 'Physical Cash') {
                myItemsSold[tx.name] = (myItemsSold[tx.name] || 0) + Math.abs(tx.qty); 
            }
        }
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Pending</span>';
        if (tx.isEdited) badges += '<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Edited</span>';
        if (tx.isRestored) badges += '<span style="font-size: 0.7rem; background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Restored</span>';

        historyHTML += `
            <div class="history-item">
                <div class="history-info">
                    <div style="display: flex; align-items: center;"><span class="history-title">${tx.qty}x ${tx.name}</span>${badges}</div>
                    <span class="history-meta">${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="delete-btn" style="color: var(--accent-color); opacity: 0.8;" onclick="openEditTx(${tx.id})">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                    </button>
                    <button class="delete-btn" style="opacity: 0.8;" onclick="deleteTransaction('${tx.docId}', ${tx.id})">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    });

    if(document.getElementById('tot-cash-sales')) document.getElementById('tot-cash-sales').innerText = myCash + ' ' + userCurrency;
    if(document.getElementById('tot-mfs')) document.getElementById('tot-mfs').innerText = myMfs + ' ' + userCurrency;
    if(document.getElementById('tot-ers')) document.getElementById('tot-ers').innerText = myErs + ' ' + userCurrency;
    if(document.getElementById('report-total-all')) document.getElementById('report-total-all').innerText = (myCash + myMfs) + ' ' + userCurrency;

    let invHTML = '';
    for (const [name, qty] of Object.entries(myItemsSold)) invHTML += `<div class="report-row"><span>${name}:</span> <span class="report-total">${qty}</span></div>`;
    document.getElementById('inventory-list').innerHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic;">No items sold yet</div>';
    
    document.getElementById('history-log').innerHTML = historyHTML || '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><p>No transactions today</p></div>';
}

function shareReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let totalRevenue = document.getElementById('report-total-all') ? document.getElementById('report-total-all').innerText : "0 Tk";
    let totalMfs = document.getElementById('tot-mfs').innerText;
    let totalCash = document.getElementById('tot-cash-sales').innerText;
    let totalErs = document.getElementById('tot-ers').innerText;
    
    let reportText = `My Daily Report: ${dateStr}\nAgent: ${userNickname || userDisplayName}\n\nPERSONAL SALES SUMMARY\nTotal Revenue: ${totalRevenue}\nCash Collected: ${totalCash}\nMFS Collected: ${totalMfs}\n\nERS Disbursed: ${totalErs}\n\nMY ITEMS & SERVICES SOLD\n`;
    
    let inventoryCounts = {}; let hasItems = false;
    transactions.forEach(tx => {
        if (tx.agentId === currentUser.uid && tx.name !== 'ERS Flexiload' && tx.type !== 'adjustment' && tx.type !== 'transfer_in' && tx.type !== 'transfer_out' && tx.name !== 'Physical Cash') { 
            inventoryCounts[tx.name] = (inventoryCounts[tx.name] || 0) + Math.abs(tx.qty); 
            hasItems = true; 
        }
    });

    if (!hasItems) reportText += `None\n`;
    else for (const [name, qty] of Object.entries(inventoryCounts)) reportText += `${qty}x ${name}\n`;

    if (navigator.share) navigator.share({ title: 'My Daily Report', text: reportText }).catch(e => console.log(e));
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

    let reportText = `Desk Report: ${dateStr}\n${deskTitle}\nAgents: ${activeAgents}\n\nDRAWER SUMMARY\nOpening Balance: ${opening}\nCash Sales: ${cashSales}\nManager Drops: ${mgrDrop}\n------------------------\nExpected Drawer Cash: ${expected}\n\nDESK ITEMS & SERVICES SOLD\n`;

    let inventoryList = document.getElementById('desk-inventory-list');
    if (inventoryList.innerText.includes('No items')) {
        reportText += 'None\n';
    } else {
        let inventoryRows = inventoryList.querySelectorAll('.report-row');
        inventoryRows.forEach(row => {
            let spans = row.querySelectorAll('span');
            if (spans.length >= 2) {
                reportText += `${spans[0].innerText} ${spans[1].innerText}\n`;
            }
        });
    }

    if (navigator.share) navigator.share({ title: 'Desk Report', text: reportText }).catch(e => console.log(e));
    else { try { navigator.clipboard.writeText(reportText).then(() => showFlashMessage("Desk Report Copied!")).catch(() => fallbackCopy(reportText)); } catch (e) { fallbackCopy(reportText); } }
}

// ==========================================
//     ENGINE B: DESK DASHBOARD LOGIC
// ==========================================
async function renderDeskDashboard(targetDeskId = currentDeskId) {
    if (!targetDeskId) return;

    let deskCashSales = 0, mgrDropRcv = 0;
    let deskItemsSold = {}; 
    let deskErsCount = 0, deskErsTotal = 0; 
    let historyHTML = '';
    let deskOpeningCash = 0;
    let activeSessionId = null;

    const targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
    const isToday = targetDateStr === getStrictDate();

    if (targetDeskId === currentDeskId && isToday && currentSessionId) {
        activeSessionId = currentSessionId;
        deskOpeningCash = currentOpeningCash; 
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
                }
            }
        } catch(e) { console.error(e); }
    }

    [...transactions].reverse().forEach(tx => {
        if (tx.sessionId !== activeSessionId) return;

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0); 
        
        if (tx.type === 'adjustment' && tx.name === 'Physical Cash') {
            mgrDropRcv += safeCashAmt; 
        } else if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            deskCashSales += safeCashAmt; 
            
            if (tx.name === 'ERS Flexiload') {
                deskErsCount += Math.abs(tx.qty);
                deskErsTotal += tx.amount;
            } else if (tx.name !== 'Physical Cash') {
                deskItemsSold[tx.name] = (deskItemsSold[tx.name] || 0) + Math.abs(tx.qty);
            }
        }
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Pending</span>';
        if (tx.isEdited) badges += '<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Edited</span>';
        if (tx.isRestored) badges += '<span style="font-size: 0.7rem; background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Restored</span>';
        
        let agentBadge = `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">${tx.agentName.split(' ')[0]}</span>`;

        historyHTML += `
            <div class="history-item">
                <div class="history-info">
                    <div style="display: flex; align-items: center;"><span class="history-title">${tx.qty}x ${tx.name}</span>${agentBadge}${badges}</div>
                    <span class="history-meta">${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                </div>
            </div>
        `;
    });

    if(document.getElementById('desk-tot-opening')) document.getElementById('desk-tot-opening').innerText = deskOpeningCash + ' ' + userCurrency;
    if(document.getElementById('desk-tot-cash-sales')) document.getElementById('desk-tot-cash-sales').innerText = deskCashSales + ' ' + userCurrency;
    if(document.getElementById('desk-tot-manager')) document.getElementById('desk-tot-manager').innerText = mgrDropRcv + ' ' + userCurrency;
    if(document.getElementById('desk-tot-expected-cash')) document.getElementById('desk-tot-expected-cash').innerText = (deskOpeningCash + deskCashSales + mgrDropRcv) + ' ' + userCurrency;

    let invHTML = '';
    
    if (deskErsCount > 0) {
        invHTML += `<div class="report-row" style="color: var(--accent-color); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 8px;">
                        <span>ERS Disbursed (${deskErsCount}x):</span> 
                        <span class="report-total">${deskErsTotal} Tk</span>
                    </div>`;
    }

    for (const [name, qty] of Object.entries(deskItemsSold)) {
        invHTML += `<div class="report-row"><span>${name}:</span> <span class="report-total">${qty}</span></div>`;
    }
    
    let titleEl = document.getElementById('desk-inventory-title');
    if(titleEl) titleEl.innerText = "Desk Items & Services Sold";

    document.getElementById('desk-inventory-list').innerHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic;">No items sold yet</div>';
    
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

// --- VITE EXPORTS ---
window.signInWithGoogle = signInWithGoogle; window.logout = logout; window.switchTab = switchTab;
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
window.openDeskTransfer = openDeskTransfer; window.executeDeskTransfer = executeDeskTransfer;
window.renderLiveFloorTab = renderLiveFloorTab; window.openTransferModal = openTransferModal; window.executeTransfer = executeTransfer;
window.openEditTx = openEditTx; window.toggleEditSplitFields = toggleEditSplitFields; window.updateSplitTotal = updateSplitTotal;
window.saveTxEdit = saveTxEdit; window.deleteTransaction = deleteTransaction; window.openTrash = openTrash;
window.restoreTx = restoreTx; window.emptyTrash = emptyTrash; window.permanentlyDeleteTx = permanentlyDeleteTx;
window.addInventoryGroup = addInventoryGroup; window.removeInventoryGroup = removeInventoryGroup;
window.adminBypass = adminBypass; window.enterSandboxMode = enterSandboxMode; window.peekAtDesk = peekAtDesk; window.openMyDeskDashboard = openMyDeskDashboard;
window.resetMyDeskLock = resetMyDeskLock; window.forceCloseAllDesks = forceCloseAllDesks; window.nukeTodaysLedger = nukeTodaysLedger; window.fixPastManagerDrops = fixPastManagerDrops;
window.kickAgent = kickAgent; window.nukeAgent = nukeAgent;
window.openNicknameManager = openNicknameManager; window.saveAdminNickname = saveAdminNickname;
window.shareDeskReport = shareDeskReport;
window.exportLedgerCSV = exportLedgerCSV; window.openAuditModal = openAuditModal; window.fetchAuditLogs = fetchAuditLogs;