// src/core/state.js

// Immutable template for a clean slate
const INITIAL_STATE = {
    currentUser: null,
    userDisplayName: 'ERS',
    userNickname: '',
    currentUserRole: 'user',
    
    currentDeskId: null,
    currentSessionId: null,
    currentDeskName: '',
    currentOpeningCash: 0,
    currentOpeningInv: {},
    
    globalCatalog: {},
    globalInventoryGroups: [],
    
    transactions: [],
    trashTransactions: [],
    
    devNotesQueue: [],
    
    isMfs: false,
    needsRender: { desk: true, report: true, floor: true },
    
    ui: {
        currentErsAmount: '0',
        currentItemName: '',
        currentItemPrice: 0,
        currentQty: '1',
        currentEditTxId: null
    }
};

// Deep clone initial state so the app starts fresh
// This object holds all the global variables for the application
export const AppState = structuredClone(INITIAL_STATE);

// Call this during logout or forced desk closures to clear memory safely
export function resetAppState() {
    const freshState = structuredClone(INITIAL_STATE);
    Object.keys(freshState).forEach(key => {
        AppState[key] = freshState[key];
    });
}