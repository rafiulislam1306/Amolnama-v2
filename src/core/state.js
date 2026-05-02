// src/core/state.js

// This object holds all the variables that were previously "let" variables scattered in main.js
export const AppState = {
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
    
    isMfs: false
};