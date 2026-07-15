const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
    console.error("AGY_BROWSER_WS_URL is not set");
    process.exit(1);
}

const targetId = "8AA412132348AB9561536CF03116AAA9";
const chatUrl = "https://127.0.0.1:60785/c/d27b8327-36fa-4e61-bef8-0e1f387cb9d8?section=07ef8405-057d-466c-8dbe-bf098caf747c";

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

async function main() {
    await cdp.connect();
    console.log("CDP Connected!");
    
    console.log("Attaching to page target...");
    const attachRes = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const sessionId = attachRes.result.sessionId;
    console.log("Attached! Session ID:", sessionId);
    
    // Check if logged in
    console.log("Checking auth status...");
    const authEval = await cdp.send("Runtime.evaluate", {
        expression: "window.currentUser ? { uid: window.currentUser.uid, email: window.currentUser.email } : null",
        returnByValue: true
    }, sessionId);
    
    console.log("Auth Check:", JSON.stringify(authEval.result, null, 2));
    
    if (authEval.result && authEval.result.value) {
        console.log("Authenticated! Triggering transaction query for 13/07/2026...");
        
        const queryExpr = `
            (async () => {
                const picker = document.getElementById('report-date-picker');
                if (picker) picker.value = '2026-07-13';
                
                if (window.fetchTransactionsForDate) {
                    await window.fetchTransactionsForDate();
                    await new Promise(r => setTimeout(r, 4000));
                    
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
                        type: t.type,
                        time: t.time
                    }));
                }
                return "fetchTransactionsForDate not found";
            })()
        `;
        
        const queryRes = await cdp.send("Runtime.evaluate", {
            expression: queryExpr,
            awaitPromise: true,
            returnByValue: true
        }, sessionId);
        
        console.log("\n--- TRANSACTION QUERY RESULT ---");
        console.log(JSON.stringify(queryRes.result, null, 2));
        console.log("--------------------------------\n");
        
        // Restore chat page URL
        console.log("Restoring preview tab back to chat...");
        await cdp.send("Page.navigate", { url: chatUrl }, sessionId);
        await new Promise(r => setTimeout(r, 3000));
    } else {
        console.log("Not logged in. Please sign in to the website in the preview panel and then try again.");
    }
    
    cdp.close();
}

main().catch(console.error);
