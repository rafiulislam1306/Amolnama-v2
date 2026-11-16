// tests/profile-hub.test.mjs
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
        type: 'text',
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
            if (globalThis.document) globalThis.document.activeElement = this;
        },
        wasFocused() { return focused; },
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
    Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: () => false, onLine: true },
        configurable: true
    });
    const storage = new Map();
    globalThis.localStorage = {
        getItem: (k) => storage.has(k) ? storage.get(k) : null,
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k)
    };
    globalThis.requestAnimationFrame = (cb) => cb();
    globalThis.window = {
        Amolnama: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        matchMedia: () => ({ matches: false, addEventListener: () => {} }),
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' })
    };
    globalThis.document = {
        documentElement: createMockElement('html'),
        body: createMockElement('body'),
        activeElement: null,
        getElementById: (id) => elementRegistry.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => createMockElement('created'),
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    globalThis.document.activeElement = globalThis.document.body;
}

setupDomGlobals();

const { togglePinVisibility, toggleDarkMode, applyTheme, isDarkModeActive, initTheme } = await import('../src/features/auth.js');
const { getRecycleAttentionCount, clearRecycleSearch, resetRecycleFilters } = await import('../src/features/recycle.js');
const { clearRatesSearch, clearManageRatesSearch } = await import('../src/features/rates.js');
const { renderUsersList, filterUsersByRole, clearUsersSearch, clearAdminSearch } = await import('../src/features/admin.js');
const { formatLocalISODate } = await import('../src/utils/helpers.js');

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const styleCss = fs.readFileSync(path.join(rootDir, 'src', 'style.css'), 'utf-8');
const mainJs = fs.readFileSync(path.join(rootDir, 'src', 'main.js'), 'utf-8');
const adminJs = fs.readFileSync(path.join(rootDir, 'src', 'features', 'admin.js'), 'utf-8');

test('Profile Hub & Sub-Modals Suite', async (t) => {
    await t.test('1. Static HTML/CSS/JS accessibility, border discipline & global exports', () => {
        // Header profile trigger keyboard semantics & broken image fallback
        assert.match(indexHtml, /class="header-profile-trigger"[^>]*role="button"[^>]*tabindex="0"/);
        assert.match(indexHtml, /id="header-user-photo"[^>]*referrerpolicy="no-referrer"/);

        // Profile Hub menu rows are semantic <button type="button"> elements
        const hubStart = indexHtml.indexOf('id="modal-profile-hub"');
        const hubEnd = indexHtml.indexOf('<!-- ADMIN SETTINGS MODAL');
        const hubSection = indexHtml.slice(hubStart, hubEnd);
        assert.doesNotMatch(hubSection, /<div[^>]*class="hub-menu-row"/);
        const buttonRows = hubSection.match(/<button\s+type="button"[^>]*class="hub-menu-row[^"]*"/g) || [];
        assert.equal(buttonRows.length, 7, 'Profile Hub should render all 7 action/toggle items as semantic buttons');
        assert.match(hubSection, /id="hub-recycle-attention-badge"/);
        assert.match(hubSection, /id="hub-copy-session-btn"/);
        assert.match(hubSection, /id="hub-theme-toggle"/);
        assert.match(hubSection, /role="switch"/);

        // Desktop override keeps zero-padding flush header on #modal-profile-hub .bottom-sheet
        assert.match(styleCss, /#modal-profile-hub\s+\.bottom-sheet\s*\{[^}]*padding:\s*0\s*!important/);
        assert.match(styleCss, /:root\[data-theme="dark"\]/);
        assert.match(styleCss, /\.hub-switch-track\b/);

        // Clean border discipline (zero border-left: 4px solid anywhere in admin.js or style.css)
        assert.doesNotMatch(adminJs, /border-left:\s*4px\s+solid/);
        assert.doesNotMatch(styleCss, /border-left:\s*4px\s+solid/);

        // Required sub-modal UX elements
        assert.match(indexHtml, /id="users-search-clear"/);
        assert.match(indexHtml, /id="users-count-bar"/);
        assert.match(indexHtml, /id="admin-search-clear"/);
        assert.match(indexHtml, /id="admin-save-settings-btn"/);
        assert.match(indexHtml, /id="recycle-search-clear"/);
        assert.match(indexHtml, /id="recycle-count-bar"/);
        assert.match(indexHtml, /id="rates-search-clear"/);
        assert.match(indexHtml, /id="rates-count-bar"/);
        assert.match(indexHtml, /id="manage-rates-search-clear"/);
        assert.match(indexHtml, /id="status-update-call-link"/);
        assert.match(indexHtml, /id="status-update-history-section"/);
        assert.match(indexHtml, /class="pin-toggle-btn"/);

        // Every Amolnama.* handler invoked from HTML/JS templates is wired in main.js
        const requiredExports = [
            'copyActiveSessionId',
            'toggleDarkMode',
            'applyTheme',
            'initTheme',
            'togglePinVisibility',
            'clearRecycleSearch',
            'resetRecycleFilters',
            'clearRatesSearch',
            'renderManageRatesDashboard',
            'clearManageRatesSearch',
            'clearAdminSearch',
            'filterUsersList',
            'clearUsersSearch',
            'filterUsersByRole',
            'resetUsersFilters'
        ];
        requiredExports.forEach(fnName => {
            assert.match(mainJs, new RegExp(`\\b${fnName}\\b`), `src/main.js must import and expose ${fnName}`);
        });
    });

    await t.test('2. togglePinVisibility toggles input type and accessible button state', () => {
        setupDomGlobals();
        const pinInput = createMockElement('link-pin-input');
        pinInput.type = 'password';
        const toggleBtn = createMockElement('toggle-btn');
        toggleBtn.setAttribute('aria-label', 'Show PIN');
        elementRegistry.set('link-pin-input', pinInput);

        togglePinVisibility('link-pin-input', toggleBtn);
        assert.equal(pinInput.type, 'text');
        assert.equal(toggleBtn.getAttribute('aria-label'), 'Hide PIN');

        togglePinVisibility('link-pin-input', toggleBtn);
        assert.equal(pinInput.type, 'password');
        assert.equal(toggleBtn.getAttribute('aria-label'), 'Show PIN');
    });

    await t.test('3. getRecycleAttentionCount accurately identifies actionable recycle entries', () => {
        const todayIso = formatLocalISODate(new Date());
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 5);
        const futureIso = formatLocalISODate(futureDate);
        const staleContact = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
        const recentContact = new Date().toISOString();

        const sample = [
            { id: '1', status: 'arrived', lastContactedAt: recentContact }, // 1: arrived always needs action
            { id: '2', status: 'scheduled', followUpDate: todayIso, lastContactedAt: recentContact }, // 2: scheduled today
            { id: '3', status: 'scheduled', followUpDate: futureIso, lastContactedAt: staleContact }, // 3: overdue contact (>=7d)
            { id: '4', status: 'scheduled', followUpDate: futureIso, lastContactedAt: recentContact }, // ignored (future & recently contacted)
            { id: '5', status: 'applied' }, // ignored
            { id: '6', status: 'completed' }, // ignored
            { id: '7', status: 'cancelled' } // ignored
        ];

        assert.equal(getRecycleAttentionCount(sample), 3);
        assert.equal(getRecycleAttentionCount([]), 0);
    });

    await t.test('4. Search clear helpers clear input text and clear-button visibility', () => {
        setupDomGlobals();
        const recycleSearch = createMockElement('recycle-search');
        recycleSearch.value = '01711';
        const recycleClear = createMockElement('recycle-search-clear', ['visible']);
        const ratesSearch = createMockElement('rates-search');
        ratesSearch.value = 'MyGP';
        const ratesClear = createMockElement('rates-search-clear', ['visible']);
        const manageSearch = createMockElement('manage-rates-search');
        manageSearch.value = 'Nischinto';
        const manageClear = createMockElement('manage-rates-search-clear', ['visible']);
        const adminSearch = createMockElement('admin-search');
        adminSearch.value = 'Prime';
        const adminClear = createMockElement('admin-search-clear', ['visible']);

        elementRegistry.set('recycle-search', recycleSearch);
        elementRegistry.set('recycle-search-clear', recycleClear);
        elementRegistry.set('rates-search', ratesSearch);
        elementRegistry.set('rates-search-clear', ratesClear);
        elementRegistry.set('manage-rates-search', manageSearch);
        elementRegistry.set('manage-rates-search-clear', manageClear);
        elementRegistry.set('admin-search', adminSearch);
        elementRegistry.set('admin-search-clear', adminClear);

        clearRecycleSearch();
        assert.equal(recycleSearch.value, '');
        assert.equal(recycleClear.classList.contains('visible'), false);
        assert.equal(recycleSearch.wasFocused(), true);

        recycleSearch.value = '01722';
        resetRecycleFilters();
        assert.equal(recycleSearch.value, '');

        clearRatesSearch();
        assert.equal(ratesSearch.value, '');
        assert.equal(ratesClear.classList.contains('visible'), false);

        clearManageRatesSearch();
        assert.equal(manageSearch.value, '');
        assert.equal(manageClear.classList.contains('visible'), false);

        clearAdminSearch();
        assert.equal(adminSearch.value, '');
        assert.equal(adminClear.classList.contains('visible'), false);
    });

    await t.test('5. User Management search & role filters render scoped cards and dirty badges', () => {
        setupDomGlobals();
        const container = createMockElement('nickname-list-container');
        const searchInput = createMockElement('users-search');
        const clearBtn = createMockElement('users-search-clear');
        const countBar = createMockElement('users-count-bar');

        elementRegistry.set('nickname-list-container', container);
        elementRegistry.set('users-search', searchInput);
        elementRegistry.set('users-search-clear', clearBtn);
        elementRegistry.set('users-count-bar', countBar);

        const users = [
            { id: 'u111111', email: 'alice@example.com', nickname: 'Alice', role: 'user', canPerformCashActions: false },
            { id: 'u222222', email: 'phone_01712345678@amolnama.internal', nickname: 'Bob', role: 'manager', canPerformCashActions: true },
            { id: 'u333333', email: 'admin@example.com', nickname: 'RootAdmin', role: 'admin', canPerformCashActions: true }
        ];

        renderUsersList(users);
        assert.match(container.innerHTML, /alice@example\.com/);
        assert.match(container.innerHTML, /Phone: 01712345678/);
        assert.match(container.innerHTML, /user-dirty-badge/);
        assert.match(countBar.innerHTML, /3 registered staff/);

        // Role filter: managers (manager + center_manager)
        filterUsersByRole('managers');
        assert.doesNotMatch(container.innerHTML, /alice@example\.com/);
        assert.match(container.innerHTML, /Phone: 01712345678/);
        assert.match(countBar.innerHTML, /Showing 1 of 3 staff/);

        // Reset back to all and test search filter
        filterUsersByRole('all');
        searchInput.value = 'alice';
        renderUsersList();
        assert.match(container.innerHTML, /alice@example\.com/);
        assert.doesNotMatch(container.innerHTML, /RootAdmin/);
        assert.equal(clearBtn.classList.contains('visible'), true);

        clearUsersSearch();
        assert.equal(searchInput.value, '');
        assert.equal(clearBtn.classList.contains('visible'), false);
    });

    await t.test('6. Global Dark Mode toggle switches data-theme, persists preference, and syncs UI', () => {
        setupDomGlobals();
        const toggleBtn = createMockElement('hub-theme-toggle');
        const trackEl = createMockElement('hub-theme-switch-track', ['hub-switch-track']);
        const descEl = createMockElement('hub-theme-desc');
        const iconEl = createMockElement('hub-theme-icon');
        const metaTheme = createMockElement('meta-theme');

        elementRegistry.set('hub-theme-toggle', toggleBtn);
        elementRegistry.set('hub-theme-switch-track', trackEl);
        elementRegistry.set('hub-theme-desc', descEl);
        elementRegistry.set('hub-theme-icon', iconEl);
        globalThis.document.querySelector = (sel) => sel === 'meta[name="theme-color"]' ? metaTheme : null;

        assert.equal(isDarkModeActive(), false);

        const next = toggleDarkMode();
        assert.equal(next, 'dark');
        assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'dark');
        assert.equal(globalThis.document.documentElement.style.colorScheme, 'dark');
        assert.equal(localStorage.getItem('amolnama_theme'), 'dark');
        assert.equal(metaTheme.getAttribute('content'), '#0e1621');
        assert.equal(toggleBtn.getAttribute('aria-checked'), 'true');
        assert.equal(trackEl.classList.contains('is-on'), true);
        assert.equal(descEl.innerText, 'Dark theme active');

        // Re-initializing restores stored dark preference
        globalThis.document.documentElement = createMockElement('html');
        initTheme();
        assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'dark');

        // Toggling back returns to light theme
        const light = toggleDarkMode();
        assert.equal(light, 'light');
        assert.equal(globalThis.document.documentElement.getAttribute('data-theme'), 'light');
        assert.equal(globalThis.document.documentElement.style.colorScheme, 'light');
        assert.equal(localStorage.getItem('amolnama_theme'), 'light');
        assert.equal(toggleBtn.getAttribute('aria-checked'), 'false');
        assert.equal(trackEl.classList.contains('is-on'), false);
        assert.equal(descEl.innerText, 'Light theme active');
    });
});
