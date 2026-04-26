// ==========================================
//    0. SERVICE WORKER FOR PWA INSTALL
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .then(reg => console.log('Service Worker registered:', reg))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

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
let userNickname = ''; // Centralized nickname tracking
let currentUserRole = 'user';

// --- STRICT DATE FORMATTER ---
function getStrictDate() { 
    const t = new Date(); 
    return `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`; 
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
        alert(`⚠️ TRANSACTION BLOCKED\n\nNot enough physical stock!\n\nYou only have ${available}x ${trackAs} available in your drawer.`);
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
    "sim_no1": { name: '📱 No. 1 Plan', display: 'No. 1 Plan', price: 497, cat: 'new-sim', trackAs: 'No. 1 Plan', isActive: true, order: 1 },
    "sim_prime": { name: '📱 Prime', display: 'Prime', price: 400, cat: 'new-sim', trackAs: 'Prime', isActive: true, order: 2 },
    "sim_djuice": { name: '📱 Djuice', display: 'Djuice', price: 400, cat: 'new-sim', trackAs: 'Djuice', isActive: true, order: 3 },
    "sim_skitto": { name: '📱 Skitto', display: 'Skitto', price: 400, cat: 'new-sim', trackAs: 'Skitto Kit', isActive: true, order: 4 },
    "sim_esim_pre": { name: '📱 eSIM Prepaid', display: 'eSIM Prepaid', price: 400, cat: 'new-sim', trackAs: 'eSIM', isActive: true, order: 5 },
    "sim_esim_post": { name: '📱 eSIM Postpaid', display: 'eSIM Postpaid', price: 400, cat: 'new-sim', trackAs: 'eSIM', isActive: true, order: 6 },
    "sim_power": { name: '📱 Power Prime', display: 'Power Prime', price: 1499, cat: 'new-sim', trackAs: 'Power Prime', isActive: true, order: 7 },
    "sim_recycle": { name: '📱 Recycle SIM', display: 'Recycle SIM', price: 400, cat: 'new-sim', trackAs: 'Recycle SIM', isActive: true, order: 8 },
    "sim_my": { name: '📱 My SIM', display: 'My SIM', price: 400, cat: 'new-sim', trackAs: 'Regular Kit', isActive: true, order: 9 },
    "rep_regular": { name: '🔄 Regular Replacement', display: 'Regular', price: 400, cat: 'paid-rep', trackAs: 'Regular Kit', isActive: true, order: 10 },
    "rep_skitto": { name: '🔄 Skitto Replacement', display: 'Skitto', price: 400, cat: 'paid-rep', trackAs: 'Skitto Kit', isActive: true, order: 11 },
    "rep_esim": { name: '🔄 eSIM Replacement', display: 'eSIM', price: 349, cat: 'paid-rep', trackAs: 'eSIM', isActive: true, order: 12 },
    "rep_skitto_esim": { name: '🔄 Skitto eSIM Replacement', display: 'Skitto eSIM', price: 349, cat: 'paid-rep', trackAs: 'Skitto eSIM', isActive: true, order: 13 },
    "foc_regular": { name: '🆓 FOC Regular', display: 'Regular', price: 0, cat: 'foc', trackAs: 'Regular Kit', isActive: true, order: 14 },
    "foc_skitto": { name: '🆓 FOC Skitto', display: 'Skitto', price: 0, cat: 'foc', trackAs: 'Skitto Kit', isActive: true, order: 15 },
    "foc_esim": { name: '🆓 FOC eSIM', display: 'eSIM', price: 0, cat: 'foc', trackAs: 'eSIM', isActive: true, order: 16 },
    "foc_skitto_esim": { name: '🆓 FOC Skitto eSIM', display: 'Skitto eSIM', price: 0, cat: 'foc', trackAs: 'Skitto eSIM', isActive: true, order: 17 },
    "srv_recycle": { name: '🛠️ Recycle SIM Reissue', display: 'Recycle SIM Reissue', price: 115, cat: 'service', trackAs: '', isActive: true, order: 18 },
    "srv_itemized": { name: '🛠️ Itemized Bill', display: 'Itemized Bill', price: 230, cat: 'service', trackAs: '', isActive: true, order: 19 },
    "srv_owner": { name: '🛠️ Ownership Transfer', display: 'Ownership Transfer', price: 115, cat: 'service', trackAs: '', isActive: true, order: 20 },
    "srv_mnp": { name: '🛠️ MNP', display: 'MNP', price: 457.50, cat: 'service', trackAs: '', isActive: true, order: 21 },
    "foc_corp": { name: '🏢 Corporate Replacement', display: 'Corporate Replacement', price: 0, cat: 'free-action', trackAs: '', isActive: true, order: 22 }
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
    } catch(e) {}
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
            const actionText = isOpen ? '🤝 Join Active Desk' : '🔑 Open Desk';

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
                <button class="btn-outline" style="margin-top: 24px; width: 100%; justify-content: center; color: #64748b; border-color: #cbd5e1; padding: 12px; font-weight: bold;" onclick="adminBypass()">
                    🛡️ Admin Bypass (Global View)
                </button>
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

async function handleDeskSelect(deskId, deskName, status, sessionId) {
    currentDeskId = deskId;
    currentDeskName = deskName;

    if (status === 'open' && sessionId) {
        currentSessionId = sessionId;
        const todayStr = getStrictDate();
        try { await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: currentDeskId, assignedDate: todayStr }, { merge: true }); } catch(e) {}

        document.getElementById('modal-desk-select').classList.remove('active');
        document.getElementById('header-title').innerText = `${deskName}`;
        
        try {
            const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
            if (sessionSnap.exists() && sessionSnap.data().openingBalances) {
                currentOpeningCash = parseFloat(sessionSnap.data().openingBalances.cash) || 0;
                currentOpeningInv = sessionSnap.data().openingBalances.inventory || {}; 
            }
        } catch(e) {}

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
        } catch (e) {}

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
    if (isNaN(floatAmount) || floatAmount < 0) return alert("You must enter the exact physical cash float provided by the manager.");

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
            alert("⚠️ STOP! This desk is already open. Another agent may have just opened it.");
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

    } catch (e) { alert("System Error: " + e.message); } 
    finally { isProcessingDesk = false; }
}


// ==========================================
//    CLOSE DESK & RECONCILIATION
// ==========================================
let expectedClosingStats = { cash: 0, inventory: {} };
let actualClosingStats = { cash: 0, inventory: {} };

async function initiateCloseDesk() {
    if (!currentSessionId) { alert("You are not assigned to an open desk."); return; }

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
    if (isNaN(actualCash) || actualCash < 0) { alert("Please enter the total physical cash."); return; }

    actualClosingStats.cash = actualCash;
    actualClosingStats.inventory = {};

    document.querySelectorAll('.actual-inv-input').forEach(input => {
        let itemName = input.getAttribute('data-name');
        actualClosingStats.inventory[itemName] = parseInt(input.value) || 0;
    });

    let variance = actualCash - expectedClosingStats.cash;
    let warningHTML = '';
    if (variance < 0) warningHTML = `<div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 12px; padding: 16px; margin-bottom: 24px;"><h4 style="color: #b91c1c; margin-bottom: 8px;">⚠️ SHORTAGE DETECTED</h4><p style="color: #991b1b; font-size: 0.95rem; margin-bottom: 0;">You are short <strong>${Math.abs(variance)} Tk</strong>. Expected: ${expectedClosingStats.cash} Tk.</p></div>`;
    else if (variance > 0) warningHTML = `<div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 16px; margin-bottom: 24px;"><h4 style="color: #15803d; margin-bottom: 8px;">✅ OVERAGE DETECTED</h4><p style="color: #166534; font-size: 0.95rem; margin-bottom: 0;">You have an overage of <strong>+${variance} Tk</strong>. Expected: ${expectedClosingStats.cash} Tk.</p></div>`;
    else warningHTML = `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;"><h4 style="color: #0ea5e9; margin-bottom: 0;">⚖️ DRAWER IS PERFECTLY BALANCED</h4></div>`;

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
            ${variance < 0 ? '🚨 FORCE CLOSE & LOG SHORTAGE' : '🔒 CONFIRM & CLOSE DESK'}
        </button>
        <button class="modal-close" style="color: #64748b;" onclick="initiateCloseDesk()">⬅️ Go Back to Edit Counts</button>
    `;
    document.getElementById('close-desk-content').innerHTML = modalContent;
}

function calculateRetained() {
    let drop = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let retained = actualClosingStats.cash - drop;
    let maxAllowedDrop = Math.min(actualClosingStats.cash, expectedClosingStats.cash);
    
    let displayEl = document.getElementById('retained-float-display');
    if (drop > maxAllowedDrop) displayEl.innerHTML = `<span style="color: #ef4444;">❌ Error: Exceeds System Total</span>`;
    else displayEl.innerText = retained + " Tk";
}

async function finalizeCloseDesk(variance) {
    let dropAmount = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let maxAllowedDrop = Math.min(actualClosingStats.cash, expectedClosingStats.cash);

    if (dropAmount < 0 || dropAmount > maxAllowedDrop) return alert(`Error: You cannot drop more than ${maxAllowedDrop} Tk.`);

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
    } catch (e) { alert("Offline: Could not close desk."); }
}

// ==========================================
//    PHASE 3: DESK ACTIONS & TRANSFERS
// ==========================================

function openManagerCashModal() {
    if(!currentSessionId) return alert("Desk not open.");
    document.getElementById('mgr-cash-amount').value = '';
    openModal('modal-manager-cash');
}

async function saveManagerCash() {
    let amount = parseFloat(document.getElementById('mgr-cash-amount').value) || 0;
    if (amount <= 0) return alert("Enter a valid amount.");
    let action = document.getElementById('mgr-cash-action').value; 
    let finalValue = action === 'receive' ? amount : -amount;
    let paymentLabel = action === 'receive' ? 'Received from Manager' : 'Dropped to Manager';

    const tx = {
        id: Date.now(), type: 'adjustment', name: 'Physical Cash', trackAs: 'Physical Cash', amount: 0, qty: 0,
        payment: paymentLabel, cashAmt: finalValue, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName
    };

    closeModal('modal-manager-cash');
    try { await addDoc(collection(db, 'transactions'), tx); showFlashMessage("Cash Logged!"); } 
    catch(e) { showFlashMessage("Offline: Queued for sync."); }
}

function openMainStockModal() {
    if(!currentSessionId) return alert("Desk not open.");
    document.getElementById('main-stock-qty').value = '';
    let selectEl = document.getElementById('main-stock-item');
    selectEl.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        selectEl.appendChild(opt);
    });
    openModal('modal-main-stock');
}

async function saveMainStock() {
    let qty = parseInt(document.getElementById('main-stock-qty').value) || 0;
    if (qty <= 0) return alert("Enter a valid quantity.");
    let itemName = document.getElementById('main-stock-item').value;

    const tx = {
        id: Date.now(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty,
        payment: 'Received from Main Stock', cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName
    };

    closeModal('modal-main-stock');
    try { await addDoc(collection(db, 'transactions'), tx); showFlashMessage("Stock Added to Drawer!"); } 
    catch(e) { showFlashMessage("Offline: Queued for sync."); }
}

async function openDeskTransfer() {
    if(!currentSessionId) return alert("Desk not open.");
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

async function executeDeskTransfer() {
    let qty = parseInt(document.getElementById('desk-transfer-qty').value) || 0;
    if (qty <= 0) return alert("Enter valid quantity.");

    let itemName = document.getElementById('desk-transfer-item').value;
    
    if (!passStockFirewall(itemName, qty)) return;

    let targetVal = document.getElementById('desk-transfer-target').value;
    if (!targetVal) return alert("Please select an active destination desk.");
    
    let [targetDeskId, targetSessionId] = targetVal.split('|');
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    const senderTx = { id: Date.now(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetDeskId}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: currentDeskId, sessionId: currentSessionId, agentId: currentUser.uid, agentName: userNickname || userDisplayName };
    const receiverTx = { id: Date.now() + 1, type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${currentDeskId}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetDeskId, sessionId: targetSessionId, agentId: "system", agentName: `Transfer from ${userNickname || userDisplayName}` };

    closeModal('modal-desk-transfer');
    try {
        await addDoc(collection(db, 'transactions'), senderTx);
        await addDoc(collection(db, 'transactions'), receiverTx);
        showFlashMessage("Transfer Successful!");
    } catch(e) { showFlashMessage("Offline: Queued for sync."); }
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

async function executeTransfer() {
    let qty = parseInt(document.getElementById('transfer-qty').value) || 0;
    if (qty <= 0) return alert("Enter valid quantity.");
    let itemName = document.getElementById('transfer-item-select').value;
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    const senderTx = { id: Date.now(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetTransferDeskId}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: currentDeskId || "Admin", sessionId: currentSessionId || "Admin", agentId: currentUser.uid, agentName: userNickname || userDisplayName };
    const receiverTx = { id: Date.now() + 1, type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${currentDeskId || "Admin"}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetTransferDeskId, sessionId: targetTransferSessionId, agentId: "system", agentName: `Transfer from ${userNickname || userDisplayName}` };

    closeModal('modal-transfer');
    try {
        await addDoc(collection(db, 'transactions'), senderTx);
        await addDoc(collection(db, 'transactions'), receiverTx);
        showFlashMessage("Transfer Successful!");
    } catch(e) { showFlashMessage("Offline: Queued for sync."); }
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
            const badge = isMyDesk ? '<span style="background:#0ea5e9; color:white; font-size:0.7rem; padding:2px 6px; border-radius:12px; font-weight:bold;">YOUR DESK</span>' : '';

            let actionBtn = isMyDesk 
                ? `<button class="btn-primary-full" style="width: 100%; background: #0ea5e9; padding: 10px; margin-top: 12px;" onclick="openMyDeskDashboard()">💼 Open My Drawer</button>`
                : `<button class="btn-outline" style="width: 100%; color: #8b5cf6; border-color: #8b5cf6; background: #faf5ff; padding: 10px; margin-top: 12px;" onclick="peekAtDesk('${session.deskId}', '${session.deskId.replace('_', ' ').toUpperCase()}')">👁️ View Details</button>`;

            let agentNamesStr = 'Loading...';
            try {
                const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', session.deskId)));
                let names = [];
                agentsSnap.forEach(aDoc => { names.push(aDoc.data().nickname || aDoc.data().displayName || aDoc.data().email?.split('@')[0] || 'Agent'); });
                agentNamesStr = names.length > 0 ? names.join(', ') : 'Empty Desk';
            } catch(e) { agentNamesStr = 'Unknown'; }

            floorHTML += `
                <div class="admin-form-card" style="margin-bottom: 0; padding: 16px; border-top: 4px solid ${isMyDesk ? '#0ea5e9' : '#8b5cf6'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                        <h4 style="margin: 0; color: #0f172a; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">${session.deskId.replace('_', ' ').toUpperCase()} ${badge}</h4>
                    </div>
                    <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 12px;">👤 ${agentNamesStr}</p>
                    <div style="margin-bottom: 12px;"><span style="font-size: 0.8rem; font-weight: bold; color: #64748b;">Live Cash:</span><span style="font-size: 1.2rem; font-weight: bold; color: #10b981; margin-left: 8px;">${liveCash} Tk</span></div>
                    <div style="margin-bottom: 16px;"><span style="display: block; font-size: 0.8rem; font-weight: bold; color: #64748b; margin-bottom: 6px;">Live Inventory:</span><div>${invDisplay}</div></div>
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

async function saveTxEdit() {
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
        if (finalCash + finalMfs !== newAmount) return alert("Cash + MFS must equal Total Tk.");
    }

    closeModal('modal-edit-tx');
    if (tx.docId) {
        try {
            await updateDoc(doc(db, 'transactions', tx.docId), { qty: newQty, amount: newAmount, payment: method === 'Split' ? 'Split' : method, cashAmt: finalCash, mfsAmt: finalMfs, isEdited: true });
            showFlashMessage("Transaction Updated!");
        } catch(e) { showFlashMessage("Offline: Edit will sync later."); }
    }
}

async function deleteTransaction(docId, localId) {
    if(!confirm("Move to trash?")) return;
    if(docId) {
        try { await updateDoc(doc(db, 'transactions', docId), { isDeleted: true }); } 
        catch(e) { console.error(e); }
    }
}

function openTrash() { renderTrash(); openModal('modal-trash'); }

function renderTrash() {
    let html = '';
    if(trashTransactions.length === 0) html = '<p class="placeholder-text">Trash is empty</p>';
    else {
        trashTransactions.sort((a,b) => b.id - a.id).forEach(tx => {
            html += `
                <div style="border:1px solid #e2e8f0; padding:12px; margin-bottom:8px; border-radius:8px; background: #fff;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong style="color: #0f172a; text-decoration: line-through;">${tx.qty}x ${tx.name}</strong> 
                        <span style="font-weight:bold; color:#ef4444;">${tx.amount} Tk</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.8rem; color:#64748b;">${tx.time} | ${tx.payment}</span>
                        <div style="display:flex; gap: 4px;">
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.8rem; height:auto; color: #10b981; border-color: #10b981;" onclick="restoreTx('${tx.docId}', ${tx.id})">♻️ Restore</button>
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.8rem; height:auto; color: #ef4444; border-color: #ef4444;" onclick="permanentlyDeleteTx('${tx.docId}', ${tx.id})">❌</button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    document.getElementById('trash-log').innerHTML = html;
}

async function restoreTx(docId, localId) {
    if(docId) {
        try {
            let tx = trashTransactions.find(t => t.docId === docId);
            if (tx && !passStockFirewall(tx.name, tx.qty)) return;

            await updateDoc(doc(db, 'transactions', docId), { isDeleted: false, isRestored: true });
            showFlashMessage("Transaction Restored!");
            setTimeout(() => { renderTrash(); if(trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
        } catch(e) {}
    }
}

async function permanentlyDeleteTx(docId, localId) {
    if (!confirm("Permanently delete this transaction?")) return;
    if(docId) { try { await deleteDoc(doc(db, 'transactions', docId)); showFlashMessage("Permanently Deleted!"); } catch(e) {} }
}

async function emptyTrash() {
    if(!confirm("Permanently delete ALL items in trash?")) return;
    const idsToDelete = trashTransactions.map(t => t.docId).filter(id => id);
    closeModal('modal-trash');
    for (const id of idsToDelete) { try { await deleteDoc(doc(db, 'transactions', id)); } catch(e) {} }
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
    if (amount <= 0) return alert("Enter a valid amount.");
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
    if (event.target.classList.contains('modal-overlay') && !['modal-auth', 'splash-screen', 'modal-desk-select', 'modal-nicknames'].includes(event.target.id)) {
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
    if (qtyInt <= 0) return alert("Enter quantity 1 or more.");
    
    if (!passStockFirewall(currentItemName, qtyInt)) return;

    addTransactionToCloud('Item', currentItemName, qtyInt * currentItemPrice, qtyInt, (currentItemPrice > 0 && isMfs) ? "MFS" : "Cash");
    closeModal('modal-quantity');
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
        txListenerUnsubscribe = onSnapshot(query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr)), (txSnapshot) => {
            transactions = []; trashTransactions = []; 
            txSnapshot.forEach(doc => {
                let tx = doc.data(); tx.docId = doc.id; 
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
            if (financialLabel) financialLabel.innerHTML = `${dateLabel} 🗓️`;
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
        btn.setAttribute('onclick', `selectItem('${item.name}', ${safePrice})`);
        
        if (isModal) {
            btn.innerHTML = `<span>${item.display || item.name}</span><span>${safePrice} ${userCurrency}</span>`;
            container.insertBefore(btn, container.querySelector('.modal-close'));
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

        // Cleaned up text replacement logic for the Report tab
        document.getElementById('report-user-name').innerText = userNickname || userDisplayName;
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
                } catch(e) {}
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

async function addTransactionToCloud(type, name, amount, qty, payment, cashAmt = 0, mfsAmt = 0) {
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

    try { await addDoc(collection(db, 'transactions'), tx); showFlashMessage("Saved to Cloud!"); } 
    catch(e) { showFlashMessage("Offline: Will sync later."); }
}

// ==========================================
//         ADMIN DASHBOARD CONTROLS
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
    if(confirm("Remove this physical item from the Master List? Menu buttons tied to it will need to be reassigned.")) {
        globalInventoryGroups.splice(index, 1);
        renderInventoryGroupsAdmin();
        openSettings();
    }
}

function populateTrackAsDropdowns() {
    let newSelect = document.getElementById('new-item-track');
    if(newSelect) {
        let options = '<option value="">🚫 None (Digital/Service)</option>';
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

    Object.entries(globalCatalog).map(([key, item]) => ({key, ...item})).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(item => {
        if (!item.isActive) return;
        
        let trackOptions = '<option value="">🚫 None (Digital/Service)</option>';
        globalInventoryGroups.forEach(g => {
            let sel = (item.trackAs === g) ? 'selected' : '';
            trackOptions += `<option value="${g}" ${sel}>${g}</option>`;
        });

        let row = document.createElement('div'); row.className = 'admin-row-card admin-row'; row.setAttribute('data-key', item.key);
        row.innerHTML = `
            <div class="admin-row-header">
                <span class="drag-handle">⋮⋮</span>
                <input type="text" class="settings-input i-name" style="flex:1; border:none; background:transparent; font-weight:700; color:#0f172a; padding:0; min-width:0;" value="${item.name}">
                <button class="delete-btn" style="color: #ef4444; padding: 4px 8px; font-size: 1.1rem; flex-shrink: 0;" onclick="removeRow(this)">🗑️</button>
            </div>
            <div class="admin-row-body">
                <div><label class="admin-label">Price (${userCurrency})</label><input type="number" class="settings-input i-price" style="padding: 10px; width: 100%; box-sizing: border-box;" value="${item.price}"></div>
                <div>
                    <label class="admin-label">Category</label>
                    <select class="settings-input i-cat" style="padding: 10px; width: 100%; box-sizing: border-box;">
                        <option value="new-sim" ${item.cat==='new-sim'?'selected':''}>📱 New SIM</option>
                        <option value="paid-rep" ${item.cat==='paid-rep'?'selected':''}>📦 Paid Rep</option>
                        <option value="foc" ${item.cat==='foc'?'selected':''}>🆓 FOC</option>
                        <option value="service" ${item.cat==='service'?'selected':''}>🛠️ Service</option>
                        <option value="free-action" ${item.cat==='free-action'?'selected':''}>🏢 Free Action</option>
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

function removeRow(btn) { if(confirm("Are you sure you want to delete this menu button?")) { let row = btn.closest('.admin-row'); row.style.display = 'none'; row.classList.add('deleted-row'); } }

async function addNewItem() {
    let nameVal = document.getElementById('new-item-name').value.trim();
    let priceVal = parseFloat(document.getElementById('new-item-price').value);
    let catVal = document.getElementById('new-item-category').value;
    let trackVal = document.getElementById('new-item-track').value;

    if (nameVal && !isNaN(priceVal) && priceVal >= 0) {
        let newKey = "item_" + Date.now(); let newOrder = Object.keys(globalCatalog).length + 1;
        globalCatalog[newKey] = { name: nameVal, display: nameVal, price: priceVal, cat: catVal, trackAs: trackVal, isActive: true, order: newOrder };
        document.getElementById('new-item-name').value = ''; document.getElementById('new-item-price').value = '';
        renderAppUI(); openSettings(); showFlashMessage("Item Added! Click Save to publish.");
    } else alert("Please enter a valid name and price.");
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
    } catch(e) { showFlashMessage("Error saving settings."); }
}

function showFlashMessage(text) {
    let msg = document.createElement('div'); msg.innerText = text;
    msg.style.cssText = "position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:var(--accent-color); color:white; padding:8px 20px; border-radius:20px; z-index:2000; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.2);";
    document.body.appendChild(msg); setTimeout(() => msg.remove(), 1500);
}

// ==========================================
//   ADMIN CENTRALIZED NICKNAME MANAGER
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
            
            // STRICTLY pull the email so the admin knows exactly who they are editing
            const userEmail = u.email || 'No email linked';
            const currentNick = u.nickname || '';
            
            html += `
                <div class="admin-form-card" style="padding: 12px; margin-bottom: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: #0ea5e9; margin-bottom: 4px;">📧 ${userEmail}</div>
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
        
        // If changing own nickname, update local UI instantly
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
        
    } catch(e) { showFlashMessage("Error saving nickname."); }
}

// ==========================================
//    USER MANAGEMENT & DANGER ZONE
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
                            <div style="font-size: 0.8rem; color: #b45309;">📍 ${deskName}</div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: auto; border-color: #f59e0b; color: #d97706;" onclick="kickAgent('${uid}')">🦵 Kick</button>
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: auto; border-color: #ef4444; color: #ef4444; background: #fef2f2;" onclick="nukeAgent('${uid}', '${displayName}')">🔥 Nuke & Kick</button>
                        </div>
                    </div>
                `;
            }
        });
        container.innerHTML = activeCount > 0 ? html : '<p style="font-size: 0.85rem; color: #b45309; margin: 0;">No agents currently locked to a desk.</p>';
    } catch (e) { container.innerHTML = '<p style="color: #ef4444; font-size: 0.85rem;">Offline: Cannot fetch users.</p>'; }
}

async function kickAgent(uid) {
    if(!confirm("Kick this agent from their desk? Their sales data will remain intact.")) return;
    try {
        await setDoc(doc(db, 'users', uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
        showFlashMessage("Agent Kicked Successfully!");
        renderUserManagementAdmin();
    } catch(e) { alert("Error kicking agent."); }
}

async function nukeAgent(uid, agentName) {
    if(!confirm(`🔥 WARNING: You are about to kick ${agentName} AND permanently delete EVERY transaction they made today. Proceed?`)) return;
    try {
        await setDoc(doc(db, 'users', uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
        const targetDateStr = getStrictDate();
        const txSnap = await getDocs(query(collection(db, 'transactions'), where('agentId', '==', uid), where('dateStr', '==', targetDateStr)));
        txSnap.forEach(async (t) => { await deleteDoc(doc(db, 'transactions', t.id)); });
        showFlashMessage(`Agent Nixed & Data Erased!`);
        renderUserManagementAdmin();
    } catch(e) { alert("Error executing Burn Notice."); }
}

async function resetMyDeskLock() {
    if(!confirm("Release your desk assignment? You will be sent back to the floor map.")) return;
    await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
    alert("Desk lock removed. Reloading app..."); window.location.reload();
}

async function forceCloseAllDesks() {
    if(!confirm("🛑 FORCE CLOSE ALL DESKS? This will instantly log out every agent on the floor.")) return;
    const snap = await getDocs(collection(db, 'desks'));
    snap.forEach(async (d) => { await setDoc(doc(db, 'desks', d.id), { status: 'closed', currentSessionId: null }, { merge: true }); });
    const sSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
    sSnap.forEach(async (s) => { await updateDoc(doc(db, 'sessions', s.id), { status: 'closed', closedBy: 'Admin Override' }); });
    alert("All desks forcefully closed. Reloading..."); window.location.reload();
}

async function nukeTodaysLedger() {
    if(!confirm("☢️ PERMANENTLY DELETE TODAY'S LEDGER? This cannot be undone!")) return;
    const targetDateStr = getStrictDate();
    const snap = await getDocs(query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr)));
    snap.forEach(async (t) => { await deleteDoc(doc(db, 'transactions', t.id)); });
    alert("Today's ledger completely wiped. Reloading..."); window.location.reload();
}


// ==========================================
//     ENGINE A: PERSONAL REPORT LOGIC
// ==========================================
function renderPersonalReport() {
    let myCash = 0, myMfs = 0, myErs = 0;
    let myInventory = {}; let historyHTML = '';

    [...transactions].reverse().forEach(tx => {
        if (tx.agentId !== currentUser.uid) return; 

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        
        if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            myCash += safeCashAmt; myMfs += safeMfsAmt;
            if (tx.name === 'ERS Flexiload') myErs += tx.amount;
            else if (tx.trackAs) {
                let pItem = tx.trackAs; 
                if (globalInventoryGroups.includes(pItem)) {
                    myInventory[pItem] = (myInventory[pItem] || 0) + Math.abs(tx.qty); 
                }
            }
        }
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        if (tx.isEdited) badges += '<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Edited</span>';
        if (tx.isRestored) badges += '<span style="font-size: 0.7rem; background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Restored</span>';

        historyHTML += `
            <div class="history-item">
                <div class="history-info">
                    <div style="display: flex; align-items: center;"><span class="history-title">${tx.qty}x ${tx.name}</span>${badges}</div>
                    <span class="history-meta">${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="delete-btn" style="color: var(--accent-color);" onclick="openEditTx(${tx.id})">✏️</button>
                    <button class="delete-btn" onclick="deleteTransaction('${tx.docId}', ${tx.id})">🗑️</button>
                </div>
            </div>
        `;
    });

    if(document.getElementById('tot-cash-sales')) document.getElementById('tot-cash-sales').innerText = myCash + ' ' + userCurrency;
    if(document.getElementById('tot-mfs')) document.getElementById('tot-mfs').innerText = myMfs + ' ' + userCurrency;
    if(document.getElementById('tot-ers')) document.getElementById('tot-ers').innerText = myErs + ' ' + userCurrency;
    if(document.getElementById('report-total-all')) document.getElementById('report-total-all').innerText = (myCash + myMfs) + ' ' + userCurrency;

    let invHTML = '';
    for (const [name, qty] of Object.entries(myInventory)) invHTML += `<div class="report-row"><span>${name}:</span> <span class="report-total">${qty}</span></div>`;
    document.getElementById('inventory-list').innerHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic;">No personal items sold yet</div>';
    document.getElementById('history-log').innerHTML = historyHTML || '<div class="placeholder-text" style="margin-top:20px;">No personal transactions today</div>';
}

function shareReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let totalRevenue = document.getElementById('report-total-all') ? document.getElementById('report-total-all').innerText : "0 Tk";
    let totalMfs = document.getElementById('tot-mfs').innerText;
    let totalCash = document.getElementById('tot-cash-sales').innerText;
    let totalErs = document.getElementById('tot-ers').innerText;
    
    let reportText = `📅 My Daily Report: ${dateStr}\n👤 Agent: ${userNickname || userDisplayName}\n\n💰 PERSONAL SALES SUMMARY\nTotal Revenue: ${totalRevenue}\nCash Collected: ${totalCash}\nMFS Collected: ${totalMfs}\n\n📱 ERS Disbursed: ${totalErs}\n\n📦 MY ITEMS SOLD\n`;
    
    let inventoryCounts = {}; let hasItems = false;
    transactions.forEach(tx => {
        if (tx.agentId === currentUser.uid && tx.name !== 'ERS Flexiload' && tx.type !== 'adjustment') { 
            let dName = tx.trackAs || tx.name;
            if (globalInventoryGroups.includes(dName)) { 
                inventoryCounts[dName] = (inventoryCounts[dName] || 0) + Math.abs(tx.qty); 
                hasItems = true; 
            }
        }
    });

    if (!hasItems) reportText += `None\n`;
    else for (const [name, qty] of Object.entries(inventoryCounts)) reportText += `${qty}x ${name}\n`;

    if (navigator.share) navigator.share({ title: 'My Daily Report', text: reportText }).catch(e => console.log(e));
    else { try { navigator.clipboard.writeText(reportText).then(() => alert("Report Copied!")).catch(() => fallbackCopy(reportText)); } catch (e) { fallbackCopy(reportText); } }
}

// ==========================================
//     ENGINE B: DESK DASHBOARD LOGIC
// ==========================================
async function renderDeskDashboard(targetDeskId = currentDeskId) {
    if (!targetDeskId) return;

    let deskCashSales = 0, mgrDropRcv = 0;
    let inventoryCounts = { ...currentOpeningInv }; 
    let historyHTML = '';
    
    let deskOpeningCash = 0;
    try {
        const targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
        const sessSnap = await getDocs(query(collection(db, 'sessions'), where('deskId', '==', targetDeskId), where('dateStr', '==', targetDateStr), limit(1)));
        if (!sessSnap.empty && sessSnap.docs[0].data().openingBalances) {
            deskOpeningCash = parseFloat(sessSnap.docs[0].data().openingBalances.cash) || 0;
            if (targetDeskId !== currentDeskId || targetDateStr !== getStrictDate()) {
                 inventoryCounts = sessSnap.docs[0].data().openingBalances.inventory || {};
            }
        }
    } catch(e) {}

    [...transactions].reverse().forEach(tx => {
        if (tx.deskId !== targetDeskId) return;

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        
        if (tx.type === 'adjustment' && tx.name === 'Physical Cash') {
            mgrDropRcv += safeCashAmt; 
        } else if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            deskCashSales += safeCashAmt; 
        }

        let invChange = getInventoryChange(tx);
        if (invChange !== 0) {
            inventoryCounts[tx.trackAs] = (inventoryCounts[tx.trackAs] || 0) + invChange;
        }
        
        let agentBadge = `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">${tx.agentName.split(' ')[0]}</span>`;

        historyHTML += `
            <div class="history-item">
                <div class="history-info">
                    <div style="display: flex; align-items: center;"><span class="history-title">${tx.qty}x ${tx.name}</span>${agentBadge}</div>
                    <span class="history-meta">${tx.time} • ${tx.payment}</span>
                </div>
            </div>
        `;
    });

    if(document.getElementById('desk-tot-opening')) document.getElementById('desk-tot-opening').innerText = deskOpeningCash + ' ' + userCurrency;
    if(document.getElementById('desk-tot-cash-sales')) document.getElementById('desk-tot-cash-sales').innerText = deskCashSales + ' ' + userCurrency;
    if(document.getElementById('desk-tot-manager')) document.getElementById('desk-tot-manager').innerText = mgrDropRcv + ' ' + userCurrency;
    if(document.getElementById('desk-tot-expected-cash')) document.getElementById('desk-tot-expected-cash').innerText = (deskOpeningCash + deskCashSales + mgrDropRcv) + ' ' + userCurrency;

    let invHTML = '';
    for (const [name, qty] of Object.entries(inventoryCounts)) invHTML += `<div class="report-row"><span>${name}:</span> <span class="report-total">${qty}</span></div>`;
    document.getElementById('desk-inventory-list').innerHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic;">No physical items tracked</div>';
    document.getElementById('desk-history-log').innerHTML = historyHTML || '<div class="placeholder-text" style="margin-top:20px;">No transactions yet</div>';

    try {
        const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', targetDeskId)));
        let names = [];
        agentsSnap.forEach(doc => { names.push(doc.data().nickname || doc.data().displayName || doc.data().email?.split('@')[0] || 'Agent'); });
        document.getElementById('desk-logged-agents').innerText = names.length > 0 ? names.join(', ') : 'None';
    } catch(e) { document.getElementById('desk-logged-agents').innerText = 'Unknown'; }
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
window.adminBypass = adminBypass; window.peekAtDesk = peekAtDesk; window.openMyDeskDashboard = openMyDeskDashboard;
window.resetMyDeskLock = resetMyDeskLock; window.forceCloseAllDesks = forceCloseAllDesks; window.nukeTodaysLedger = nukeTodaysLedger;
window.kickAgent = kickAgent; window.nukeAgent = nukeAgent;
window.openNicknameManager = openNicknameManager; window.saveAdminNickname = saveAdminNickname;