// ==========================================
//        0. SERVICE WORKER FOR PWA INSTALL
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
            .then(reg => console.log('Service Worker registered:', reg))
            .catch(err => console.error('Service Worker registration failed:', err));
    });
}

// ==========================================
//         1. FIREBASE CONFIGURATION
// ==========================================
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, query, where, getDocs, enableIndexedDbPersistence, orderBy, limit, serverTimestamp } from "firebase/firestore";

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
    // Show the desk selection screen and hide everything else
    document.getElementById('modal-desk-select').classList.add('active');
    
    try {
        const desksSnapshot = await getDocs(collection(db, 'desks'));
        let deskHTML = '';
        
        // If no desks exist yet (first time setup), create some defaults!
        if (desksSnapshot.empty) {
            await setDoc(doc(db, 'desks', 'desk_1'), { name: 'Desk 1', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_2'), { name: 'Desk 2', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_3'), { name: 'Desk 3', status: 'closed', currentSessionId: null });
            loadFloorMap(); // Reload after creating
            return;
        }

        desksSnapshot.forEach(docSnap => {
            const desk = docSnap.data();
            const isOpen = desk.status === 'open';
            const btnColor = isOpen ? '#10b981' : '#0ea5e9'; // Green if open, Blue if closed
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
        // SCENARIO 1: The desk is already open. Just join it!
        currentSessionId = sessionId;
        document.getElementById('modal-desk-select').classList.remove('active');
        document.getElementById('header-title').innerText = `${deskName} (Joined)`;
        await fetchTransactionsForDate(); // Load today's live data
        showFlashMessage(`Joined ${deskName}!`);
    } else {
        // SCENARIO 2: The desk is closed. We must open it and fetch rollover stock.
        document.getElementById('open-desk-title').innerText = `Open ${deskName}`;
        document.getElementById('open-cash-float').value = '';
        document.getElementById('rollover-inventory-list').innerHTML = 'Fetching yesterday\'s stock...';
        openModal('modal-open-desk');

        // Fetch the absolute most recent closed session for this desk to get leftover SIMs
        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('deskId', '==', deskId), orderBy('closedAt', 'desc'), limit(1));
        
        try {
            const lastSessionSnap = await getDocs(q);
            rolloverStock = {}; 
            let rolloverHTML = '';

            if (!lastSessionSnap.empty) {
                const lastSession = lastSessionSnap.docs[0].data();
                if (lastSession.actualClosing && lastSession.actualClosing.inventory) {
                    rolloverStock = lastSession.actualClosing.inventory;
                }
            }

            // Render the stock into the modal
            if (Object.keys(rolloverStock).length === 0) {
                rolloverHTML = '<em>No physical stock rolled over. Drawer is empty.</em>';
            } else {
                for (const [itemName, qty] of Object.entries(rolloverStock)) {
                    if(qty > 0) rolloverHTML += `<div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>${itemName}</span> <strong>${qty}</strong></div>`;
                }
            }
            document.getElementById('rollover-inventory-list').innerHTML = rolloverHTML || '<em>No physical stock rolled over.</em>';

        } catch (e) {
            console.error("Error fetching rollover:", e);
            document.getElementById('rollover-inventory-list').innerHTML = '<em>Offline: Cannot fetch rollover stock.</em>';
        }
    }
}

async function confirmOpenDesk() {
    let floatAmount = parseFloat(document.getElementById('open-cash-float').value);
    
    // We strictly force them to type the opening cash from the manager
    if (isNaN(floatAmount) || floatAmount < 0) {
        alert("You must enter the exact physical cash float provided by the manager.");
        return;
    }

    // 1. Create the new Session document
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
            inventory: rolloverStock // Passed directly from yesterday
        }
    };

    try {
        await setDoc(newSessionRef, sessionData);
        
        // 2. Update the Desk document to mark it open and link the session
        await updateDoc(doc(db, 'desks', currentDeskId), {
            status: 'open',
            currentSessionId: currentSessionId
        });

        closeModal('modal-open-desk');
        document.getElementById('modal-desk-select').classList.remove('active');
        document.getElementById('header-title').innerText = `${currentDeskName}`;
        
        // Clear local memory and fetch fresh
        transactions = [];
        trashTransactions = [];
        renderReport();
        showFlashMessage(`${currentDeskName} is now OPEN!`);

    } catch (e) {
        console.error("Failed to open desk:", e);
        alert("Error opening desk. Please check connection.");
    }
}

// Ensure the floor map triggers when the app initializes
window.loadFloorMap = loadFloorMap;
window.handleDeskSelect = handleDeskSelect;
window.confirmOpenDesk = confirmOpenDesk;

// --- UI NAVIGATION ---
function switchTab(tabId, title) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    event.currentTarget.classList.add('active');
    
    if(tabId === 'ers') {
        document.getElementById('header-title').innerText = userDisplayName;
    } else {
        document.getElementById('header-title').innerText = title;
    }

    if (tabId === 'report' && currentUser) {
        if (currentUserRole === 'admin') {
            document.getElementById('settings-btn').style.display = 'block';
            document.getElementById('logout-btn').style.display = 'none';
        } else {
            document.getElementById('settings-btn').style.display = 'none';
            document.getElementById('logout-btn').style.display = 'block';
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
    
    // Check if we are viewing today or the past
    const isToday = targetDateStr === new Date().toLocaleDateString('en-GB');
    const dateLabel = isToday ? 'Today' : targetDateStr;

    try {
        const txRef = collection(db, 'transactions');
        const q = query(txRef, where('dateStr', '==', targetDateStr));
        const txSnapshot = await getDocs(q);

        transactions = [];
        trashTransactions = []; 

        txSnapshot.forEach(doc => {
            let tx = doc.data();
            tx.docId = doc.id; 
            // Only load transactions tied to the current desk
            if (tx.deskId === currentDeskId) {
                if (tx.isDeleted) trashTransactions.push(tx);
                else transactions.push(tx);
            }
        });
        
        transactions.sort((a, b) => a.id - b.id);
        trashTransactions.sort((a, b) => a.id - b.id);
        
        renderReport();
        
        // Update the interactive badge above the financial summary
        const financialLabel = document.getElementById('financial-date-label');
        if (financialLabel) financialLabel.innerHTML = `${dateLabel} 🗓️`;

    } catch (e) {
        console.error("Error fetching historical data:", e);
        showFlashMessage("Error loading historical data.");
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
        // Fetch or initialize user role from Firestore
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

        // Initialize the date picker to today
        document.getElementById('report-date-picker').value = getTodayISO();
        
        // Launch Phase 2: Floor Map / Desk Selection
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

async function addTransactionToCloud(type, name, amount, qty, payment, cashAmt = 0, mfsAmt = 0) {
    if(!currentUser) return;
    if (payment === 'Cash') { cashAmt = amount; mfsAmt = 0; }
    if (payment === 'MFS') { cashAmt = 0; mfsAmt = amount; }

    const today = new Date().toLocaleDateString('en-GB');
    const tx = {
        id: Date.now(), 
        type: type, name: name, amount: amount, qty: qty,
        payment: payment, cashAmt: cashAmt, mfsAmt: mfsAmt,
        isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: today,
        deskId: currentDeskId,
        sessionId: currentSessionId,
        agentId: currentUser.uid,
        agentName: userDisplayName
    };

    transactions.push(tx);
    renderReport();
    
    try {
        const txCollectionRef = collection(db, 'transactions');
        const docRef = await addDoc(txCollectionRef, tx);
        let localTx = transactions.find(t => t.id === tx.id);
        if(localTx) localTx.docId = docRef.id; 
        showFlashMessage("Saved to Cloud!");
    } catch(e) {
        console.error("Failed to sync:", e);
        showFlashMessage("Offline: Will sync later.");
    }
}

// --- EDIT TRANSACTION LOGIC ---
let currentEditingTxId = null;

function toggleEditSplitFields() {
    let method = document.getElementById('edit-tx-payment').value;
    document.getElementById('edit-split-fields').style.display = (method === 'Split') ? 'flex' : 'none';
}

function updateSplitTotal() {
    let cash = parseFloat(document.getElementById('edit-tx-cash').value) || 0;
    let mfs = parseFloat(document.getElementById('edit-tx-mfs').value) || 0;
    document.getElementById('edit-tx-amount').value = cash + mfs;
}

function openEditTx(localId) {
    let tx = transactions.find(t => t.id === localId);
    if (!tx) return;
    currentEditingTxId = localId;
    document.getElementById('edit-tx-name').innerText = tx.name;
    document.getElementById('edit-tx-qty').value = tx.qty;
    document.getElementById('edit-tx-amount').value = tx.amount;
    document.getElementById('edit-tx-payment').value = tx.payment;
    document.getElementById('edit-tx-cash').value = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : '');
    document.getElementById('edit-tx-mfs').value = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : '');
    toggleEditSplitFields();
    openModal('modal-edit-tx');
}

async function saveTxEdit() {
    if (!currentEditingTxId || !currentUser) return;
    let txIndex = transactions.findIndex(t => t.id === currentEditingTxId);
    if (txIndex === -1) return;
    let tx = transactions[txIndex];
    
    let newQty = parseInt(document.getElementById('edit-tx-qty').value) || 0;
    let newAmount = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
    let newPayment = document.getElementById('edit-tx-payment').value;
    let newCashAmt = 0, newMfsAmt = 0;

    if (newPayment === 'Cash') { newCashAmt = newAmount; }
    else if (newPayment === 'MFS') { newMfsAmt = newAmount; }
    else if (newPayment === 'Split') {
        newCashAmt = parseFloat(document.getElementById('edit-tx-cash').value) || 0;
        newMfsAmt = parseFloat(document.getElementById('edit-tx-mfs').value) || 0;
        if (Math.abs((newCashAmt + newMfsAmt) - newAmount) > 0.01) {
            alert("Split amounts must equal the Total Tk!");
            return;
        }
    }

    if (newAmount < 0 || newCashAmt < 0 || newMfsAmt < 0 || newQty < 0) {
        alert("Error: Amounts and quantities cannot be negative numbers!");
        return;
    }

    tx.qty = newQty; tx.amount = newAmount; tx.payment = newPayment;
    tx.cashAmt = newCashAmt; tx.mfsAmt = newMfsAmt; tx.isEdited = true; 

    renderReport();
    closeModal('modal-edit-tx');

    if (tx.docId) {
        try {
            const txDocRef = doc(db, 'transactions', tx.docId);
            await updateDoc(txDocRef, {
                qty: newQty, amount: newAmount, payment: newPayment,
                cashAmt: newCashAmt, mfsAmt: newMfsAmt, isEdited: true 
            });
            showFlashMessage("Updated in Cloud!");
        } catch(e) {
            console.error("Edit failed:", e);
            showFlashMessage("Error saving edit.");
        }
    }
}

// --- TRASH SYSTEM (SOFT DELETE) ---
async function deleteTransaction(docId, localId) {
    if(!currentUser) return;
    if (!confirm("Move this transaction to Trash?")) return;

    let txIndex = transactions.findIndex(tx => tx.id === localId);
    if (txIndex > -1) {
        let tx = transactions.splice(txIndex, 1)[0];
        tx.isDeleted = true;
        trashTransactions.push(tx);
        renderReport();
    }
    if(docId) {
        try {
            const txDocRef = doc(db, 'transactions', docId);
            await updateDoc(txDocRef, { isDeleted: true });
            showFlashMessage("Moved to Trash");
        } catch(e) { console.error("Delete failed:", e); }
    }
}

function openTrash() { renderTrash(); openModal('modal-trash'); }

function renderTrash() {
    let trashHTML = '';
    [...trashTransactions].reverse().forEach(tx => {
        trashHTML += `
            <div class="history-item" style="opacity: 0.7;">
                <div class="history-info">
                    <span class="history-title" style="text-decoration: line-through;">${tx.qty}x ${tx.name}</span>
                    <span class="history-meta">${tx.time} • ${tx.amount} ${userCurrency}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="delete-btn" style="color: #10b981; border: 1px solid #10b981; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;" onclick="restoreTransaction('${tx.docId}', ${tx.id})">♻️ Restore</button>
                    <button class="delete-btn" style="color: #ef4444; border: 1px solid #ef4444; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;" onclick="permanentlyDeleteTx('${tx.docId}', ${tx.id})">❌ Delete</button>
                </div>
            </div>
        `;
    });
    document.getElementById('trash-log').innerHTML = trashHTML || '<div class="placeholder-text">Trash is empty</div>';
}

async function permanentlyDeleteTx(docId, localId) {
    if(!currentUser) return;
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
    if(!currentUser || trashTransactions.length === 0) return;
    if (!confirm("Are you sure you want to permanently delete ALL items in the trash? This cannot be undone.")) return;
    let itemsToDelete = [...trashTransactions];
    trashTransactions = [];
    renderTrash();
    showFlashMessage("Emptying Trash...");
    try {
        let deletePromises = itemsToDelete.map(tx => {
            if(tx.docId) {
                const txDocRef = doc(db, 'transactions', tx.docId);
                return deleteDoc(txDocRef);
            }
        });
        await Promise.all(deletePromises);
        showFlashMessage("Trash Emptied!");
    } catch(e) {
        console.error("Empty trash failed:", e);
        showFlashMessage("Error emptying trash.");
    }
}

async function restoreTransaction(docId, localId) {
    if(!currentUser) return;
    let txIndex = trashTransactions.findIndex(tx => tx.id === localId);
    if (txIndex > -1) {
        let tx = trashTransactions.splice(txIndex, 1)[0];
        tx.isDeleted = false; tx.isRestored = true; 
        transactions.push(tx);
        transactions.sort((a, b) => a.id - b.id);
        renderReport(); renderTrash();
    }
    if(docId) {
        try {
            const txDocRef = doc(db, 'transactions', docId);
            await updateDoc(txDocRef, {
                isDeleted: false, isRestored: true 
            });
            showFlashMessage("Transaction Restored!");
            closeModal('modal-trash');
        } catch(e) { console.error("Restore failed:", e); }
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
window.openEditTx = openEditTx;
window.saveTxEdit = saveTxEdit;
window.toggleEditSplitFields = toggleEditSplitFields;
window.updateSplitTotal = updateSplitTotal;
window.deleteTransaction = deleteTransaction;
window.openTrash = openTrash;
window.emptyTrash = emptyTrash;
window.permanentlyDeleteTx = permanentlyDeleteTx;
window.restoreTransaction = restoreTransaction;
window.openSettings = openSettings;
window.removeRow = removeRow;
window.addNewItem = addNewItem;
window.saveSettings = saveSettings;
window.shareReport = shareReport;
window.fetchTransactionsForDate = fetchTransactionsForDate;