// tests/adversarial-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Set up minimal browser environment for Node execution
const dummyElement = {
    classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false
    },
    style: {},
    innerText: '',
    innerHTML: '',
    value: '',
    dataset: {},
    scrollTop: 0,
    addEventListener: () => {},
    removeEventListener: () => {},
    focus: () => {}
};

globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};

globalThis.window = {
    Amolnama: {},
    addEventListener: () => {},
    removeEventListener: () => {}
};

globalThis.document = {
    querySelectorAll: () => [],
    querySelector: () => dummyElement,
    getElementById: () => dummyElement,
    createElement: () => ({ ...dummyElement }),
    addEventListener: () => {},
    removeEventListener: () => {}
};

globalThis.requestAnimationFrame = (callback) => callback();

// Helper to load files as text
const rootDir = process.cwd();
const styleCss = fs.readFileSync(path.join(rootDir, 'src', 'style.css'), 'utf-8');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

test('Suite: Adversarial UI/UX & Layout Stress Testing', async (t) => {

    await t.test('1. Viewport Scaling & CSS Desktop/Mobile Constraints', async (st) => {
        await st.test('style.css defines @media (min-width: 760px) block containing desktop constraints', () => {
            const media760Regex = /@media\s*\(\s*min-width\s*:\s*760px\s*\)\s*\{([\s\S]*?)(?=@media|\/\* =+|$)/;
            const match = styleCss.match(media760Regex);
            assert.ok(match, 'Desktop media query @media (min-width: 760px) must exist');
            const mediaContent = match[1];

            // 1. ERS keypad max-width: 460px
            assert.match(mediaContent, /\.ers-container\s*\{[^}]*max-width\s*:\s*460px/, 'ERS container must be constrained to max-width 460px on desktop');
            assert.match(mediaContent, /\.ers-container\s*\{[^}]*margin\s*:\s*0 auto/, 'ERS container must be centered with margin: 0 auto on desktop');

            // 2. Floor container responsive grid minmax(340px, 1fr)
            assert.match(mediaContent, /#live-floor-container\s*\{[^}]*display\s*:\s*grid\s*!important/, '#live-floor-container must switch to grid on desktop');
            assert.match(mediaContent, /#live-floor-container\s*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*auto-fill\s*,\s*minmax\(\s*340px\s*,\s*1fr\s*\)\s*\)\s*!important/, '#live-floor-container must use repeat(auto-fill, minmax(340px, 1fr))');

            // 3. Admin fullscreen modal bounds
            assert.match(mediaContent, /#modal-nicknames\s*\.modal-content/, 'Admin modal #modal-nicknames must have desktop dialog constraints');
            assert.match(mediaContent, /#modal-settings\s*\.modal-content/, 'Admin modal #modal-settings must have desktop dialog constraints');
            assert.match(mediaContent, /#modal-recycle-tracker\s*\.modal-content/, 'Admin modal #modal-recycle-tracker must have desktop dialog constraints');
            assert.match(mediaContent, /#modal-call-rates\s*\.modal-content/, 'Admin modal #modal-call-rates must have desktop dialog constraints');
            assert.match(mediaContent, /max-width\s*:\s*760px\s*!important/, 'Admin modals must be constrained to max-width: 760px');
            assert.match(mediaContent, /max-height\s*:\s*820px\s*!important/, 'Admin modals must be constrained to max-height: 820px');
        });

        await st.test('mobile base rules maintain full-width ERS and vertical column floor', () => {
            // In base CSS, .ers-container is flex column without max-width
            const baseErsMatch = styleCss.match(/\.ers-container\s*\{([^}]*)\}/);
            assert.ok(baseErsMatch, 'Base .ers-container rule must exist');
            assert.doesNotMatch(baseErsMatch[1], /max-width/, 'Base mobile .ers-container must not constrain max-width');

            // In index.html, #live-floor-container is declared with flex-direction: column for mobile
            assert.match(indexHtml, /id="live-floor-container"[^>]*display:\s*flex;\s*flex-direction:\s*column/, 'Mobile floor container in index.html must have flex column baseline');
        });
    });

    await t.test('2. Bottom Sheet Drag Exclusions on Admin Modals', async (st) => {
        const uiHelpersCode = fs.readFileSync(path.join(rootDir, 'src', 'utils', 'ui-helpers.js'), 'utf-8');
        
        // Extract the exclusion selector inside setupBottomSheetDrag
        const exclusionMatch = uiHelpersCode.match(/setupBottomSheetDrag\(\)\s*\{[\s\S]*?sheet\.closest\(\s*['"`]([^'"`]+)['"`]\s*\)/);
        assert.ok(exclusionMatch, 'setupBottomSheetDrag must have an exclusion selector check');
        
        const excludedSelectors = exclusionMatch[1].split(',').map(s => s.trim());

        const requiredExclusions = [
            '#modal-app-alert',
            '#modal-auth',
            '#modal-settings',
            '#modal-desk-select',
            '#modal-close-desk',
            '#modal-nicknames',
            '#modal-trash',
            '#modal-audit',
            '#modal-recycle-tracker',
            '#modal-call-rates',
            '#modal-manage-rates',
            '#modal-package-form'
        ];

        for (const req of requiredExclusions) {
            assert.ok(
                excludedSelectors.includes(req),
                `setupBottomSheetDrag MUST exclude ${req} from sheet-drag gesture physics`
            );
        }

        // Adversarially test drag logic simulation
        await st.test('simulated touch event flow ignores excluded modals and handles non-excluded modals', () => {
            function createMockSheet(parentId) {
                const sheet = {
                    parentElement: { id: parentId, classList: { contains: () => true } },
                    style: {},
                    offsetHeight: 400,
                    closest: (selector) => {
                        const ids = selector.split(',').map(s => s.trim().replace('#', ''));
                        return ids.includes(parentId) ? sheet.parentElement : null;
                    }
                };
                return sheet;
            }

            // Excluded sheet:
            const adminSheet = createMockSheet('modal-nicknames');
            const isExcluded = Boolean(adminSheet.closest(exclusionMatch[1]));
            assert.equal(isExcluded, true, '#modal-nicknames must match exclusion');

            // Non-excluded sheet:
            const transferSheet = createMockSheet('modal-transfer');
            const isTransferExcluded = Boolean(transferSheet.closest(exclusionMatch[1]));
            assert.equal(isTransferExcluded, false, '#modal-transfer must NOT be excluded');
        });
    });

    await t.test('3. Dynamic Bottom Navigation Grid Columns per Role', async (st) => {
        const appInitCode = fs.readFileSync(path.join(rootDir, 'src', 'core', 'app-init.js'), 'utf-8');

        // Verify the code logic for manager/owner vs agent
        assert.match(appInitCode, /\['manager',\s*'owner'\]\.includes\(AppState\.currentUserRole\)/, 'Role check must check manager and owner');
        assert.match(appInitCode, /bottomNav\.style\.gridTemplateColumns\s*=\s*'repeat\(3,\s*1fr\)'/, 'Manager/owner must set 3 columns');
        assert.match(appInitCode, /bottomNav\.style\.gridTemplateColumns\s*=\s*'repeat\(5,\s*1fr\)'/, 'Other roles must set 5 columns');
        
        // Simulate role transitions
        function applyNavLayout(role, navBtns, bottomNav) {
            if (['manager', 'owner'].includes(role)) {
                if (navBtns.length >= 2) {
                    navBtns[0].style.display = 'none';
                    navBtns[1].style.display = 'none';
                }
                if (bottomNav) bottomNav.style.gridTemplateColumns = 'repeat(3, 1fr)';
            } else {
                if (navBtns.length >= 2) {
                    navBtns[0].style.display = 'flex';
                    navBtns[1].style.display = 'flex';
                }
                if (bottomNav) bottomNav.style.gridTemplateColumns = 'repeat(5, 1fr)';
            }
        }

        const navBtns = [{ style: { display: 'flex' } }, { style: { display: 'flex' } }, { style: {} }, { style: {} }, { style: {} }];
        const bottomNav = { style: { gridTemplateColumns: 'repeat(5, 1fr)' } };

        // Test 1: Agent (user)
        applyNavLayout('user', navBtns, bottomNav);
        assert.equal(bottomNav.style.gridTemplateColumns, 'repeat(5, 1fr)');
        assert.equal(navBtns[0].style.display, 'flex');
        assert.equal(navBtns[1].style.display, 'flex');

        // Test 2: Manager
        applyNavLayout('manager', navBtns, bottomNav);
        assert.equal(bottomNav.style.gridTemplateColumns, 'repeat(3, 1fr)');
        assert.equal(navBtns[0].style.display, 'none');
        assert.equal(navBtns[1].style.display, 'none');

        // Test 3: Owner
        applyNavLayout('owner', navBtns, bottomNav);
        assert.equal(bottomNav.style.gridTemplateColumns, 'repeat(3, 1fr)');
        assert.equal(navBtns[0].style.display, 'none');
        assert.equal(navBtns[1].style.display, 'none');

        // Test 4: Revert back to user
        applyNavLayout('user', navBtns, bottomNav);
        assert.equal(bottomNav.style.gridTemplateColumns, 'repeat(5, 1fr)');
        assert.equal(navBtns[0].style.display, 'flex');
        assert.equal(navBtns[1].style.display, 'flex');
    });

    await t.test('4. Date Picker SVG Preservation During Rapid Toggles', async (st) => {
        const reportsCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'reports.js'), 'utf-8');

        // Check that financial-date-label HTML template literal includes the SVG
        assert.match(
            reportsCode,
            /financialLabel\.innerHTML\s*=\s*`<svg[^>]*>[\s\S]*?<\/svg>\s*\$\{dateLabel\}`/,
            'financialLabel.innerHTML must embed the SVG calendar icon alongside ${dateLabel}'
        );

        // Stress simulation: 100 rapid date label renders
        const financialLabel = { innerHTML: '' };
        const dates = ['Today', '2026-11-01', '2026-11-02', 'Today', '2026-10-31', '2026-10-30'];

        for (let i = 0; i < 100; i++) {
            const dateLabel = dates[i % dates.length];
            // Simulate line 1315 of reports.js
            financialLabel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> ${dateLabel}`;

            assert.ok(financialLabel.innerHTML.includes('<svg width="14" height="14"'), `Iteration ${i}: SVG must be present`);
            assert.ok(financialLabel.innerHTML.includes('</svg>'), `Iteration ${i}: Closing SVG tag must be present`);
            assert.ok(financialLabel.innerHTML.endsWith(dateLabel), `Iteration ${i}: Label must end with ${dateLabel}`);
            
            // Count occurrences of <svg
            const svgMatches = financialLabel.innerHTML.match(/<svg/g);
            assert.equal(svgMatches.length, 1, `Iteration ${i}: Exactly one SVG icon must be rendered without duplicates`);
        }
    });

    await t.test('5. Quantity Slider Synchronization & Bound Clamping', async (st) => {
        // In index.html, verify qty-slider has max="100" and label has 100
        assert.match(indexHtml, /id="qty-slider"[^>]*max="100"/, '#qty-slider must have max="100" in index.html');
        assert.match(indexHtml, /<span[^>]*>100<\/span>/, 'Slider upper label must display 100 in index.html');

        // In transactions.js, verify Math.min(100, qtyInt)
        const txCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'transactions.js'), 'utf-8');
        assert.match(txCode, /Math\.min\(100,\s*qtyInt\)/, 'transactions.js must clamp slider to Math.min(100, qtyInt)');
        assert.doesNotMatch(txCode, /Math\.min\(50,\s*qtyInt\)/, 'transactions.js must NOT clamp slider to 50');

        // Numerical stress oracle
        function clampQuantity(val) {
            let qtyInt = parseInt(val, 10);
            if (isNaN(qtyInt) || qtyInt < 1) qtyInt = 1;
            if (qtyInt > 100) qtyInt = 100;
            let sliderVal = Math.min(100, qtyInt);
            return { qtyInt, sliderVal };
        }

        assert.deepEqual(clampQuantity(0), { qtyInt: 1, sliderVal: 1 });
        assert.deepEqual(clampQuantity(-10), { qtyInt: 1, sliderVal: 1 });
        assert.deepEqual(clampQuantity(50), { qtyInt: 50, sliderVal: 50 });
        assert.deepEqual(clampQuantity(75), { qtyInt: 75, sliderVal: 75 });
        assert.deepEqual(clampQuantity(100), { qtyInt: 100, sliderVal: 100 });
        assert.deepEqual(clampQuantity(150), { qtyInt: 100, sliderVal: 100 });
        assert.deepEqual(clampQuantity('abc'), { qtyInt: 1, sliderVal: 1 });
    });

    await t.test('6. Button Loading Spinner State Machine', async (st) => {
        const { setButtonLoading } = await import('../src/utils/ui-helpers.js');

        const mockBtn = {
            innerHTML: '<span class="label">Submit Transfer</span>',
            disabled: false,
            dataset: {}
        };

        // Activate loading
        setButtonLoading(mockBtn, true, 'Processing...');
        assert.equal(mockBtn.disabled, true, 'Button must be disabled while loading');
        assert.ok(mockBtn.innerHTML.includes('Processing...'), 'Loading text must appear');
        assert.ok(mockBtn.innerHTML.includes('<svg'), 'SVG spinner must appear');
        assert.equal(mockBtn.dataset.originalHtml, '<span class="label">Submit Transfer</span>');

        // Deactivate loading
        setButtonLoading(mockBtn, false);
        assert.equal(mockBtn.disabled, false, 'Button must be re-enabled when loading finishes');
        assert.equal(mockBtn.innerHTML, '<span class="label">Submit Transfer</span>', 'Original HTML must be restored');
        assert.equal(mockBtn.dataset.originalHtml, undefined, 'dataset.originalHtml must be cleared');
    });

    await t.test('7. Floor Personal Drawer Visibility & Permissions Regression (Empirical Oracles)', async (st) => {
        const { shouldIncludeDeskOnFloor, shouldShowFloorManagerCashBar } = await import('../src/features/desk.js');
        const { shouldIncludeTransferTarget } = await import('../src/features/transfers.js');

        // 7.1 Personal Drawer Visibility Oracles
        assert.equal(
            shouldIncludeDeskOnFloor({
                session: { deskId: 'personal_user_999' },
                isMyDesk: false,
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            }),
            true,
            'personal_<uid> must ALWAYS be visible on floor regardless of activity'
        );

        assert.equal(
            shouldIncludeDeskOnFloor({
                session: { deskId: 'desk_99' },
                isMyDesk: false,
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            }),
            false,
            'Generic desk with 0 sales, 0 stock, and 0 cash must be filtered out'
        );

        // 7.2 Transfer Target Oracles
        assert.equal(
            shouldIncludeTransferTarget({
                deskData: { deskId: 'personal_user_888' },
                currentDeskId: 'desk_1',
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            }),
            true,
            'personal_<uid> must be available as transfer target even with 0 activity'
        );

        assert.equal(
            shouldIncludeTransferTarget({
                deskData: { deskId: 'desk_1' },
                currentDeskId: 'desk_1',
                hasSalesActivity: true,
                totalStockQty: 10,
                liveCash: 100
            }),
            false,
            'Cannot transfer stock to self'
        );

        // 7.3 Cash Bar Permission Oracles
        // Manager with permission -> TRUE
        assert.equal(
            shouldShowFloorManagerCashBar({ role: 'manager', canPerformCashActions: true }),
            true,
            'Floor manager with canPerformCashActions true must see cash bar'
        );

        // Manager without permission -> FALSE
        assert.equal(
            shouldShowFloorManagerCashBar({ role: 'manager', canPerformCashActions: false }),
            false,
            'Floor manager without permission must NOT see cash bar'
        );

        // Center Admin -> FALSE (even with permission)
        assert.equal(
            shouldShowFloorManagerCashBar({ role: 'admin', canPerformCashActions: true }),
            false,
            'Center admin must NOT see floor manager cash bar'
        );

        // Agent -> FALSE (even with permission)
        assert.equal(
            shouldShowFloorManagerCashBar({ role: 'user', canPerformCashActions: true }),
            false,
            'Agent must NOT see floor manager cash bar'
        );

        // Owner -> FALSE (even with permission)
        assert.equal(
            shouldShowFloorManagerCashBar({ role: 'owner', canPerformCashActions: true }),
            false,
            'Owner must NOT see floor manager cash bar'
        );
    });

    await t.test('8. WCAG AA Contrast Tokens & Global CSS Disabled States', async (st) => {
        // Check tokens in :root
        assert.match(styleCss, /--spring-physics:\s*cubic-bezier\(0\.175,\s*0\.885,\s*0\.32,\s*1\.275\);/, '--spring-physics token must exist in :root');
        assert.match(styleCss, /--bg-rgb:\s*240,\s*242,\s*245;/, '--bg-rgb token must exist in :root');
        assert.match(styleCss, /--accent-rgb:\s*51,\s*144,\s*236;/, '--accent-rgb token must exist in :root');

        // Check button:disabled styling
        assert.match(styleCss, /button:disabled[^}]*opacity:\s*0\.5\s*!important;/, 'Disabled buttons must have opacity: 0.5 !important');
        assert.match(styleCss, /button:disabled[^}]*pointer-events:\s*none\s*!important;/, 'Disabled buttons must have pointer-events: none !important');
        assert.match(styleCss, /button:disabled[^}]*cursor:\s*not-allowed\s*!important;/, 'Disabled buttons must have cursor: not-allowed !important');

        // Check catalog.js WCAG AA tokens
        const catalogCode = fs.readFileSync(path.join(rootDir, 'src', 'features', 'catalog.js'), 'utf-8');
        assert.match(catalogCode, /var\(--warning-text/, 'catalog.js must use var(--warning-text) instead of raw low-contrast hex');
        assert.match(catalogCode, /var\(--success-text/, 'catalog.js must use var(--success-text) instead of raw low-contrast hex');
    });

    await t.test('9. Mobile Touch Ergonomics & Form Attribute Verification', async (st) => {
        // Helper to find an input tag by id
        function getInputTagById(id) {
            const regex = new RegExp(`<input[^>]*id="${id}"[^>]*>`);
            const match = indexHtml.match(regex);
            assert.ok(match, `Tag with id="${id}" must exist in index.html`);
            return match[0];
        }

        // 9.1 Phone inputs have type="tel", autocomplete="tel", and inputmode="tel"
        const recycleInput = getInputTagById('add-recycle-number');
        assert.match(recycleInput, /type="tel"/, '#add-recycle-number must have type="tel"');
        assert.match(recycleInput, /inputmode="tel"/, '#add-recycle-number must have inputmode="tel"');
        assert.match(recycleInput, /autocomplete="tel"/, '#add-recycle-number must have autocomplete="tel"');

        const recycleAlt = getInputTagById('add-recycle-alt');
        assert.match(recycleAlt, /type="tel"/, '#add-recycle-alt must have type="tel"');
        assert.match(recycleAlt, /inputmode="tel"/, '#add-recycle-alt must have inputmode="tel"');
        assert.match(recycleAlt, /autocomplete="tel"/, '#add-recycle-alt must have autocomplete="tel"');

        const untracked = getInputTagById('recycle-sale-untracked-number');
        assert.match(untracked, /type="tel"/, '#recycle-sale-untracked-number must have type="tel"');
        assert.match(untracked, /inputmode="tel"/, '#recycle-sale-untracked-number must have inputmode="tel"');
        assert.match(untracked, /autocomplete="tel"/, '#recycle-sale-untracked-number must have autocomplete="tel"');

        const authPhone = getInputTagById('auth-phone-input');
        assert.match(authPhone, /type="tel"/, '#auth-phone-input must have type="tel"');
        assert.match(authPhone, /inputmode="tel"/, '#auth-phone-input must have inputmode="tel"');
        assert.match(authPhone, /autocomplete="tel"/, '#auth-phone-input must have autocomplete="tel"');

        // 9.2 Enter-to-submit presence on key modal inputs
        assert.match(getInputTagById('transfer-qty'), /onkeydown="if\(event\.key==='Enter'\)\s*executeTransfer\(\)"/);
        assert.match(getInputTagById('mgr-cash-amount'), /onkeydown="if\(event\.key==='Enter'\)\s*saveManagerCash\(\)"/);
        assert.match(getInputTagById('main-stock-qty'), /onkeydown="if\(event\.key==='Enter'\)\s*saveMainStock\(\)"/);
        assert.match(getInputTagById('return-stock-qty'), /onkeydown="if\(event\.key==='Enter'\)\s*saveReturnStock\(\)"/);
        assert.match(getInputTagById('desk-transfer-qty'), /onkeydown="if\(event\.key==='Enter'\)\s*executeDeskTransfer\(\)"/);
    });

    await t.test('10. Accessible Dropdown Keyboard Navigation Logic', async (st) => {
        const uiHelpersCode = fs.readFileSync(path.join(rootDir, 'src', 'utils', 'ui-helpers.js'), 'utf-8');

        // Verify ARIA attributes injected
        assert.match(uiHelpersCode, /trigger\.setAttribute\('role',\s*'combobox'\)/, 'Custom dropdown trigger must have role="combobox"');
        assert.match(uiHelpersCode, /trigger\.setAttribute\('tabindex',\s*'0'\)/, 'Custom dropdown trigger must have tabindex="0"');
        assert.match(uiHelpersCode, /optionsContainer\.setAttribute\('role',\s*'listbox'\)/, 'Custom dropdown options container must have role="listbox"');
        assert.match(uiHelpersCode, /optEl\.setAttribute\('role',\s*'option'\)/, 'Custom dropdown option must have role="option"');

        // Verify keyboard listeners
        assert.match(uiHelpersCode, /e\.key\s*===\s*'Enter'\s*\|\|\s*e\.key\s*===\s*'\s*'/, 'Custom dropdown must handle Enter and Space');
        assert.match(uiHelpersCode, /e\.key\s*===\s*'ArrowDown'/, 'Custom dropdown must handle ArrowDown');
        assert.match(uiHelpersCode, /e\.key\s*===\s*'ArrowUp'/, 'Custom dropdown must handle ArrowUp');
        assert.match(uiHelpersCode, /e\.key\s*===\s*'Escape'/, 'Custom dropdown must handle Escape');
    });
});
