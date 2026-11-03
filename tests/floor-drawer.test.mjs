// tests/floor-drawer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

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
    value: '',
    dataset: {},
    scrollTop: 0,
    addEventListener: () => {},
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

// Import tested modules
const { shouldIncludeDeskOnFloor, generateFloorDeskCard, shouldShowFloorManagerCashBar } = await import('../src/features/desk.js');
const { shouldIncludeTransferTarget } = await import('../src/features/transfers.js');
const { switchTab } = await import('../src/main.js');
const { AppState } = await import('../src/core/state.js');

test('Suite: Floor Agent Personal Drawer Visibility & Functionality', async (t) => {

    await t.test('1. Floor Tab Inactive Desk Filter (shouldIncludeDeskOnFloor)', async (st) => {
        
        await st.test('filters out generic unassigned desk with 0 sales, 0 stock, and 0 cash', () => {
            const session = { deskId: 'desk_2', deskName: 'Desk 2' };
            const visible = shouldIncludeDeskOnFloor({
                session,
                isMyDesk: false,
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            });
            assert.equal(visible, false, 'Generic desk with 0 sales, 0 stock, 0 cash must be filtered out');
        });

        await st.test('retains generic desk when it has sales activity', () => {
            const session = { deskId: 'desk_2', deskName: 'Desk 2' };
            const visible = shouldIncludeDeskOnFloor({
                session,
                isMyDesk: false,
                hasSalesActivity: true,
                totalStockQty: 0,
                liveCash: 0
            });
            assert.equal(visible, true, 'Generic desk with sales activity must be visible');
        });

        await st.test('retains generic desk when it has physical stock tracked', () => {
            const session = { deskId: 'desk_2', deskName: 'Desk 2' };
            const visible = shouldIncludeDeskOnFloor({
                session,
                isMyDesk: false,
                hasSalesActivity: false,
                totalStockQty: 4,
                liveCash: 0
            });
            assert.equal(visible, true, 'Generic desk with physical stock must be visible');
        });

        await st.test('retains generic desk when it has live cash', () => {
            const session = { deskId: 'desk_2', deskName: 'Desk 2' };
            const visible = shouldIncludeDeskOnFloor({
                session,
                isMyDesk: false,
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 500
            });
            assert.equal(visible, true, 'Generic desk with cash float must be visible');
        });

        await st.test('retains active personal drawer (personal_<uid>) even with 0 sales, 0 stock, and 0 cash', () => {
            const session = { deskId: 'personal_agent_uid_123', deskName: "Agent's Drawer" };
            const visible = shouldIncludeDeskOnFloor({
                session,
                isMyDesk: false,
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            });
            assert.equal(visible, true, 'Personal agent drawer must NEVER be filtered out even with 0 activity');
        });

        await st.test('retains user current desk when isMyDesk is true even with 0 sales, 0 stock, and 0 cash', () => {
            const session = { deskId: 'desk_1', deskName: 'My Assigned Desk' };
            const visible = shouldIncludeDeskOnFloor({
                session,
                isMyDesk: true,
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            });
            assert.equal(visible, true, 'User current desk (isMyDesk=true) must NEVER be filtered out');
        });

        await st.test('retains user desk when session.deskId matches AppState.currentDeskId', () => {
            const previousDeskId = AppState.currentDeskId;
            AppState.currentDeskId = 'desk_special_42';
            try {
                const session = { deskId: 'desk_special_42', deskName: 'Special Desk' };
                const visible = shouldIncludeDeskOnFloor({
                    session,
                    isMyDesk: false,
                    hasSalesActivity: false,
                    totalStockQty: 0,
                    liveCash: 0
                });
                assert.equal(visible, true, 'Desk matching AppState.currentDeskId must be retained');
            } finally {
                AppState.currentDeskId = previousDeskId;
            }
        });
    });

    await t.test('2. Desk Transfer Target Filter (shouldIncludeTransferTarget)', async (st) => {

        await st.test('filters out the sender own desk (cannot transfer stock to itself)', () => {
            const deskData = { deskId: 'personal_sender_uid' };
            const shouldInclude = shouldIncludeTransferTarget({
                deskData,
                currentDeskId: 'personal_sender_uid',
                hasSalesActivity: true,
                totalStockQty: 10,
                liveCash: 500
            });
            assert.equal(shouldInclude, false, 'Sender current desk must be excluded from transfer targets');
        });

        await st.test('filters out inactive unassigned shared desk with 0 sales, 0 stock, and 0 cash', () => {
            const deskData = { deskId: 'desk_3', deskName: 'Desk 3' };
            const shouldInclude = shouldIncludeTransferTarget({
                deskData,
                currentDeskId: 'personal_sender_uid',
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            });
            assert.equal(shouldInclude, false, 'Inactive ghost desk must be excluded from transfer targets');
        });

        await st.test('retains active shared desk when it has sales activity, stock, or cash', () => {
            const deskData = { deskId: 'desk_3', deskName: 'Desk 3' };
            const shouldInclude = shouldIncludeTransferTarget({
                deskData,
                currentDeskId: 'personal_sender_uid',
                hasSalesActivity: false,
                totalStockQty: 5,
                liveCash: 0
            });
            assert.equal(shouldInclude, true, 'Active desk with stock must be eligible as transfer target');
        });

        await st.test('retains newly opened agent personal drawer (personal_<uid>) as transfer target with 0 activity', () => {
            const deskData = { deskId: 'personal_target_agent_789', deskName: "New Agent's Drawer" };
            const shouldInclude = shouldIncludeTransferTarget({
                deskData,
                currentDeskId: 'personal_sender_uid',
                hasSalesActivity: false,
                totalStockQty: 0,
                liveCash: 0
            });
            assert.equal(shouldInclude, true, 'Personal agent drawer must be available for incoming stock transfers even before first sale');
        });
    });

    await t.test('3. Card Generation UI & Badges (generateFloorDeskCard)', async (st) => {

        await st.test('renders proper "My Drawer" badge, title, and "Open My Drawer" button for user own drawer', () => {
            const session = { deskId: 'personal_user_1', deskName: "My Drawer" };
            const html = generateFloorDeskCard({
                session,
                isMyDesk: true,
                liveCash: 0,
                invDisplay: '<span style="font-size:0.8rem; color:var(--text-secondary); font-style: italic;">No physical stock tracked.</span>',
                displayDeskName: 'My Drawer',
                agentNamesStr: 'Hasan'
            });

            // Verification of own drawer card elements
            assert.match(html, /My Drawer/i, 'Card must mention My Drawer');
            assert.match(html, />My Drawer<\/div>/, 'Card must render "My Drawer" upper-right badge');
            assert.match(html, /Open My Drawer<\/button>/, 'Card must render primary action button "Open My Drawer"');
            assert.match(html, /onclick="openMyDeskDashboard\(\)"/, 'Card button must trigger openMyDeskDashboard()');
            assert.match(html, /0 <span style="font-size: 0\.9rem; opacity: 0\.8;">Tk<\/span>/, 'Card must show live cash amount');
            assert.match(html, /No physical stock tracked\./, 'Card must display fallback inventory text when 0 stock');
            assert.match(html, /Hasan/, 'Card must show agent first name');
        });

        await st.test('renders peer agent drawer with agent name, "View Details" button, and NO "My Drawer" badge', () => {
            const session = { deskId: 'personal_agent_2', deskName: "Rahim's Drawer" };
            const html = generateFloorDeskCard({
                session,
                isMyDesk: false,
                liveCash: 1250,
                invDisplay: '<div>SIM: 10</div>',
                displayDeskName: "Rahim's Drawer",
                agentNamesStr: 'Rahim'
            });

            // Verification of peer drawer card elements
            assert.doesNotMatch(html, />My Drawer<\/div>/, 'Peer drawer must NOT have "My Drawer" badge');
            assert.doesNotMatch(html, /Open My Drawer<\/button>/, 'Peer drawer must NOT have "Open My Drawer" button');
            assert.match(html, /View Details<\/button>/, 'Peer drawer must render "View Details" button');
            assert.match(html, /onclick="peekAtDesk\('personal_agent_2', 'Rahim\\\'s Drawer'\)"/, 'Peer button must trigger peekAtDesk with properly escaped name');
            assert.match(html, /Rahim's Drawer\s*<\/h4>/, 'Peer drawer must display proper drawer title');
            assert.match(html, /1250 <span style="font-size: 0\.9rem; opacity: 0\.8;">Tk<\/span>/, 'Peer drawer must display live cash');
            assert.match(html, /SIM: 10/, 'Peer drawer must display physical stock items');
        });
    });

    await t.test('4. Tab Switch Freshness (switchTab)', async (st) => {

        await st.test('switching to floor tab triggers window.renderLiveFloorTab and resets needsRender.floor', () => {
            let renderFloorCalls = 0;
            globalThis.window.renderLiveFloorTab = () => {
                renderFloorCalls++;
            };

            // Set needsRender.floor to false to simulate subsequent navigation
            AppState.needsRender.floor = false;

            switchTab('floor', 'Live Floor Map');

            assert.equal(renderFloorCalls, 1, 'switchTab("floor") must reliably invoke window.renderLiveFloorTab()');
            assert.equal(AppState.needsRender.floor, false, 'switchTab("floor") must keep needsRender.floor cleared');

            // Switch a second time
            switchTab('floor', 'Live Floor Map');
            assert.equal(renderFloorCalls, 2, 'subsequent switchTab("floor") must refresh data again without manual Refresh button');
        });
    });

    await t.test('5. Floor Manager Cash Action Bar Gating (shouldShowFloorManagerCashBar)', async (st) => {

        await st.test('returns true for Floor Manager with canPerformCashActions: true', () => {
            const result = shouldShowFloorManagerCashBar({ role: 'manager', canPerformCashActions: true });
            assert.equal(result, true, 'Floor manager with canPerformCashActions: true must see the cash action bar');
        });

        await st.test('returns false for Floor Manager with canPerformCashActions: false', () => {
            const result = shouldShowFloorManagerCashBar({ role: 'manager', canPerformCashActions: false });
            assert.equal(result, false, 'Floor manager without cash permissions must NOT see the cash action bar');
        });

        await st.test('returns false for Center Admin with canPerformCashActions: false', () => {
            const result = shouldShowFloorManagerCashBar({ role: 'admin', canPerformCashActions: false });
            assert.equal(result, false, 'Center Admin must NOT see the floor manager cash action bar');
        });

        await st.test('returns false for Center Admin with canPerformCashActions: true', () => {
            const result = shouldShowFloorManagerCashBar({ role: 'admin', canPerformCashActions: true });
            assert.equal(result, false, 'Center Admin must strictly NOT see the floor manager cash bar even if canPerformCashActions is true');
        });

        await st.test('returns false for Floor Agent (user)', () => {
            const resultDefault = shouldShowFloorManagerCashBar({ role: 'user', canPerformCashActions: false });
            assert.equal(resultDefault, false, 'Floor Agent must NOT see the cash action bar');
            const resultWithCash = shouldShowFloorManagerCashBar({ role: 'user', canPerformCashActions: true });
            assert.equal(resultWithCash, false, 'Floor Agent must NOT see the cash bar even with cash permission');
        });

        await st.test('returns false for System Owner (owner)', () => {
            const resultDefault = shouldShowFloorManagerCashBar({ role: 'owner', canPerformCashActions: false });
            assert.equal(resultDefault, false, 'System Owner must NOT see the floor manager cash bar');
            const resultWithCash = shouldShowFloorManagerCashBar({ role: 'owner', canPerformCashActions: true });
            assert.equal(resultWithCash, false, 'System Owner must NOT see the floor manager cash bar even with cash permission');
        });

        await st.test('falls back correctly to AppState when arguments are omitted', () => {
            const originalRole = AppState.currentUserRole;
            const originalPerm = AppState.canPerformCashActions;
            try {
                AppState.currentUserRole = 'manager';
                AppState.canPerformCashActions = true;
                assert.equal(shouldShowFloorManagerCashBar(), true, 'Must read from AppState when no args given');

                AppState.currentUserRole = 'admin';
                AppState.canPerformCashActions = true;
                assert.equal(shouldShowFloorManagerCashBar(), false, 'Admin must evaluate to false via AppState');
            } finally {
                AppState.currentUserRole = originalRole;
                AppState.canPerformCashActions = originalPerm;
            }
        });
    });
});
