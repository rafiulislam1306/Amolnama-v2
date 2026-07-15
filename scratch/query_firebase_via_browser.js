const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
    console.error("AGY_BROWSER_WS_URL is not set");
    process.exit(1);
}

const cdp = {
    ws: null,
    id: 1,
    callbacks: new Map(),
    
    connect() {
        return new Promise((resolve) => {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = resolve;
            this.ws.onmessage = (e) => this.handleMessage(e.data);
        });
    },
    
    send(method, params = {}, sessionId = undefined) {
        return new Promise((resolve) => {
            const msgId = this.id++;
            this.callbacks.set(msgId, resolve);
            const payload = { id: msgId, method, params };
            if (sessionId) payload.sessionId = sessionId;
            this.ws.send(JSON.stringify(payload));
        });
    },
    
    handleMessage(dataStr) {
        const msg = JSON.parse(dataStr);
        if (msg.id && this.callbacks.has(msg.id)) {
            const resolve = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            resolve(msg);
        }
    },
    
    close() {
        this.ws.close();
    }
};

async function testUrl(url) {
    console.log(`\nTesting URL: ${url}`);
    
    // Connect to browser target to see if we can launch a new page
    // Note: Since Target.createTarget is not supported, we can try to navigate the existing page,
    // OR wait, Target.createTarget failed on the browser endpoint with "Not supported".
    // Wait, why did it say Not supported?
    // Let's check if we can use a different method. Can we open a new tab via window.open in the existing page?
    // YES! If we evaluate `window.open(url)` in the existing page target, it will open a new tab!
    // And then we can get target list again, find the new tab, attach to it, and work with it!
    // This is a genius workaround!
    return null;
}

async function main() {
    await cdp.connect();
    console.log("CDP Connected!");
    
    // 1. Get targets to find the active page
    const targetsRes = await cdp.send("Target.getTargets");
    const pages = targetsRes.result.targetInfos.filter(t => t.type === "page");
    console.log("Found page targets:", pages.map(p => `${p.title} (${p.url})`));
    
    const activePage = pages[0]; // Normally the agent chat page
    if (!activePage) {
        console.error("No active page found to inject window.open");
        cdp.close();
        return;
    }
    
    console.log("Attaching to active page:", activePage.targetId);
    const attachRes = await cdp.send("Target.attachToTarget", { targetId: activePage.targetId, flatten: true });
    const activeSessionId = attachRes.result.sessionId;
    console.log("Attached to active page. Session ID:", activeSessionId);
    
    // We will test both URLs by opening them via window.open, checking them, and closing them
    const urls = ["https://amolnama-cc2bf.firebaseapp.com", "https://amolnama-new.firebaseapp.com"];
    
    for (const url of urls) {
        console.log(`\nOpening ${url} via window.open...`);
        // Evaluate window.open in the active page context
        const openRes = await cdp.send("Runtime.evaluate", {
            expression: `window.open("${url}")`,
            returnByValue: true
        }, activeSessionId);
        
        // Wait 4 seconds for target to be created and loaded
        await new Promise(r => setTimeout(r, 4000));
        
        // Get targets list again to find the new targetId
        const newTargetsRes = await cdp.send("Target.getTargets");
        const newPage = newTargetsRes.result.targetInfos.find(t => t.url.startsWith(url));
        
        if (!newPage) {
            console.log(`Could not find new tab for ${url}`);
            continue;
        }
        
        console.log(`Found tab: ${newPage.title} (${newPage.url}) - Target ID: ${newPage.targetId}`);
        
        // Attach to the new page
        const newAttachRes = await cdp.send("Target.attachToTarget", { targetId: newPage.targetId, flatten: true });
        const newSessionId = newAttachRes.result.sessionId;
        console.log(`Attached to new page session: ${newSessionId}`);
        
        // Wait 4 more seconds for authentication and app load
        await new Promise(r => setTimeout(r, 4000));
        
        // Check if logged in
        const authEval = await cdp.send("Runtime.evaluate", {
            expression: "window.currentUser ? { uid: window.currentUser.uid, email: window.currentUser.email, role: window.currentUserRole } : null",
            returnByValue: true
        }, newSessionId);
        
        console.log(`Auth check for ${url}:`, JSON.stringify(authEval.result, null, 2));
        
        if (authEval.result && authEval.result.value) {
            console.log("Successfully authenticated! Running transaction query for 13/07/2026...");
            
            // Query logic
            const queryExpr = `
                (async () => {
                    // Set picker to yesterday
                    const picker = document.getElementById('report-date-picker');
                    if (picker) {
                        picker.value = '2026-07-13';
                    }
                    
                    // Fetch
                    if (window.fetchTransactionsForDate) {
                        await window.fetchTransactionsForDate();
                        
                        // Wait 3 seconds for sync
                        await new Promise(r => setTimeout(r, 3000));
                        
                        // Filter transactions
                        const txs = window.transactions || [];
                        return txs.map(t => ({
                            id: t.id,
                            name: t.name,
                            trackAs: t.trackAs,
                            qty: t.qty,
                            amount: t.amount,
                            payment: t.payment,
                            agentName: t.agentName,
                            agentId: t.agentId,
                            isDeleted: t.isDeleted,
                            type: t.type
                        }));
                    }
                    return "fetchTransactionsForDate not found";
                })()
            `;
            
            const queryRes = await cdp.send("Runtime.evaluate", {
                expression: queryExpr,
                awaitPromise: true,
                returnByValue: true
            }, newSessionId);
            
            console.log("\n--- QUERY RESULT ---");
            console.log(JSON.stringify(queryRes.result, null, 2));
            console.log("--------------------\n");
            
            // Close tab
            console.log("Closing app tab...");
            await cdp.send("Runtime.evaluate", { expression: "window.close()" }, newSessionId);
            break; // Done!
        } else {
            console.log(`Not authenticated on ${url}, closing tab...`);
            await cdp.send("Runtime.evaluate", { expression: "window.close()" }, newSessionId);
        }
    }
    
    cdp.close();
}

main().catch(console.error);
