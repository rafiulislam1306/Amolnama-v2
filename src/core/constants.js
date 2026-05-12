// src/core/constants.js

export const priorityItemSortOrder = [
    // SIMs
    'No. 1 Plan', 'Prime', 'Djuice', 'Skitto', 'Power Prime', 'Recycle SIM', 'eSIM Prepaid', 'eSIM Postpaid', 'eSIM Skitto',
    // Replacements
    'Regular Replacement', 'Skitto Replacement', 'eSIM Replacement', 'Skitto eSIM Replacement', 'eSIM Skitto Replacement',
    // FOCs (Agent)
    'FOC Regular', 'FOC Skitto', 'FOC eSIM', 'FOC Skitto eSIM',
    // Free Actions (Manager Only)
    'Corporate Replacement', 'Govt. FOC', 'Death TOF',
    // Services
    'Recycle SIM Reissue', 'Itemized Bill', 'Ownership Transfer', 'MNP'
];

export const priorityInventorySortOrder = [
    'No. 1 Plan', 'Prime', 'Djuice', 'Skitto', 'Power Prime', 'Recycle SIM',
    'Regular Kit', 'Skitto Kit', 'eSIM Kit', 'eSIM Skitto Kit',
    'eSIM', 'Skitto eSIM' // Safety fallbacks
];

export const defaultInventoryGroups = [
    'No. 1 Plan', 'Prime', 'Djuice', 'Skitto', 'Power Prime', 'Recycle SIM',
    'Regular Kit', 'Skitto Kit', 'eSIM Kit', 'eSIM Skitto Kit', 'eSIM', 'Skitto eSIM'
];

export const defaultCatalog = {
    // New SIMs
    "sim_no1": { name: 'No. 1 Plan', display: 'No. 1 Plan', price: 497, cat: 'new-sim', trackAs: 'No. 1 Plan', isActive: true, order: 1 },
    "sim_prime": { name: 'Prime', display: 'Prime', price: 400, cat: 'new-sim', trackAs: 'Prime', isActive: true, order: 2 },
    "sim_djuice": { name: 'Djuice', display: 'Djuice', price: 400, cat: 'new-sim', trackAs: 'Djuice', isActive: true, order: 3 },
    "sim_skitto": { name: 'Skitto', display: 'Skitto', price: 400, cat: 'new-sim', trackAs: 'Skitto', isActive: true, order: 4 },
    "sim_power": { name: 'Power Prime', display: 'Power Prime', price: 1499, cat: 'new-sim', trackAs: 'Power Prime', isActive: true, order: 5 },
    "sim_recycle": { name: 'Recycle SIM', display: 'Recycle SIM', price: 400, cat: 'new-sim', trackAs: 'Recycle SIM', isActive: true, order: 6 },
    "sim_esim_pre": { name: 'eSIM Prepaid', display: 'eSIM Prepaid', price: 400, cat: 'new-sim', trackAs: 'eSIM Kit', isActive: true, order: 7 },
    "sim_esim_post": { name: 'eSIM Postpaid', display: 'eSIM Postpaid', price: 400, cat: 'new-sim', trackAs: 'eSIM Kit', isActive: true, order: 8 },
    "sim_esim_skitto": { name: 'eSIM Skitto', display: 'eSIM Skitto', price: 400, cat: 'new-sim', trackAs: 'eSIM Skitto Kit', isActive: true, order: 9 },

    // Paid Replacements
    "rep_regular": { name: 'Regular Replacement', display: 'Regular', price: 400, cat: 'paid-rep', trackAs: 'Regular Kit', isActive: true, order: 10 },
    "rep_skitto": { name: 'Skitto Replacement', display: 'Skitto', price: 400, cat: 'paid-rep', trackAs: 'Skitto Kit', isActive: true, order: 11 },
    "rep_esim": { name: 'eSIM Replacement', display: 'eSIM', price: 349, cat: 'paid-rep', trackAs: 'eSIM Kit', isActive: true, order: 12 },
    "rep_skitto_esim": { name: 'Skitto eSIM Replacement', display: 'Skitto eSIM', price: 349, cat: 'paid-rep', trackAs: 'eSIM Skitto Kit', isActive: true, order: 13 },

    // FOCs (Available to standard agents)
    "foc_regular": { name: 'FOC Regular', display: 'Regular', price: 0, cat: 'foc', trackAs: 'Regular Kit', isActive: true, order: 14 },
    "foc_skitto": { name: 'FOC Skitto', display: 'Skitto', price: 0, cat: 'foc', trackAs: 'Skitto Kit', isActive: true, order: 15 },
    "foc_esim": { name: 'FOC eSIM', display: 'eSIM', price: 0, cat: 'foc', trackAs: 'eSIM Kit', isActive: true, order: 16 },
    "foc_skitto_esim": { name: 'FOC Skitto eSIM', display: 'Skitto eSIM', price: 0, cat: 'foc', trackAs: 'eSIM Skitto Kit', isActive: true, order: 17 },
    "foc_corp": { name: 'Corporate Replacement', display: 'Corporate Replacement', price: 0, cat: 'free-action', trackAs: 'Regular Kit', isActive: true, order: 18 },

    // Services
    "srv_recycle": { name: 'Recycle SIM Reissue', display: 'Recycle SIM Reissue', price: 115, cat: 'service', trackAs: '', isActive: true, order: 19 },
    "srv_itemized": { name: 'Itemized Bill', display: 'Itemized Bill', price: 230, cat: 'service', trackAs: '', isActive: true, order: 20 },
    "srv_owner": { name: 'Ownership Transfer', display: 'Ownership Transfer', price: 115, cat: 'service', trackAs: '', isActive: true, order: 21 },
    "srv_mnp": { name: 'MNP', display: 'MNP', price: 457.50, cat: 'service', trackAs: '', isActive: true, order: 22 },

    // MANAGER ONLY ACTIONS (Locked)
    "foc_govt": { name: 'Govt. FOC', display: 'Govt. FOC', price: 0, cat: 'free-action', trackAs: 'Regular Kit', isActive: true, order: 23, managerOnly: true },
    "foc_death": { name: 'Death TOF', display: 'Death TOF', price: 0, cat: 'free-action', trackAs: 'Regular Kit', isActive: true, order: 24, managerOnly: true }
};