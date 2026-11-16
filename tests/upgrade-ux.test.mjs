// tests/upgrade-ux.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function createMockClassList(initial = []) {
    const set = new Set(initial);
    return {
        add: (...cls) => cls.forEach(c => set.add(c)),
        remove: (...cls) => cls.forEach(c => set.delete(c)),
        toggle: (c, force) => {
            if (force === true) { set.add(c); return true; }
            if (force === false) { set.delete(c); return false; }
            if (set.has(c)) { set.delete(c); return false; }
            set.add(c);
            return true;
        },
        contains: (c) => set.has(c)
    };
}

function createMockElement(id = '', initialClasses = []) {
    const listeners = {};
    let focused = false;
    return {
        id,
        classList: createMockClassList(initialClasses),
        style: {},
        innerText: '',
        innerHTML: '',
        value: '',
        dataset: {},
        scrollTop: 0,
        isConnected: true,
        tagName: 'DIV',
        attributes: {},
        setAttribute(k, v) { this.attributes[k] = String(v); },
        getAttribute(k) { return this.attributes[k] ?? null; },
        addEventListener(evt, fn) {
            listeners[evt] = listeners[evt] || [];
            listeners[evt].push(fn);
        },
        removeEventListener(evt, fn) {
            if (!listeners[evt]) return;
            listeners[evt] = listeners[evt].filter(f => f !== fn);
        },
        dispatchEvent(evt) {
            const list = listeners[evt.type] || [];
            list.forEach(fn => fn(evt));
        },
        focus() {
            focused = true;
            globalThis.document.activeElement = this;
        },
        wasFocused() { return focused; },
        resetFocused() { focused = false; },
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => null,
        contains: () => false,
        appendChild: () => {},
        remove: () => {}
    };
}

const elementRegistry = new Map();

function setupDomGlobals() {
    elementRegistry.clear();
    const fallback = createMockElement('fallback');
    Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: () => false, onLine: true },
        configurable: true
    });
    globalThis.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    };
    globalThis.requestAnimationFrame = (cb) => cb();
    globalThis.window = {
        Amolnama: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };
    globalThis.document = {
        body: createMockElement('body'),
        activeElement: null,
        _amolnamaFocusTrapBound: false,
        getElementById: (id) => elementRegistry.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => createMockElement('created'),
        addEventListener: () => {},
        removeEventListener: () => {},
        _fallback: fallback
    };
    globalThis.document.activeElement = globalThis.document.body;
}

setupDomGlobals();

const { AppState } = await import('../src/core/state.js');
const {
    ersClear,
    ersAddPreset,
    canSelectMultiQty,
    isTransactionModifiable,
    openEditTx,
    setEditPaymentMethod,
    autoCalcEditTotal,
    updateSplitTotal,
    cancelTxEdit,
    saveTxEdit
} = await import('../src/features/transactions.js');
const { markInputError, clearInputError, openModal, closeModal } = await import('../src/utils/ui-helpers.js');
const { syncHistoricalDateBanner, returnToToday } = await import('../src/features/reports.js');
const { getStrictDate, formatLocalISODate } = await import('../src/utils/helpers.js');
const {
    createDefaultLedgerFilters,
    resolveTxCategory,
    matchesLedgerCategory,
    matchesLedgerFilters,
    sortLedgerTransactions,
    countActiveAdvancedFilters,
    isLedgerFiltered,
    computeFilteredLedgerTotal,
    extractLedgerAgents
} = await import('../src/utils/ledger-filters.js');
const { switchStoreCategory } = await import('../src/features/inventory.js');
const { filterStoreCatalog, toggleStoreInStockFilter, resetStoreFilters } = await import('../src/features/catalog.js');

const rootDir = process.cwd();
const styleCss = fs.readFileSync(path.join(rootDir, 'src', 'style.css'), 'utf-8');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const mainJs = fs.readFileSync(path.join(rootDir, 'src', 'main.js'), 'utf-8');
const authJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'auth.js'), 'utf-8');
const catalogJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'catalog.js'), 'utf-8');
const deskJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'desk.js'), 'utf-8');
const reportsJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'reports.js'), 'utf-8');
const transfersJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'transfers.js'), 'utf-8');
const uiHelpersJs = fs.readFileSync(path.join(rootDir, 'src', 'utils', 'ui-helpers.js'), 'utf-8');
const adminJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'admin.js'), 'utf-8');
const ratesJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'rates.js'), 'utf-8');
const recycleJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'recycle.js'), 'utf-8');

test('Upgrade Suite: POS UX, Accessibility & Visual Discipline', async (t) => {
    await t.test('1. ERS Quick Presets & Clear Logic', () => {
        setupDomGlobals();
        const displayEl = createMockElement('ers-display');
        elementRegistry.set('ers-display', displayEl);

        AppState.ui.currentErsAmount = '0';
        ersAddPreset(20);
        assert.equal(AppState.ui.currentErsAmount, '20');
        assert.equal(displayEl.innerText, '20');

        ersAddPreset(100);
        assert.equal(AppState.ui.currentErsAmount, '120');
        assert.equal(displayEl.innerText, '120');

        // Clamp upper limit at 999,999
        AppState.ui.currentErsAmount = '999900';
        ersAddPreset(500);
        assert.equal(AppState.ui.currentErsAmount, '999999');

        // Negative presets don't reduce below current
        AppState.ui.currentErsAmount = '50';
        ersAddPreset(-20);
        assert.equal(AppState.ui.currentErsAmount, '50');

        ersClear();
        assert.equal(AppState.ui.currentErsAmount, '0');
        assert.equal(displayEl.innerText, '0');
    });

    await t.test('2. canSelectMultiQty eligibility mirrors SIM/MNP vs multi-qty items', () => {
        assert.equal(canSelectMultiQty('Prime'), false);
        assert.equal(canSelectMultiQty('Skitto'), false);
        assert.equal(canSelectMultiQty('Nishchinto Basic'), false);
        assert.equal(canSelectMultiQty('MNP'), false);
        assert.equal(canSelectMultiQty('Recycle SIM'), false);
        assert.equal(canSelectMultiQty('50 Tk Scratch Card'), true);
        assert.equal(canSelectMultiQty('Paid Replacement'), true);
        assert.equal(canSelectMultiQty(''), false);
    });

    await t.test('3. markInputError & clearInputError validation lifecycle', () => {
        setupDomGlobals();
        const inputEl = createMockElement('mgr-cash-amount');
        elementRegistry.set('mgr-cash-amount', inputEl);

        markInputError('mgr-cash-amount');
        assert.equal(inputEl.classList.contains('input-error'), true);
        assert.equal(inputEl.wasFocused(), true);

        // Typing clears the error class automatically
        inputEl.dispatchEvent({ type: 'input' });
        assert.equal(inputEl.classList.contains('input-error'), false);

        markInputError(inputEl);
        assert.equal(inputEl.classList.contains('input-error'), true);
        clearInputError(inputEl);
        assert.equal(inputEl.classList.contains('input-error'), false);

        // Enhanced <select> propagates error highlight & focus to .custom-select-trigger
        const selectEl = createMockElement('mgr-cash-action');
        const customTrigger = createMockElement('', ['custom-select-trigger']);
        const customWrapper = createMockElement('', ['custom-select-wrapper']);
        customWrapper.querySelector = (sel) => (sel === '.custom-select-trigger' ? customTrigger : null);
        selectEl.closest = (sel) => (sel === '.custom-select-wrapper' ? customWrapper : null);
        elementRegistry.set('mgr-cash-action', selectEl);

        markInputError(selectEl);
        assert.equal(selectEl.classList.contains('input-error'), true);
        assert.equal(customTrigger.classList.contains('input-error'), true);
        assert.equal(customTrigger.wasFocused(), true);

        clearInputError(selectEl);
        assert.equal(selectEl.classList.contains('input-error'), false);
        assert.equal(customTrigger.classList.contains('input-error'), false);
    });

    await t.test('4. Modal opener focus restoration & first-focusable focus', () => {
        setupDomGlobals();
        const triggerBtn = createMockElement('open-trigger');
        const modalFirstInput = createMockElement('modal-input');
        const modalOverlay = createMockElement('modal-test', ['modal-overlay']);

        modalOverlay.querySelectorAll = () => [modalFirstInput];
        modalOverlay.querySelector = () => null;
        modalOverlay.contains = (el) => el === modalFirstInput;

        elementRegistry.set('open-trigger', triggerBtn);
        elementRegistry.set('modal-test', modalOverlay);

        triggerBtn.focus();
        triggerBtn.resetFocused();

        openModal('modal-test');
        assert.equal(modalOverlay.classList.contains('active'), true);
        assert.equal(modalFirstInput.wasFocused(), true);

        closeModal('modal-test');
        assert.equal(modalOverlay.classList.contains('active'), false);
        assert.equal(triggerBtn.wasFocused(), true);
    });

    await t.test('5. Historical Date Banner syncHistoricalDateBanner & returnToToday', () => {
        setupDomGlobals();
        const picker = createMockElement('report-date-picker');
        const banner = createMockElement('historical-date-banner');
        const bannerText = createMockElement('historical-date-text');
        const todayBtn = createMockElement('report-today-btn');

        elementRegistry.set('report-date-picker', picker);
        elementRegistry.set('historical-date-banner', banner);
        elementRegistry.set('historical-date-text', bannerText);
        elementRegistry.set('report-today-btn', todayBtn);

        // Past date selected -> banner and today button visible
        picker.value = '2025-01-15';
        syncHistoricalDateBanner();
        assert.equal(banner.style.display, 'flex');
        assert.equal(todayBtn.style.display, 'inline-flex');
        assert.ok(bannerText.innerText.includes('2025'), 'Historical banner text must display formatted past date');

        // Returning to today hides historical banner & button
        AppState.currentUser = null; // prevents Firestore call inside fetchTransactionsForDate
        returnToToday();
        assert.equal(picker.value, formatLocalISODate(new Date()));
        assert.equal(banner.style.display, 'none');
        assert.equal(todayBtn.style.display, 'none');
        assert.ok(getStrictDate().length > 0);
    });

    await t.test('6. HTML/CSS/JS Static Contracts (Presets, Banners, Qty Button, WCAG Contrast, Clean Borders)', () => {
        // UI Elements present in index.html
        assert.match(indexHtml, /id="historical-date-banner"/);
        assert.match(indexHtml, /id="report-today-btn"/);
        assert.match(indexHtml, /class="ers-preset-row"/);
        assert.match(indexHtml, /ersAddPreset\(20\)/);
        assert.match(indexHtml, /ersClear\(\)/);
        assert.match(indexHtml, /id="store-mfs-banner"/);
        assert.match(indexHtml, /onclick="clearStoreSearch\(\)"/);

        // WCAG AA button colors replaced weak #10b981 / #ef4444 on white text buttons
        assert.match(indexHtml, /id="btn-phone-signin"[^>]*background:\s*#047857/);
        assert.match(indexHtml, /id="btn-save-phone-pin"[^>]*background:\s*#047857/);
        assert.match(indexHtml, /id="app-alert-confirm"[^>]*background:\s*#dc2626/);
        assert.match(indexHtml, /id="offline-banner"[^>]*background-color:\s*#dc2626/);

        // Clean border discipline (no thick 4px left-stripe card hacks)
        assert.doesNotMatch(styleCss, /border-left:\s*4px\s+solid/);
        assert.doesNotMatch(reportsJs, /border-left:\s*4px\s+solid/);

        // Required CSS utility classes & rules
        assert.match(styleCss, /\.ers-preset-row\b/);
        assert.match(styleCss, /\.ers-preset-chip\b/);
        assert.match(styleCss, /\.historical-date-banner\b/);
        assert.match(styleCss, /\.store-mfs-banner\b/);
        assert.match(styleCss, /\.store-item-qty-btn\b/);
        assert.match(styleCss, /\.ledger-count-bar\b/);
        assert.match(styleCss, /\.input-error\b/);

        // Store rows keyboard & Qty accessibility in catalog.js
        assert.match(catalogJs, /setAttribute\('role',\s*'button'\)/);
        assert.match(catalogJs, /setAttribute\('tabindex',\s*'0'\)/);
        assert.match(catalogJs, /store-item-qty-btn/);

        // Desktop keypad shortcuts & global exports in main.js
        assert.match(mainJs, /ersClear/);
        assert.match(mainJs, /ersAddPreset/);
        assert.match(mainJs, /resetDeskFilter/);
        assert.match(mainJs, /resetPersonalFilter/);
        assert.match(mainJs, /syncHistoricalDateBanner/);
        assert.match(mainJs, /returnToToday/);
        assert.match(mainJs, /isErsActive\s*&&\s*!hasActiveModal\s*&&\s*!isInputFocused/);
    });

    await t.test('7. End-to-End UI/UX Polish Contracts (Accessibility, Specificity, Dark Mode, No Raw Emojis)', () => {
        // Phone login PIN eye toggle & Store MFS ARIA switch
        assert.match(indexHtml, /id="auth-pin-input"[\s\S]*?togglePinVisibility\('auth-pin-input'/);
        assert.match(indexHtml, /class="toggle-switch"[^>]*role="switch"[^>]*aria-checked="false"/);
        assert.match(mainJs, /#tab-store \.toggle-switch'\)\?\.setAttribute\('aria-checked'/);

        // Desk action cards are semantic buttons (without Close Desk)
        assert.match(indexHtml, /<button[^>]*class="desk-action-card"[^>]*openManagerCashModal\(\)/);
        assert.match(indexHtml, /<button[^>]*class="desk-action-card"[^>]*openDeskTransfer\(\)/);
        assert.doesNotMatch(indexHtml, /id="desk-action-buttons"[\s\S]*?initiateCloseDesk\(\)/);

        // Specific CSS fixes: OOS danger specificity, solid CTA gradient override, bottom-sheet pill padding, desktop clipping
        assert.match(styleCss, /\.store-item-row \.store-item-action\.is-danger/);
        assert.match(styleCss, /\.btn-primary-full\[style\*="background-color"\]/);
        assert.match(styleCss, /\.modal-overlay:not\(#modal-profile-hub\) \.bottom-sheet/);
        assert.match(styleCss, /\.custom-select-trigger\.input-error/);
        assert.match(styleCss, /\.search-input-wrap\.has-icon \.search-leading-icon/);

        // Clean SVG/text UI without jarring raw emojis
        assert.doesNotMatch(authJs, /🎉/);
        assert.doesNotMatch(catalogJs, /⚠️/);
        assert.doesNotMatch(deskJs, /📶/);
        assert.doesNotMatch(uiHelpersJs, /⚠️/);
        assert.doesNotMatch(reportsJs, /📄 Preparing|✅ FC|❌ FC|📱 Model:|💬 /);
        assert.doesNotMatch(transfersJs, /📦|👤/);
        assert.doesNotMatch(indexHtml, />🔍</);
    });

    await t.test('8. Multi-Facet Ledger Filtering Utilities (Search, Payment, Status, Agent, Sort & Totals)', () => {
        const catalog = {
            sim_prime: { name: 'Prime', cat: 'new-sim' },
            card_50: { name: '50 Tk Scratch Card', cat: 'cards' }
        };
        const txs = [
            { id: 1001, name: 'ERS Flexiload', amount: 150, payment: 'Cash', cashAmt: 150, mfsAmt: 0, agentName: 'Rahim', receiptNo: 'RCP-101' },
            { id: 1005, name: 'Prime', amount: 300, payment: 'Split', cashAmt: 100, mfsAmt: 200, agentName: 'Karim', receiptNo: 'RCP-102', onboarding: { firstCall: true, appReg: false }, isEdited: true },
            { id: 1003, name: '50 Tk Scratch Card', amount: 100, payment: 'MFS', cashAmt: 0, mfsAmt: 100, agentName: 'rahim', receiptNo: 'RCP-103', notes: 'VIP buyer', isPending: true },
            { id: 1004, name: 'Handset Cash Collection', type: 'adjustment', cat: 'cash_actions', amount: 2500, payment: 'Cash', cashAmt: 2500, mfsAmt: 0, handsetModel: 'Galaxy A15', agentName: 'Nadia' },
            { id: 1002, name: 'Desk Transfer Out', type: 'transfer_out', cat: 'transfers', amount: 500, payment: 'Cash', agentName: 'Karim', isDeleted: true },
            { id: 1006, name: 'MNP Port-In', cat: 'new-sim', amount: 200, payment: 'Cash', agentName: 'Nadia' }
        ];

        // Category resolution with catalog & direct tx.cat fallback
        assert.equal(resolveTxCategory(txs[1], catalog), 'new-sim');
        assert.equal(resolveTxCategory(txs[5], catalog), 'new-sim');
        assert.equal(matchesLedgerCategory(txs[0], 'ers', catalog), true);
        assert.equal(matchesLedgerCategory(txs[3], 'cash_actions', catalog), true);
        assert.equal(matchesLedgerCategory(txs[4], 'transfers', catalog), true);
        assert.equal(matchesLedgerCategory(txs[5], 'new-sim', catalog), true);

        // Combined filtering: payment + status + agent + search
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), payment: 'Split' }, catalog)).length, 1);
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), status: 'incomplete_onboarding' }, catalog)).map(x => x.id).join(','), '1005');
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), status: 'edited' }, catalog)).map(x => x.id).join(','), '1005');
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), status: 'pending' }, catalog)).map(x => x.id).join(','), '1003');
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), agent: 'Rahim' }, catalog)).length, 2);
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), search: 'galaxy a15' }, catalog)).map(x => x.id).join(','), '1004');
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), search: 'vip buyer' }, catalog)).map(x => x.id).join(','), '1003');
        assert.equal(txs.filter(tx => matchesLedgerFilters(tx, { ...createDefaultLedgerFilters(), search: 'RCP-101' }, catalog)).map(x => x.id).join(','), '1001');

        // Sorting
        assert.deepEqual(sortLedgerTransactions(txs.slice(0, 4), 'newest').map(x => x.id), [1005, 1004, 1003, 1001]);
        assert.deepEqual(sortLedgerTransactions(txs.slice(0, 4), 'oldest').map(x => x.id), [1001, 1003, 1004, 1005]);
        assert.deepEqual(sortLedgerTransactions(txs.slice(0, 4), 'amount_desc').map(x => x.id), [1004, 1005, 1001, 1003]);
        assert.deepEqual(sortLedgerTransactions(txs.slice(0, 4), 'amount_asc').map(x => x.id), [1003, 1001, 1005, 1004]);

        // Totals & active filter counters
        assert.equal(computeFilteredLedgerTotal([txs[0], txs[1]], 'all'), 450);
        assert.equal(computeFilteredLedgerTotal([txs[0], txs[1]], 'Cash'), 250);
        assert.equal(computeFilteredLedgerTotal([txs[1], txs[2]], 'MFS'), 300);
        assert.equal(countActiveAdvancedFilters(createDefaultLedgerFilters()), 0);
        assert.equal(countActiveAdvancedFilters({ payment: 'Cash', status: 'edited', agent: 'Rahim', sort: 'amount_desc' }), 4);
        assert.equal(isLedgerFiltered(createDefaultLedgerFilters()), false);
        assert.equal(isLedgerFiltered({ ...createDefaultLedgerFilters(), search: 'prime' }), true);

        // Agent extraction excludes deleted rows and deduplicates case-insensitively
        assert.deepEqual(extractLedgerAgents(txs), ['Karim', 'Nadia', 'Rahim']);
    });

    await t.test('9. Store Catalog Scoped Category Switching, In-Stock Filter & Reset', () => {
        setupDomGlobals();

        const makeCard = (name, trackAs, price, locked = false) => {
            const card = createMockElement('', ['store-item-row', ...(locked ? ['is-locked'] : [])]);
            card.setAttribute('data-item-name', name);
            card.setAttribute('data-track-as', trackAs);
            card.setAttribute('data-price', String(price));
            const titleEl = createMockElement('', ['store-item-name']);
            titleEl.innerText = name;
            card.querySelector = (sel) => (sel === '.store-item-name' ? titleEl : null);
            return card;
        };

        const sim1 = makeCard('Prime', 'GP SIM', 300, false);
        const sim2 = makeCard('Skitto', 'Skitto SIM', 300, true);
        const card1 = makeCard('50 Tk Scratch Card', '', 50, false);

        const groupSim = createMockElement('cat-new-sim', ['store-cat-group']);
        groupSim.querySelectorAll = (sel) => (sel === '.store-item-row' ? [sim1, sim2] : []);
        const groupCards = createMockElement('cat-cards', ['store-cat-group']);
        groupCards.querySelectorAll = (sel) => (sel === '.store-item-row' ? [card1] : []);

        const storePillAll = createMockElement('', ['store-pill']);
        storePillAll.setAttribute('data-store-cat', 'cat-all');
        const storePillSim = createMockElement('', ['store-pill', 'active']);
        storePillSim.setAttribute('data-store-cat', 'cat-new-sim');
        const recyclePill = createMockElement('recycle-pill-all', ['store-pill', 'active']);
        recyclePill.setAttribute('data-recycle-status', 'all');

        const storeSearch = createMockElement('store-search');
        const storeClear = createMockElement('store-search-clear');
        const pillsWrap = createMockElement('store-pills-container');
        const activeCat = createMockElement('store-active-category');
        activeCat.value = 'cat-new-sim';
        const inStockBtn = createMockElement('store-instock-toggle', ['store-instock-btn']);
        const countBar = createMockElement('store-count-bar');
        const noResults = createMockElement('store-no-results');

        elementRegistry.set('store-search', storeSearch);
        elementRegistry.set('store-search-clear', storeClear);
        elementRegistry.set('store-pills-container', pillsWrap);
        elementRegistry.set('store-active-category', activeCat);
        elementRegistry.set('store-instock-toggle', inStockBtn);
        elementRegistry.set('store-count-bar', countBar);
        elementRegistry.set('store-no-results', noResults);

        globalThis.document.querySelectorAll = (sel) => {
            if (sel === '#store-pills-container .store-pill') return [storePillAll, storePillSim];
            if (sel === '.store-cat-group') return [groupSim, groupCards];
            return [];
        };

        // Scoped switchStoreCategory must NOT clear recycle tracker pills!
        globalThis.window.filterStoreCatalog = filterStoreCatalog;
        switchStoreCategory('cat-all', storePillAll);
        assert.equal(activeCat.value, 'cat-all');
        assert.equal(storePillAll.classList.contains('active'), true);
        assert.equal(storePillAll.getAttribute('aria-pressed'), 'true');
        assert.equal(recyclePill.classList.contains('active'), true);
        assert.equal(groupSim.style.display, 'block');
        assert.equal(groupCards.style.display, 'block');

        // Toggle In Stock hides OOS Skitto SIM
        toggleStoreInStockFilter();
        assert.equal(inStockBtn.classList.contains('active'), true);
        assert.equal(inStockBtn.getAttribute('aria-pressed'), 'true');
        assert.equal(sim1.style.display, 'flex');
        assert.equal(sim2.style.display, 'none');
        assert.equal(card1.style.display, 'flex');
        assert.match(countBar.innerHTML, /Showing 2 of 3 items \(In Stock\)/);

        // Multi-field search by price matches 50 Tk Scratch Card across stock
        storeSearch.value = '50';
        filterStoreCatalog();
        assert.equal(sim1.style.display, 'none');
        assert.equal(card1.style.display, 'flex');

        // Reset clears search & In Stock while keeping All category intact
        resetStoreFilters();
        assert.equal(storeSearch.value, '');
        assert.equal(inStockBtn.classList.contains('active'), false);
        assert.equal(sim2.style.display, 'flex');
    });

    await t.test('10. Upgraded Filtering HTML, CSS & Feature Module Contracts (Ledger, Admin, Recycle, Rates)', () => {
        // Desk & Personal Ledger Filter Bars
        for (const prefix of ['desk', 'personal']) {
            assert.match(indexHtml, new RegExp(`id="${prefix}-ledger-search"`));
            assert.match(indexHtml, new RegExp(`id="${prefix}-filter-toggle"`));
            assert.match(indexHtml, new RegExp(`id="${prefix}-filter-badge"`));
            assert.match(indexHtml, new RegExp(`id="${prefix}-advanced-filters"`));
            assert.match(indexHtml, new RegExp(`id="${prefix}-agent-filter"`));
            assert.match(indexHtml, new RegExp(`id="${prefix}-sort-filter"`));
        }
        assert.match(indexHtml, /data-pay-filter="Split"/);
        assert.match(indexHtml, /data-status-filter="incomplete_onboarding"/);
        assert.match(indexHtml, /data-status-filter="edited"/);
        assert.match(indexHtml, /data-status-filter="pending"/);

        // Store, Admin, Recycle & Rates Filter Controls
        assert.match(indexHtml, /id="store-instock-toggle"/);
        assert.match(indexHtml, /data-store-cat="cat-all"/);
        assert.match(indexHtml, /id="store-count-bar"/);
        assert.match(indexHtml, /id="admin-catalog-filter-pills"/);
        assert.match(indexHtml, /id="admin-catalog-count-bar"/);
        assert.match(indexHtml, /id="recycle-pill-followup"/);
        assert.match(indexHtml, /id="recycle-followup-count"/);
        assert.match(indexHtml, /id="rates-type-filter-pills"/);
        assert.match(indexHtml, /data-rate-type="anynet"/);
        assert.match(indexHtml, /data-rate-type="fnf"/);
        assert.match(indexHtml, /data-rate-type="sms"/);

        // Feature logic & main.js global bindings
        assert.match(adminJs, /filterAdminCatalogByCategory/);
        assert.match(adminJs, /resetAdminCatalogFilters/);
        assert.doesNotMatch(adminJs, /border-left:\s*4px\s+solid/);
        assert.match(ratesJs, /filterRatesByType/);
        assert.match(ratesJs, /resetRatesFilters/);
        assert.match(recycleJs, /activeFilterStatus === 'needs_call'/);
        assert.match(recycleJs, /recycle-followup-count/);
        assert.match(styleCss, /\.ledger-advanced-panel\b/);
        assert.match(styleCss, /\.ledger-seg-btn\.active\b/);
        assert.match(styleCss, /\.store-instock-btn\.active\b/);
        assert.match(styleCss, /\.recycle-pill-badge\b/);

        for (const fn of [
            'setLedgerSearch',
            'clearLedgerSearch',
            'toggleLedgerFilters',
            'setLedgerPaymentFilter',
            'setLedgerStatusFilter',
            'setLedgerAgentFilter',
            'setLedgerSortFilter',
            'toggleStoreInStockFilter',
            'resetStoreFilters',
            'filterAdminCatalogByCategory',
            'resetAdminCatalogFilters',
            'filterRatesByType',
            'resetRatesFilters',
            'setEditPaymentMethod'
        ]) {
            assert.match(mainJs, new RegExp(`\\b${fn}\\b`));
        }
    });

    await t.test('11. Transaction Edit Flow (String-ID Lookup, Role Check, Split Math, Onboarding & Validation)', async () => {
        setupDomGlobals();

        const modalEdit = createMockElement('modal-edit-tx', ['modal-overlay']);
        const modalAlert = createMockElement('modal-app-alert', ['modal-overlay']);
        const alertTitle = createMockElement('app-alert-title');
        const alertMsg = createMockElement('app-alert-message');
        const alertCancel = createMockElement('app-alert-cancel');
        const alertConfirm = createMockElement('app-alert-confirm');
        const alertIcon = createMockElement('app-alert-icon');
        const editName = createMockElement('edit-tx-name');
        const editMeta = createMockElement('edit-tx-meta');
        const editQty = createMockElement('edit-tx-qty');
        const editAmt = createMockElement('edit-tx-amount');
        const editPay = createMockElement('edit-tx-payment');
        const editSplitFields = createMockElement('edit-split-fields');
        const editCash = createMockElement('edit-tx-cash');
        const editMfs = createMockElement('edit-tx-mfs');
        const editNotes = createMockElement('edit-tx-notes');
        const editOnboarding = createMockElement('edit-tx-onboarding-section');
        const editFirstCall = createMockElement('edit-tx-firstcall');
        const editAppReg = createMockElement('edit-tx-appreg');
        const editAppLabel = createMockElement('edit-tx-appreg-label');
        const submitBtn = createMockElement('', ['btn-primary-full']);

        const payCashBtn = createMockElement('', ['edit-pay-btn']);
        payCashBtn.setAttribute('data-edit-pay', 'Cash');
        const payMfsBtn = createMockElement('', ['edit-pay-btn']);
        payMfsBtn.setAttribute('data-edit-pay', 'MFS');
        const paySplitBtn = createMockElement('', ['edit-pay-btn']);
        paySplitBtn.setAttribute('data-edit-pay', 'Split');

        elementRegistry.set('modal-edit-tx', modalEdit);
        elementRegistry.set('modal-app-alert', modalAlert);
        elementRegistry.set('app-alert-title', alertTitle);
        elementRegistry.set('app-alert-message', alertMsg);
        elementRegistry.set('app-alert-cancel', alertCancel);
        elementRegistry.set('app-alert-confirm', alertConfirm);
        elementRegistry.set('app-alert-icon', alertIcon);
        elementRegistry.set('edit-tx-name', editName);
        elementRegistry.set('edit-tx-meta', editMeta);
        elementRegistry.set('edit-tx-qty', editQty);
        elementRegistry.set('edit-tx-amount', editAmt);
        elementRegistry.set('edit-tx-payment', editPay);
        elementRegistry.set('edit-split-fields', editSplitFields);
        elementRegistry.set('edit-tx-cash', editCash);
        elementRegistry.set('edit-tx-mfs', editMfs);
        elementRegistry.set('edit-tx-notes', editNotes);
        elementRegistry.set('edit-tx-onboarding-section', editOnboarding);
        elementRegistry.set('edit-tx-firstcall', editFirstCall);
        elementRegistry.set('edit-tx-appreg', editAppReg);
        elementRegistry.set('edit-tx-appreg-label', editAppLabel);

        globalThis.document.querySelector = (sel) => (sel === '#modal-edit-tx .btn-primary-full' ? submitBtn : null);
        globalThis.document.querySelectorAll = (sel) => (sel === '#modal-edit-tx [data-edit-pay]' ? [payCashBtn, payMfsBtn, paySplitBtn] : []);

        AppState.currentUser = { uid: 'uid_agent_1' };
        AppState.currentUserRole = 'user';
        AppState.userDisplayName = 'Rahim';
        AppState.globalCatalog = {
            card_50: { name: '50 Tk Scratch Card', price: 50, cat: 'cards' },
            sim_prime: { name: 'Prime', price: 300, cat: 'new-sim' }
        };
        AppState.globalInventoryGroups = [];

        const simTx = {
            id: 1731740000123,
            docId: 'doc_sim_1',
            type: 'Item',
            name: 'Prime',
            qty: 1,
            amount: 300,
            payment: 'Cash',
            cashAmt: 300,
            mfsAmt: 0,
            agentId: 'uid_agent_1',
            agentName: 'Rahim',
            receiptNo: 'RCP-77',
            time: '10:15',
            onboarding: { firstCall: true, appReg: false },
            notes: 'Regular customer'
        };
        const peerTx = {
            id: 1731740000456,
            docId: 'doc_peer_1',
            type: 'Item',
            name: '50 Tk Scratch Card',
            qty: 2,
            amount: 100,
            payment: 'Cash',
            agentId: 'uid_agent_2',
            agentName: 'Karim'
        };
        const cardTx = {
            id: 1731740000789,
            docId: 'doc_card_1',
            type: 'Item',
            name: '50 Tk Scratch Card',
            qty: 2,
            amount: 100,
            payment: 'Cash',
            agentId: 'uid_agent_1',
            agentName: 'Rahim'
        };
        AppState.transactions = [simTx, peerTx, cardTx];

        // 1. Opening edit modal with a STRING ID (as emitted by HTML onclick handlers) must work!
        openEditTx(String(simTx.id));
        assert.equal(modalEdit.classList.contains('active'), true);
        assert.equal(AppState.ui.currentEditTxId, simTx.id);
        assert.equal(editName.innerText, 'Edit: Prime');
        assert.match(editMeta.innerText, /#RCP-77/);
        assert.equal(editQty.disabled, true, 'Single-unit SIM sale keeps qty locked at 1');
        assert.equal(editOnboarding.style.display, 'block');
        assert.equal(editFirstCall.checked, true);
        assert.equal(editAppReg.checked, false);
        assert.equal(editNotes.value, 'Regular customer');
        assert.equal(payCashBtn.classList.contains('active'), true);

        // 2. Switching to Split updates UI and calculates balanced cash/mfs portions
        setEditPaymentMethod('Split');
        assert.equal(editPay.value, 'Split');
        assert.equal(paySplitBtn.classList.contains('active'), true);
        assert.equal(editSplitFields.style.display, 'flex');
        assert.equal(editCash.value, 300);
        assert.equal(editMfs.value, 0);

        editCash.value = '120';
        updateSplitTotal();
        assert.equal(editMfs.value, 180);

        cancelTxEdit();
        assert.equal(modalEdit.classList.contains('active'), false);
        assert.equal(AppState.ui.currentEditTxId, null);

        // 3. Multi-qty card enables qty & autoCalcEditTotal scales Total Tk
        openEditTx(String(cardTx.id));
        assert.equal(editQty.disabled, false);
        assert.equal(editOnboarding.style.display, 'none');
        editQty.value = '4';
        autoCalcEditTotal();
        assert.equal(editAmt.value, 200);

        // 4. Empty Total Tk must trigger validation error instead of silently turning into 0
        editAmt.value = '';
        await saveTxEdit();
        assert.equal(editAmt.classList.contains('input-error'), true);
        assert.equal(modalAlert.classList.contains('active'), true);
        assert.equal(alertTitle.innerText, 'Invalid Edit');
        modalAlert.classList.remove('active');

        // 5. Unauthorized agent cannot edit peer agent's transaction
        assert.equal(isTransactionModifiable(peerTx, 'edit'), false);
        assert.equal(modalAlert.classList.contains('active'), true);
        assert.match(alertMsg.innerText, /only edit transactions that you created/i);
        modalAlert.classList.remove('active');

        // Manager IS allowed to edit peer agent's transaction
        AppState.currentUserRole = 'center_manager';
        assert.equal(isTransactionModifiable(peerTx, 'edit'), true);
        cancelTxEdit();
    });
});
