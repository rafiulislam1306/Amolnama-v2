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

    // Turn on True Offline Support
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Offline persistence only works when one tab of the app is open.");
        } else if (err.code == 'unimplemented') {
            console.warn("This browser doesn't support Firestore offline caching.");
        }
    });
} else {
  console.error("Firebase is not configured! Please paste your config above.");
}

// Global User State
let currentUser = null;
const userCurrency = 'Tk';
let userDisplayName = 'ERS';
let currentUserRole = 'user'; // Defaults to standard user

// --- DESK & SESSION STATE (PHASE 2) ---
let currentDeskId = null; 
let currentSessionId = null;
let currentDeskName = '';
let rolloverStock = {}; // Holds yesterday's SIMs

// --- GLOBAL DATABASE STRUCTURE ---
let globalCatalog = {}; 

// Fallback Database with Sorting Order
const defaultCatalog = {
    "sim_no1": { name: '📱 No. 1 Plan', display: 'No. 1 Plan', price: 497, cat: 'new-sim', isActive: true, order: 1 },
    "sim_prime": { name: '📱 Prime', display: 'Prime', price: 400, cat: 'new-sim', isActive: true, order: 2 },
    "sim_djuice": { name: '📱 Djuice', display: 'Djuice', price: 400, cat: 'new-sim', isActive: true, order: 3 },
    "sim_skitto": { name: '📱 Skitto', display: 'Skitto', price: 400, cat: 'new-sim', isActive: true, order: 4 },
    "sim_esim_pre": { name: '📱 eSIM Prepaid', display: 'eSIM Prepaid', price: 400, cat: 'new-sim', isActive: true, order: 5 },
    "sim_esim_post": { name: '📱 eSIM Postpaid', display: 'eSIM Postpaid', price: 400, cat: 'new-sim', isActive: true, order: 6 },
    "sim_power": { name: '📱 Power Prime', display: 'Power Prime', price: 1499, cat: 'new-sim', isActive: true, order: 7 },
    "sim_recycle": { name: '📱 Recycle SIM', display: 'Recycle SIM', price: 400, cat: 'new-sim', isActive: true, order: 8 },
    "sim_my": { name: '📱 My SIM', display: 'My SIM', price: 400, cat: 'new-sim', isActive: true, order: 9 },
    "rep_regular": { name: '🔄 Regular Replacement', display: 'Regular', price: 400, cat: 'paid-rep', isActive: true, order: 10 },
    "rep_skitto": { name: '🔄 Skitto Replacement', display: 'Skitto', price: 400, cat: 'paid-rep', isActive: true, order: 11 },
    "rep_esim": { name: '🔄 eSIM Replacement', display: 'eSIM', price: 349, cat: 'paid-rep', isActive: true, order: 12 },
    "rep_skitto_esim": { name: '🔄 Skitto eSIM Replacement', display: 'Skitto eSIM', price: 349, cat: 'paid-rep', isActive: true, order: 13 },
    "foc_regular": { name: '🆓 FOC Regular', display: 'Regular', price: 0, cat: 'foc', isActive: true, order: 14 },
    "foc_skitto": { name: '🆓 FOC Skitto', display: 'Skitto', price: 0, cat: 'foc', isActive: true, order: 15 },
    "foc_esim": { name: '🆓 FOC eSIM', display: 'eSIM', price: 0, cat: 'foc', isActive: true, order: 16 },
    "foc_skitto_esim": { name: '🆓 FOC Skitto eSIM', display: 'Skitto eSIM', price: 0, cat: 'foc', isActive: true, order: 17 },
    "srv_recycle": { name: '🛠️ Recycle SIM Reissue', display: 'Recycle SIM Reissue', price: 115, cat: 'service', isActive: true, order: 18 },
    "srv_itemized": { name: '🛠️ Itemized Bill', display: 'Itemized Bill', price: 230, cat: 'service', isActive: true, order: 19 },
    "srv_owner": { name: '🛠️ Ownership Transfer', display: 'Ownership Transfer', price: 115, cat: 'service', isActive: true, order: 20 },
    "srv_mnp": { name: '🛠️ MNP', display: 'MNP', price: 457.50, cat: 'service', isActive: true, order: 21 },
    "foc_corp": { name: '🏢 Corporate Replacement', display: 'Corporate Replacement', price: 0, cat: 'free-action', isActive: true, order: 22 }
};

// --- CORE MEMORY ARRAYS ---
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
                if (isInitialLoad) {
                    document.getElementById('splash-screen').classList.remove('active');
                    isInitialLoad = false;
                }
            }
        });
    })
    .catch((error) => console.error("Error setting persistence:", error));

function showAuthError(msg) {
    document.getElementById('auth-error').innerText = msg;
}

function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch(error => showAuthError(error.message));
}

function logout() {
  signOut(auth).then(() => {
        closeModal('modal-settings');
        transactions = []; 
        trashTransactions = []; 
        renderReport();
        switchTab('ers', 'ERS'); 
    });
}

// ==========================================
//        PHASE 2: DESK & SHIFT MANAGEMENT
// ==========================================

async function loadFloorMap() {
    document.getElementById('modal-desk-select').classList.add('active');
    
    try {
        const desksSnapshot = await getDocs(collection(db, 'desks'));
        let deskHTML = '';
        
        if (desksSnapshot.empty) {
            await setDoc(doc(db, 'desks', 'desk_1'), { name: 'Desk 1', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_2'), { name: 'Desk 2', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_3'), { name: 'Desk 3', status: 'closed', currentSessionId: null });
            loadFloorMap(); 
            return;
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
        
        document.getElementById('desk-list-container').innerHTML = deskHTML;
    } catch (e) {
        console.error("Error loading floor map:", e);
        document.getElementById('desk-list-container').innerHTML = '<p class="placeholder-text">Error loading desks. Are you offline?</p>';
    }
}

async function handleDeskSelect(deskId, deskName, status, sessionId) {
    currentDeskId = deskId;
    currentDeskName = deskName;

    if (status === 'open' && sessionId) {
        currentSessionId = sessionId;
        document.getElementById('modal-desk-select').classList.remove('active');
        document.getElementById('header-title').innerText = `${deskName} (Joined)`;
        await fetchTransactionsForDate(); 
        showFlashMessage(`Joined ${deskName}!`);
    } else {
        document.getElementById('open-desk-title').innerText = `Open ${deskName}`;
        document.getElementById('open-cash-float').value = '';
        document.getElementById('open-desk-inventory-container').innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';
        openModal('modal-open-desk');

        const sessionsRef = collection(db, 'sessions');
        // This query requires a Firestore index. If it fails, we catch it gracefully.
        const q = query(sessionsRef, where('deskId', '==', deskId), orderBy('closedAt', 'desc'), limit(1));
        
        // Reset rollover stock
        rolloverStock = {}; 

        try {
            const lastSessionSnap = await getDocs(q);
            if (!lastSessionSnap.empty) {
                const lastSession = lastSessionSnap.docs[0].data();
                if (lastSession.actualClosing && lastSession.actualClosing.inventory) {
                    rolloverStock = lastSession.actualClosing.inventory;
                }
            }
        } catch (e) {
            console.error("Missing Index or Offline. Proceeding with empty rollover:", e);
            // We DO NOT show an error message. We just let rolloverStock remain empty 
            // so the agent can manually input the stock themselves.
        }

        // ALWAYS render the inventory list, even if fetching failed
        let rolloverHTML = '';
        Object.values(globalCatalog).forEach(item => {
            // We load all physical items (SIMs, Kits). Since "Recycle SIM" and "Power Prime" 
            // are in your catalog, they will perfectly show up here for anyone to input.
            if (item.isActive && item.cat !== 'service' && item.cat !== 'free-action') {
                let expectedQty = rolloverStock[item.name] || 0;
                
                rolloverHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                        <label class="admin-label" style="margin:0; font-size:0.85rem; color:#334155;">${item.name}</label>
                        <input type="number" class="settings-input open-inv-input" data-name="${item.name}" value="${expectedQty === 0 ? '' : expectedQty}" placeholder="0" style="width:80px; text-align:center; padding:8px; border-color:#cbd5e1;">
                    </div>
                `;
            }
        });

        if (!rolloverHTML) rolloverHTML = '<em style="color:#64748b; font-size:0.9rem;">No physical items in catalog.</em>';
        document.getElementById('open-desk-inventory-container').innerHTML = rolloverHTML;
    }
}

async function confirmOpenDesk() {
    let floatAmount = parseFloat(document.getElementById('open-cash-float').value);
    
    if (isNaN(floatAmount) || floatAmount < 0) {
        alert("You must enter the exact physical cash float provided by the manager.");
        return;
    }

    let verifiedStartingInventory = {};
    document.querySelectorAll('.open-inv-input').forEach(input => {
        let qty = parseInt(input.value) || 0;
        if (qty > 0) {
            let itemName = input.getAttribute('data-name');
            verifiedStartingInventory[itemName] = qty;
        }
    });

    const newSessionRef = doc(collection(db, 'sessions'));
    currentSessionId = newSessionRef.id;

    const sessionData = {
        deskId: currentDeskId,
        dateStr: new Date().toLocaleDateString('en-GB'),
        openedBy: userDisplayName,
        openedByUid: currentUser.uid,
        openedAt: serverTimestamp(),
        status: 'open',
        openingBalances: {
            cash: floatAmount,
            inventory: verifiedStartingInventory 
        }
    };

    try {
        await setDoc(newSessionRef, sessionData);
        await updateDoc(doc(db, 'desks', currentDeskId), {
            status: 'open',
            currentSessionId: currentSessionId
        });

        closeModal('modal-open-desk');
        document.getElementById('modal-desk-select').classList.remove('active');
        document.getElementById('header-title').innerText = `${currentDeskName}`;
        
        transactions = [];
        trashTransactions = [];
        renderReport();
        showFlashMessage(`${currentDeskName} is now OPEN!`);

    } catch (e) {
        console.error("Failed to open desk:", e);
        alert("Error opening desk. Please check connection.");
    }
}

// ==========================================
//    PHASE 2: CLOSE DESK & RECONCILIATION
// ==========================================

let expectedClosingStats = { cash: 0, inventory: {} };
let actualClosingStats = { cash: 0, inventory: {} };

async function initiateCloseDesk() {
    if (!currentSessionId) {
        alert("You are not currently assigned to an open desk.");
        return;
    }

    const sessionRef = doc(db, 'sessions', currentSessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;

    const sessionData = sessionSnap.data();
    let expectedCash = parseFloat(sessionData.openingBalances.cash) || 0;
    let expectedInv = { ...(sessionData.openingBalances.inventory || {}) };

    const txQuery = query(collection(db, 'transactions'), where('sessionId', '==', currentSessionId), where('isDeleted', '==', false));
    const txSnap = await getDocs(txQuery);

    txSnap.forEach(docSnap => {
        let tx = docSnap.data();
        expectedCash += (tx.cashAmt || 0); 
        if (tx.name !== 'ERS Flexiload') {
            expectedInv[tx.name] = (expectedInv[tx.name] || 0) - tx.qty;
        }
    });

    expectedClosingStats = { cash: expectedCash, inventory: expectedInv };

    let invHTML = '';
    let itemsToCount = Object.keys(expectedInv);
    
    if(itemsToCount.length === 0) {
        invHTML = '<p style="color:#64748b; font-size:0.9rem; text-align:center;">No physical inventory tracked today.</p>';
    } else {
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
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Actual Cash in Drawer</label>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 1.5rem; font-weight: bold; color: #0f172a;">Tk</span>
                <input type="number" id="actual-cash-input" class="settings-input" style="font-size: 1.5rem; padding: 12px; height: auto;" placeholder="0">
            </div>
        </div>

        <div class="admin-form-card" style="padding: 16px; margin-bottom: 24px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 16px;">Count Physical Inventory</label>
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
    if (isNaN(actualCash) || actualCash < 0) {
        alert("Please enter the total physical cash currently in the drawer.");
        return;
    }

    actualClosingStats.cash = actualCash;
    actualClosingStats.inventory = {};

    document.querySelectorAll('.actual-inv-input').forEach(input => {
        let itemName = input.getAttribute('data-name');
        actualClosingStats.inventory[itemName] = parseInt(input.value) || 0;
    });

    let variance = actualCash - expectedClosingStats.cash;
    
    let warningHTML = '';
    if (variance < 0) {
        warningHTML = `
            <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <h4 style="color: #b91c1c; margin-bottom: 8px;">⚠️ SHORTAGE DETECTED</h4>
                <p style="color: #991b1b; font-size: 0.95rem; margin-bottom: 0;">You are short <strong>${Math.abs(variance)} Tk</strong>. Expected: ${expectedClosingStats.cash} Tk.</p>
            </div>
        `;
    } else if (variance > 0) {
        warningHTML = `
            <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <h4 style="color: #15803d; margin-bottom: 8px;">✅ OVERAGE DETECTED</h4>
                <p style="color: #166534; font-size: 0.95rem; margin-bottom: 0;">You have an overage of <strong>+${variance} Tk</strong>. Expected: ${expectedClosingStats.cash} Tk.</p>
            </div>
        `;
    } else {
        warningHTML = `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
                <h4 style="color: #0ea5e9; margin-bottom: 0;">⚖️ DRAWER IS PERFECTLY BALANCED</h4>
            </div>
        `;
    }

    const modalContent = `
        <h3 class="modal-title" style="color: #0f172a; margin-bottom: 4px;">Finalize Handover</h3>
        <p style="text-align: center; color: #64748b; font-size: 0.9rem; margin-bottom: 24px;">Step 2: Manager Drop & Close</p>

        ${warningHTML}

        <div class="admin-form-card" style="padding: 16px; margin-bottom: 24px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">Cash Drop to Manager</label>
            <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 12px;">How much of the <strong>${actualCash} Tk</strong> are you handing to the manager for the vault?</p>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 1.5rem; font-weight: bold; color: #0f172a;">Tk</span>
                <input type="number" id="manager-drop-input" class="settings-input" style="font-size: 1.5rem; padding: 12px; height: auto;" placeholder="0" oninput="calculateRetained()">
            </div>
            <div style="margin-top: 16px; font-size: 0.95rem; color: #475569; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                Retained Drawer Float (Tomorrow): <strong id="retained-float-display" style="color: #0ea5e9;">${actualCash} Tk</strong>
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
    if (drop > maxAllowedDrop) {
        displayEl.innerHTML = `<span style="color: #ef4444;">❌ Error: Exceeds System Total (${expectedClosingStats.cash} Tk)</span>`;
    } else {
        displayEl.innerText = retained + " Tk";
    }
}

async function finalizeCloseDesk(variance) {
    let dropAmount = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    
    let maxAllowedDrop = Math.min(actualClosingStats.cash, expectedClosingStats.cash);

    if (dropAmount < 0 || dropAmount > maxAllowedDrop) {
        alert(`Error: You cannot drop more than ${maxAllowedDrop} Tk to the manager.\n\nThe system expects a total of ${expectedClosingStats.cash} Tk. You cannot accidentally drop more than the recorded total.`);
        return;
    }

    let retainedFloat = actualClosingStats.cash - dropAmount;
    actualClosingStats.inventory = { ...actualClosingStats.inventory }; 

    try {
        const sessionRef = doc(db, 'sessions', currentSessionId);
        await updateDoc(sessionRef, {
            closedBy: userDisplayName,
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

        const deskRef = doc(db, 'desks', currentDeskId);
        await updateDoc(deskRef, {
            status: 'closed',
            currentSessionId: null
        });

        currentDeskId = null;
        currentSessionId = null;
        currentDeskName = '';
        closeModal('modal-close-desk');
        
        showFlashMessage("Desk Successfully Closed!");
        loadFloorMap(); 

    } catch (e) {
        console.error("Error closing desk:", e);
        alert("Offline: Could not close desk. Check connection.");
    }
}

// ==========================================
//    PHASE 3: MID-DAY ACTIONS & TRANSFERS
// ==========================================

let currentAdjType = 'stock';

function openAdjustmentModal(type) {
    if(!currentSessionId) {
        alert("You must open a desk first.");
        return;
    }
    currentAdjType = type;
    document.getElementById('adj-amount').value = '';
    
    let title = type === 'cash' ? '💵 Cash Adjustment' : '📦 Stock Adjustment';
    document.getElementById('adj-title').innerText = title;

    let selectEl = document.getElementById('adj-item-select');
    selectEl.innerHTML = '';
    
    if (type === 'cash') {
        selectEl.innerHTML = '<option value="Physical Cash">Physical Cash (Tk)</option>';
    } else {
        Object.values(globalCatalog).forEach(item => {
            if (item.isActive && item.cat !== 'service' && item.cat !== 'free-action') {
                let opt = document.createElement('option');
                opt.value = item.name;
                opt.innerText = item.name;
                selectEl.appendChild(opt);
            }
        });
    }
    
    openModal('modal-adjustment');
}

async function saveAdjustment() {
    let amountOrQty = parseFloat(document.getElementById('adj-amount').value) || 0;
    if (amountOrQty <= 0) {
        alert("Please enter a valid number greater than 0.");
        return;
    }

    let itemName = document.getElementById('adj-item-select').value;
    let action = document.getElementById('adj-action-select').value; 
    
    let finalValue = action === 'add' ? amountOrQty : -amountOrQty;

    let qty = currentAdjType === 'stock' ? finalValue : 0;
    let cashAmt = currentAdjType === 'cash' ? finalValue : 0;

    const adjTx = {
        id: Date.now(),
        type: 'adjustment',
        name: itemName, 
        amount: 0, 
        qty: qty,
        payment: action === 'add' ? 'Received' : 'Dropped',
        cashAmt: cashAmt,
        mfsAmt: 0,
        isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: new Date().toLocaleDateString('en-GB'),
        deskId: currentDeskId,
        sessionId: currentSessionId,
        agentId: currentUser.uid,
        agentName: userDisplayName
    };

    closeModal('modal-adjustment');

    try {
        const txCollectionRef = collection(db, 'transactions');
        await addDoc(txCollectionRef, adjTx);
        showFlashMessage("Ledger Updated!");
    } catch(e) {
        console.error("Adjustment failed:", e);
        showFlashMessage("Offline: Will sync later.");
    }
}

let targetTransferDeskId = null;
let targetTransferSessionId = null;

async function renderLiveFloorTab() {
    const container = document.getElementById('live-floor-container');
    container.innerHTML = '<div class="spinner" style="align-self: center; margin-top: 40px;"></div>';

    try {
        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('status', '==', 'open'));
        const activeSessionsSnap = await getDocs(q);

        if (activeSessionsSnap.empty) {
            container.innerHTML = '<p class="placeholder-text">No desks are currently open.</p>';
            return;
        }

        let floorHTML = '';

        for (const docSnap of activeSessionsSnap.docs) {
            const session = docSnap.data();
            const sid = docSnap.id;
            
            const txQuery = query(collection(db, 'transactions'), where('sessionId', '==', sid), where('isDeleted', '==', false));
            const txSnap = await getDocs(txQuery);

            let liveCash = parseFloat(session.openingBalances.cash) || 0;
            let liveInv = { ...(session.openingBalances.inventory || {}) };

            txSnap.forEach(txDoc => {
                let tx = txDoc.data();
                if (!tx.isVoided) {
                    liveCash += (tx.cashAmt || 0);
                    if (tx.name !== 'ERS Flexiload') {
                        liveInv[tx.name] = (liveInv[tx.name] || 0) - (tx.qty || 0);
                    }
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

            floorHTML += `
                <div class="admin-form-card" style="margin-bottom: 0; padding: 16px; border-top: 4px solid ${isMyDesk ? '#0ea5e9' : '#8b5cf6'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                        <h4 style="margin: 0; color: #0f172a; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                            ${session.deskId.replace('_', ' ').toUpperCase()} ${badge}
                        </h4>
                        <span style="font-size: 0.85rem; color: #64748b;">👤 ${session.openedBy}</span>
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <span style="font-size: 0.8rem; font-weight: bold; color: #64748b; text-transform: uppercase;">Live Cash:</span>
                        <span style="font-size: 1.2rem; font-weight: bold; color: #10b981; margin-left: 8px;">${liveCash} Tk</span>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <span style="display: block; font-size: 0.8rem; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Live Inventory:</span>
                        <div>${invDisplay}</div>
                    </div>

                    ${!isMyDesk ? `
                        <button class="btn-outline" style="width: 100%; justify-content: center; color: #8b5cf6; border-color: #8b5cf6; background: #faf5ff; height: auto; padding: 10px;" onclick="openTransferModal('${session.deskId}', '${sid}')">
                            📦 Push Stock to this Desk
                        </button>
                    ` : ''}
                </div>
            `;
        }

        container.innerHTML = floorHTML;

    } catch (e) {
        console.error("Error loading floor map:", e);
        container.innerHTML = '<p class="placeholder-text" style="color: #ef4444;">Offline: Could not load live floor data.</p>';
    }
}

function openTransferModal(targetDesk, targetSession) {
    if (!currentSessionId) {
        alert("You must open your desk first before transferring items.");
        return;
    }

    targetTransferDeskId = targetDesk;
    targetTransferSessionId = targetSession;
    
    document.getElementById('transfer-target-name').innerText = targetDesk.replace('_', ' ').toUpperCase();
    document.getElementById('transfer-qty').value = '';
    
    let selectEl = document.getElementById('transfer-item-select');
    selectEl.innerHTML = '';
    
    Object.values(globalCatalog).forEach(item => {
        if (item.isActive && item.cat !== 'service' && item.cat !== 'free-action') {
            let opt = document.createElement('option');
            opt.value = item.name;
            opt.innerText = item.name;
            selectEl.appendChild(opt);
        }
    });

    openModal('modal-transfer');
}

async function executeTransfer() {
    let qty = parseInt(document.getElementById('transfer-qty').value) || 0;
    if (qty <= 0) {
        alert("Please enter a valid quantity to send.");
        return;
    }

    let itemName = document.getElementById('transfer-item-select').value;
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = new Date().toLocaleDateString('en-GB');

    const senderTx = {
        id: Date.now(),
        type: 'transfer_out',
        name: itemName, 
        amount: 0, 
        qty: qty, 
        payment: `Sent to ${targetTransferDeskId}`,
        cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: timeStr, dateStr: dateStr,
        deskId: currentDeskId,
        sessionId: currentSessionId,
        agentId: currentUser.uid,
        agentName: userDisplayName
    };

    const receiverTx = {
        id: Date.now() + 1,
        type: 'transfer_in',
        name: itemName, 
        amount: 0, 
        qty: -qty, 
        payment: `Received from ${currentDeskId}`,
        cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: timeStr, dateStr: dateStr,
        deskId: targetTransferDeskId,
        sessionId: targetTransferSessionId,
        agentId: "system",
        agentName: `Transfer from ${userDisplayName}`
    };

    closeModal('modal-transfer');

    try {
        const txCollectionRef = collection(db, 'transactions');
        await addDoc(txCollectionRef, senderTx);
        await addDoc(txCollectionRef, receiverTx);
        
        showFlashMessage("Transfer Successful!");
        if (document.getElementById('tab-floor').classList.contains('active')) {
            renderLiveFloorTab();
        }
    } catch(e) {
        console.error("Transfer failed:", e);
        showFlashMessage("Offline: Transfer queued for sync.");
    }
}

// ==========================================
//    PHASE 3: EDIT, SPLIT PAYMENT, & TRASH
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
        paymentSelect.value = 'Split';
        splitFields.style.display = 'flex';
        document.getElementById('edit-tx-cash').value = tx.cashAmt;
        document.getElementById('edit-tx-mfs').value = tx.mfsAmt;
    } else {
        paymentSelect.value = tx.payment;
        splitFields.style.display = 'none';
    }

    openModal('modal-edit-tx');
}

function toggleEditSplitFields() {
    let method = document.getElementById('edit-tx-payment').value;
    let splitFields = document.getElementById('edit-split-fields');
    if (method === 'Split') {
        splitFields.style.display = 'flex';
        let total = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
        document.getElementById('edit-tx-cash').value = total;
        document.getElementById('edit-tx-mfs').value = 0;
    } else {
        splitFields.style.display = 'none';
    }
}

function updateSplitTotal() {
    // Allows agents to manually adjust the cash/mfs balance while typing
}

async function saveTxEdit() {
    let txIndex = transactions.findIndex(t => t.id === currentEditTxId);
    if(txIndex === -1) return;

    let tx = transactions[txIndex];
    let newQty = parseInt(document.getElementById('edit-tx-qty').value) || 0;
    let newAmount = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
    let method = document.getElementById('edit-tx-payment').value;

    let finalCash = 0;
    let finalMfs = 0;

    if (method === 'Cash') {
        finalCash = newAmount;
    } else if (method === 'MFS') {
        finalMfs = newAmount;
    } else if (method === 'Split') {
        finalCash = parseFloat(document.getElementById('edit-tx-cash').value) || 0;
        finalMfs = parseFloat(document.getElementById('edit-tx-mfs').value) || 0;
        
        if (finalCash + finalMfs !== newAmount) {
            alert("Error: The Cash + MFS portions must perfectly equal the Total Tk.");
            return;
        }
    }

    tx.qty = newQty;
    tx.amount = newAmount;
    tx.payment = method === 'Split' ? 'Split' : method;
    tx.cashAmt = finalCash;
    tx.mfsAmt = finalMfs;
    tx.isEdited = true;

    renderReport();
    closeModal('modal-edit-tx');

    if (document.getElementById('tab-floor').classList.contains('active')) {
        renderLiveFloorTab();
    }

    if (tx.docId) {
        try {
            const txRef = doc(db, 'transactions', tx.docId);
            await updateDoc(txRef, {
                qty: newQty,
                amount: newAmount,
                payment: tx.payment,
                cashAmt: finalCash,
                mfsAmt: finalMfs,
                isEdited: true
            });
            showFlashMessage("Transaction Updated!");
        } catch(e) {
            console.error("Edit failed:", e);
            showFlashMessage("Offline: Edit will sync later.");
        }
    }
}

async function deleteTransaction(docId, localId) {
    if(!confirm("Move to trash?")) return;

    if(docId) {
        try {
            const txRef = doc(db, 'transactions', docId);
            await updateDoc(txRef, { isDeleted: true });
        } catch(e) {
            console.error("Trash failed:", e);
        }
    }
}

function openTrash() {
    renderTrash();
    openModal('modal-trash');
}

function renderTrash() {
    let html = '';
    if(trashTransactions.length === 0) {
        html = '<p class="placeholder-text">Trash is empty</p>';
    } else {
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
            const txRef = doc(db, 'transactions', docId);
            await updateDoc(txRef, { isDeleted: false, isRestored: true });
            showFlashMessage("Transaction Restored!");
            
            // Wait half a second for the cloud to catch up, then refresh the trash view
            setTimeout(() => {
                renderTrash();
                if(trashTransactions.length === 0) closeModal('modal-trash');
            }, 500);

        } catch(e) {
            console.error("Restore failed:", e);
        }
    }
}

async function permanentlyDeleteTx(docId, localId) {
    if (!confirm("Permanently delete this transaction? This cannot be undone.")) return;
    trashTransactions = trashTransactions.filter(tx => tx.id !== localId);
    renderTrash();
    if(docId) {
        try {
            const txDocRef = doc(db, 'transactions', docId);
            await deleteDoc(txDocRef);
            showFlashMessage("Permanently Deleted!");
        } catch(e) { console.error("Hard delete failed:", e); }
    }
}

async function emptyTrash() {
    if(!confirm("Permanently delete ALL items in trash? This CANNOT be undone.")) return;
    
    const idsToDelete = trashTransactions.map(t => t.docId).filter(id => id);
    trashTransactions = [];
    renderTrash();

    for (const id of idsToDelete) {
        try {
            const txRef = doc(db, 'transactions', id);
            await deleteDoc(txRef); 
        } catch(e) {
            console.error("Delete failed", e);
        }
    }
    closeModal('modal-trash');
}

// ==========================================
//    UI NAVIGATION & CORE APP LOGIC
// ==========================================

function switchTab(tabId, title) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active');
    
    if(tabId === 'ers') {
        document.getElementById('header-title').innerText = currentDeskName ? currentDeskName : userDisplayName;
    } else {
        document.getElementById('header-title').innerText = title;
    }

    if(tabId === 'floor') {
        renderLiveFloorTab();
    }

    if (tabId === 'report' && currentUser) {
        if (currentUserRole === 'admin') {
            document.getElementById('settings-btn').style.display = 'block';
            document.getElementById('logout-btn').style.display = 'block'; // Admins get both!
        } else {
            document.getElementById('settings-btn').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'block'; // Users just get logout
        }
    } else {
        document.getElementById('settings-btn').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none';
    }
}

function updateCurrencyUI() {
    document.querySelectorAll('.ers-currency').forEach(el => {
        if(!el.innerText.includes('Qty')) el.innerText = userCurrency;
    });
}

// --- ERS LOGIC ---
let currentErsAmount = '0';
const ersDisplay = document.getElementById('ers-display');

function updateErsDisplay() {
    ersDisplay.innerText = currentErsAmount;
}

function ersKeyPress(num) {
    if (currentErsAmount === '0') {
        if (num !== '00' && num !== '0') currentErsAmount = num;
    } else {
        if ((currentErsAmount + num).length <= 5) currentErsAmount += num;
    }
    updateErsDisplay();
}

function ersBackspace() {
    if (currentErsAmount.length > 1) {
        currentErsAmount = currentErsAmount.slice(0, -1);
    } else {
        currentErsAmount = '0';
    }
    updateErsDisplay();
}

function saveErs(paymentMethod) {
    const amount = parseInt(currentErsAmount);
    if (amount <= 0) {
        alert("Please enter a valid amount before saving.");
        return;
    }
    addTransactionToCloud('ERS', 'ERS Flexiload', amount, 1, paymentMethod);
    currentErsAmount = '0';
    updateErsDisplay();
}

// --- SIMS & MODALS LOGIC ---
let isMfs = false;
let currentItemName = '';
let currentItemPrice = 0;
let currentQty = '1';

function toggleMFS() {
    isMfs = !isMfs;
    document.querySelectorAll('.sync-cash').forEach(el => el.classList.toggle('active', !isMfs));
    document.querySelectorAll('.sync-mfs').forEach(el => el.classList.toggle('active', isMfs));
}

function openModal(modalId) { document.getElementById(modalId).classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

// Close modal when clicking on the dark outside overlay area
window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay')) {
        const mandatoryScreens = ['modal-auth', 'splash-screen', 'modal-desk-select'];
        if (!mandatoryScreens.includes(event.target.id)) {
            closeModal(event.target.id);
        }
    }
});

function selectItem(itemName, price) {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
    currentItemName = itemName;
    currentItemPrice = price;
    currentQty = '1';
    updateQtyDisplay();
    openModal('modal-quantity');
}

// --- QUANTITY PAD LOGIC ---
function updateQtyDisplay() {
    document.getElementById('qty-item-name').innerText = currentItemName;
    document.getElementById('qty-display').innerText = currentQty;
    
    let qtyInt = parseInt(currentQty) || 0;
    let total = qtyInt * currentItemPrice;
    
    if (currentItemPrice === 0) {
        document.getElementById('qty-calc-display').innerText = `Inventory Update (0 ${userCurrency})`;
    } else {
        document.getElementById('qty-calc-display').innerText = `${qtyInt} x ${currentItemPrice} = ${total} ${userCurrency}`;
    }
}

function qtyKeyPress(num) {
    if (currentQty === '0') currentQty = num;
    else if (currentQty.length < 3) currentQty += num;
    updateQtyDisplay();
}

function qtyBackspace() {
    if (currentQty.length > 1) currentQty = currentQty.slice(0, -1);
    else currentQty = '0';
    updateQtyDisplay();
}

function saveQuantity() {
    let qtyInt = parseInt(currentQty) || 0;
    if (qtyInt <= 0) {
        alert("Please enter a quantity of 1 or more.");
        return;
    }
    let total = qtyInt * currentItemPrice;
    let paymentMethod = (currentItemPrice > 0 && isMfs) ? "MFS" : "Cash";
    addTransactionToCloud('Item', currentItemName, total, qtyInt, paymentMethod);
    closeModal('modal-quantity');
}

// --- DATE FILTER LOGIC ---
function formatToGBDate(isoDateString) {
    if (!isoDateString) return new Date().toLocaleDateString('en-GB');
    const [year, month, day] = isoDateString.split('-');
    return `${day}/${month}/${year}`;
}

function getTodayISO() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function fetchTransactionsForDate() {
    if (!currentUser) return;

    const datePicker = document.getElementById('report-date-picker');
    let selectedIsoDate = datePicker.value;

    if (!selectedIsoDate) {
        selectedIsoDate = getTodayISO();
        datePicker.value = selectedIsoDate;
    }

    const targetDateStr = formatToGBDate(selectedIsoDate);
    const isToday = targetDateStr === new Date().toLocaleDateString('en-GB');
    const dateLabel = isToday ? 'Today' : targetDateStr;

    if (txListenerUnsubscribe) {
        txListenerUnsubscribe();
        txListenerUnsubscribe = null;
    }

    try {
        const txRef = collection(db, 'transactions');
        const q = query(txRef, where('dateStr', '==', targetDateStr));

        txListenerUnsubscribe = onSnapshot(q, (txSnapshot) => {
            transactions = [];
            trashTransactions = []; 

            txSnapshot.forEach(doc => {
                let tx = doc.data();
                tx.docId = doc.id; 
                
                if (tx.deskId === currentDeskId) {
                    if (tx.isDeleted) trashTransactions.push(tx);
                    else transactions.push(tx);
                }
            });
            
            transactions.sort((a, b) => a.id - b.id);
            trashTransactions.sort((a, b) => a.id - b.id);
            
            renderReport();
            
            const financialLabel = document.getElementById('financial-date-label');
            if (financialLabel) financialLabel.innerHTML = `${dateLabel} 🗓️`;

            if (document.getElementById('tab-floor').classList.contains('active')) {
                renderLiveFloorTab();
            }
        });

    } catch (e) {
        console.error("Error setting up live data:", e);
        showFlashMessage("Error connecting to live ledger.");
    }
}

// --- UI RENDERING FOR CATALOG ---
function renderAppUI() {
    document.querySelectorAll('.dynamic-item').forEach(el => el.remove());
    const allItems = Object.values(globalCatalog).sort((a, b) => (a.order || 0) - (b.order || 0));

    allItems.forEach(item => {
        if (!item.isActive) return;
        let safePrice = parseFloat(item.price) || 0;
        let containerId = "";
        let isModal = false;
        
        if (item.cat === 'new-sim') { containerId = 'container-new-sim'; isModal = true; }
        else if (item.cat === 'paid-rep') { containerId = 'container-paid-rep'; isModal = true; }
        else if (item.cat === 'foc') { containerId = 'container-foc'; isModal = true; }
        else if (item.cat === 'service') { containerId = 'container-services'; }
        else if (item.cat === 'free-action') { containerId = 'container-free-actions'; }

        let container = document.getElementById(containerId);
        if (!container) return;

        let btn = document.createElement('button');
        btn.className = (isModal ? 'modal-item' : 'action-btn') + ' dynamic-item';
        btn.setAttribute('onclick', `selectItem('${item.name}', ${safePrice})`);
        
        if (isModal) {
            let displayName = item.display || item.name;
            btn.innerHTML = `<span>${displayName}</span><span>${safePrice} ${userCurrency}</span>`;
            let cancelBtn = container.querySelector('.modal-close');
            container.insertBefore(btn, cancelBtn);
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
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists() && userDocSnap.data().role) {
            currentUserRole = userDocSnap.data().role;
        } else {
            await setDoc(userDocRef, { email: currentUser.email, role: 'user' }, { merge: true });
            currentUserRole = 'user';
        }
        const globalRef = doc(db, 'global', 'settings');
        const globalDoc = await getDoc(globalRef);
        
        if (globalDoc.exists() && globalDoc.data().catalog) {
            globalCatalog = globalDoc.data().catalog;
        } else {
            globalCatalog = defaultCatalog;
            if (currentUserRole === 'admin') {
                await setDoc(globalRef, { catalog: globalCatalog }, { merge: true });
            }
        }

        document.getElementById('report-user-name').innerText = userDisplayName;
        if (currentUser.email) document.getElementById('report-user-email').innerText = currentUser.email;
        if (currentUser.photoURL) {
            document.getElementById('report-user-photo').src = currentUser.photoURL;
            document.getElementById('header-user-photo').src = currentUser.photoURL;
        }
        if(document.getElementById('tab-ers').classList.contains('active')) {
            document.getElementById('header-title').innerText = userDisplayName;
        }

        updateCurrencyUI();
        renderAppUI();

        document.getElementById('report-date-picker').value = getTodayISO();
        await loadFloorMap();
        
    } catch(e) {
        console.error("Error loading data:", e);
        showFlashMessage("Error loading data!");
    } finally {
        if (isInitialLoad) {
            document.getElementById('splash-screen').classList.remove('active');
            isInitialLoad = false;
        }
    }
}

// ==========================================
//         ADMIN DASHBOARD CONTROLS
// ==========================================
function filterAdminCatalog() {
    let text = document.getElementById('admin-search').value.toLowerCase();
    document.querySelectorAll('.admin-row-card').forEach(row => {
        let name = row.querySelector('.i-name').value.toLowerCase();
        row.style.display = name.includes(text) ? 'flex' : 'none';
    });
}

function toggleAddForm() {
    let form = document.getElementById('admin-add-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function openSettings() {
    let container = document.getElementById('settings-list-container');
    container.innerHTML = ''; 
    document.getElementById('admin-search').value = '';
    document.getElementById('admin-add-form').style.display = 'none';

    let itemsArray = Object.entries(globalCatalog)
                           .map(([key, item]) => ({key, ...item}))
                           .sort((a, b) => (a.order || 0) - (b.order || 0));

    itemsArray.forEach(item => {
        if (!item.isActive) return;
        let row = document.createElement('div');
        row.className = 'admin-row-card admin-row';
        row.setAttribute('data-key', item.key);
        row.innerHTML = `
            <div class="admin-row-header">
                <span class="drag-handle">⋮⋮</span>
                <input type="text" class="settings-input i-name" style="flex:1; border:none; background:transparent; font-weight:700; color:#0f172a; padding:0; min-width:0;" value="${item.name}">
                <button class="delete-btn" style="color: #ef4444; padding: 4px 8px; font-size: 1.1rem; flex-shrink: 0;" onclick="removeRow(this)">🗑️</button>
            </div>
            <div class="admin-row-body">
                <div>
                    <label class="admin-label">Price (${userCurrency})</label>
                    <input type="number" class="settings-input i-price" style="padding: 10px; width: 100%; box-sizing: border-box;" value="${item.price}">
                </div>
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
            </div>
        `;
        container.appendChild(row);
        setupDragAndDrop(row); 
    });
    openModal('modal-settings');
}

let draggedEl = null;
function setupDragAndDrop(row) {
    const handle = row.querySelector('.drag-handle');
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', () => { draggedEl = row; setTimeout(() => row.style.opacity = '0.5', 0); });
    row.addEventListener('dragend', () => { draggedEl.style.opacity = '1'; draggedEl = null; });
    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedEl || draggedEl === row) return;
        const box = row.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        if (offset > 0) row.parentNode.insertBefore(draggedEl, row.nextSibling);
        else row.parentNode.insertBefore(draggedEl, row);
    });

    handle.addEventListener('touchstart', (e) => {
        draggedEl = row;
        row.style.opacity = '0.5';
        row.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    }, { passive: true });
    
    handle.addEventListener('touchmove', (e) => {
        if (!draggedEl) return;
        e.preventDefault(); 
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetRow = target ? target.closest('.admin-row') : null;
        if (targetRow && targetRow !== draggedEl) {
            const box = targetRow.getBoundingClientRect();
            const offset = touch.clientY - box.top - box.height / 2;
            if (offset > 0) targetRow.parentNode.insertBefore(draggedEl, targetRow.nextSibling);
            else targetRow.parentNode.insertBefore(draggedEl, targetRow);
        }
    }, { passive: false });
    
    handle.addEventListener('touchend', () => {
        if(!draggedEl) return;
        draggedEl.style.opacity = '1';
        draggedEl.style.boxShadow = 'none';
        draggedEl = null;
    });
}

function removeRow(btn) {
    if(confirm("Are you sure you want to delete this item?")) {
        let row = btn.closest('.admin-row');
        row.style.display = 'none';
        row.classList.add('deleted-row'); 
    }
}

async function addNewItem() {
    let nameVal = document.getElementById('new-item-name').value.trim();
    let priceVal = parseFloat(document.getElementById('new-item-price').value);
    let catVal = document.getElementById('new-item-category').value;
    if (nameVal && !isNaN(priceVal) && priceVal >= 0) {
        let newKey = "item_" + Date.now();
        let newOrder = Object.keys(globalCatalog).length + 1;
        globalCatalog[newKey] = { name: nameVal, display: nameVal, price: priceVal, cat: catVal, isActive: true, order: newOrder };
        document.getElementById('new-item-name').value = '';
        document.getElementById('new-item-price').value = '';
        renderAppUI(); openSettings(); 
        showFlashMessage("Item Added! Don't forget to click Save.");
    } else alert("Please enter a valid name and a price of 0 or higher.");
}

async function saveSettings() {
    if(!currentUser) return;
    let rows = document.querySelectorAll('.admin-row');
    let orderCounter = 1;
    rows.forEach(row => {
        let key = row.getAttribute('data-key');
        let isDeleted = row.classList.contains('deleted-row');
        if (globalCatalog[key]) {
            if (isDeleted) globalCatalog[key].isActive = false; 
            else {
                globalCatalog[key].name = row.querySelector('.i-name').value;
                globalCatalog[key].display = row.querySelector('.i-name').value; 
                globalCatalog[key].price = parseFloat(row.querySelector('.i-price').value) || 0;
                globalCatalog[key].cat = row.querySelector('.i-cat').value;
                globalCatalog[key].order = orderCounter++; 
            }
        }
    });
    try {
        if (currentUserRole === 'admin') {
            const globalRef = doc(db, 'global', 'settings');
            await setDoc(globalRef, { catalog: globalCatalog }, { merge: true });
        }
        renderAppUI(); closeModal('modal-settings'); showFlashMessage("Settings Saved & Synced!");
    } catch(e) { console.error(e); showFlashMessage("Error saving settings."); }
}

function showFlashMessage(text) {
    let msg = document.createElement('div');
    msg.innerText = text;
    msg.style.cssText = "position:fixed; bottom:100px; left:50%; transform:translateX(-50%); background:var(--accent-color); color:white; padding:8px 20px; border-radius:20px; z-index:2000; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.2);";
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 1500);
}

// ==========================================
//          REPORTING & SHARE LOGIC
// ==========================================
function renderReport() {
    let totalCash = 0, totalMfs = 0, totalErs = 0;
    let inventoryCounts = {}; let historyHTML = '';

    [...transactions].reverse().forEach(tx => {
        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        totalCash += safeCashAmt; totalMfs += safeMfsAmt;
        if (tx.name === 'ERS Flexiload') totalErs += tx.amount;
        else inventoryCounts[tx.name] = (inventoryCounts[tx.name] || 0) + tx.qty;
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        if (tx.isEdited) badges += '<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Edited</span>';
        if (tx.isRestored) badges += '<span style="font-size: 0.7rem; background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Restored</span>';

        historyHTML += `
            <div class="history-item">
                <div class="history-info">
                    <div style="display: flex; align-items: center;">
                        <span class="history-title">${tx.qty}x ${tx.name}</span>
                        ${badges} 
                    </div>
                    <span class="history-meta">${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="delete-btn" style="color: var(--accent-color);" onclick="openEditTx(${tx.id})">✏️</button>
                    <button class="delete-btn" onclick="deleteTransaction('${tx.docId}', ${tx.id})">🗑️</button>
                </div>
            </div>
        `;
    });

    document.getElementById('tot-cash').innerText = totalCash + ' ' + userCurrency;
    document.getElementById('tot-mfs').innerText = totalMfs + ' ' + userCurrency;
    document.getElementById('tot-ers').innerText = totalErs + ' ' + userCurrency;

    let grandTotal = totalCash + totalMfs;
    let totalElement = document.getElementById('report-total-all');
    if (totalElement) totalElement.innerText = grandTotal + ' ' + userCurrency;

    let invHTML = '';
    for (const [name, qty] of Object.entries(inventoryCounts)) {
        invHTML += `<div class="report-row"><span>${name}:</span> <span class="report-total">${qty}</span></div>`;
    }
    document.getElementById('inventory-list').innerHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic;">No items yet</div>';
    document.getElementById('history-log').innerHTML = historyHTML || '<div class="placeholder-text" style="margin-top:20px;">No transactions today</div>';
}

function shareReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let totalCash = document.getElementById('tot-cash').innerText;
    let totalMfs = document.getElementById('tot-mfs').innerText;
    let totalErs = document.getElementById('tot-ers').innerText;
    let grandTotal = document.getElementById('report-total-all') ? document.getElementById('report-total-all').innerText : "0 Tk";
    
    let reportText = `📅 Daily Report: ${dateStr}\n👤 User: ${userDisplayName}\n\n`;
    reportText += `💰 FINANCIAL SUMMARY\nTotal Cash Collected: ${totalCash}\nTotal MFS Collected: ${totalMfs}\n----------------------\n🏆 GRAND TOTAL: ${grandTotal}\n\n📱 Total ERS Disbursed: ${totalErs}\n\n📦 INVENTORY & SERVICES\n`;
    
    let inventoryCounts = {}; let hasItems = false;
    transactions.forEach(tx => {
        if (tx.name !== 'ERS Flexiload') { inventoryCounts[tx.name] = (inventoryCounts[tx.name] || 0) + tx.qty; hasItems = true; }
    });

    if (!hasItems) reportText += `None\n`;
    else for (const [name, qty] of Object.entries(inventoryCounts)) reportText += `${qty}x ${name}\n`;

    if (navigator.share) navigator.share({ title: 'Amolnama Daily Report', text: reportText }).catch(err => console.log('Share failed/cancelled:', err));
    else {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(reportText).then(() => alert("Report copied to clipboard! You can paste it anywhere.")).catch(() => fallbackCopy(reportText));
            } else fallbackCopy(reportText);
        } catch (e) { fallbackCopy(reportText); }
    }
}

function fallbackCopy(text) {
    let textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";  
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        alert("Report copied to clipboard! You can paste it into WhatsApp.");
    } catch (err) { alert("Could not copy automatically. Please try again."); }
    document.body.removeChild(textArea);
}

// --- VITE EXPORTS ---
window.signInWithGoogle = signInWithGoogle;
window.logout = logout;
window.switchTab = switchTab;
window.ersKeyPress = ersKeyPress;
window.ersBackspace = ersBackspace;
window.saveErs = saveErs;
window.toggleMFS = toggleMFS;
window.openModal = openModal;
window.closeModal = closeModal;
window.selectItem = selectItem;
window.qtyKeyPress = qtyKeyPress;
window.qtyBackspace = qtyBackspace;
window.saveQuantity = saveQuantity;
window.openSettings = openSettings;
window.removeRow = removeRow;
window.addNewItem = addNewItem;
window.saveSettings = saveSettings;
window.shareReport = shareReport;
window.fetchTransactionsForDate = fetchTransactionsForDate;
window.filterAdminCatalog = filterAdminCatalog;
window.toggleAddForm = toggleAddForm;
window.loadFloorMap = loadFloorMap;
window.handleDeskSelect = handleDeskSelect;
window.confirmOpenDesk = confirmOpenDesk;
window.initiateCloseDesk = initiateCloseDesk;
window.processCloseDeskStep2 = processCloseDeskStep2;
window.calculateRetained = calculateRetained;
window.finalizeCloseDesk = finalizeCloseDesk;
window.openAdjustmentModal = openAdjustmentModal;
window.saveAdjustment = saveAdjustment;
window.renderLiveFloorTab = renderLiveFloorTab;
window.openTransferModal = openTransferModal;
window.executeTransfer = executeTransfer;
window.openEditTx = openEditTx;
window.toggleEditSplitFields = toggleEditSplitFields;
window.updateSplitTotal = updateSplitTotal;
window.saveTxEdit = saveTxEdit;
window.deleteTransaction = deleteTransaction;
window.openTrash = openTrash;
window.restoreTx = restoreTx;
window.emptyTrash = emptyTrash;
window.permanentlyDeleteTx = permanentlyDeleteTx;