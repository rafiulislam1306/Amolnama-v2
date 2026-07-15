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

async function main() {
    await cdp.connect();
    console.log("CDP Connected!");
    
    // Create new target
    const url = "https://amolnama-new.firebaseapp.com";
    console.log("Creating target for:", url);
    const targetRes = await cdp.send("Target.createTarget", { url });
    console.log("createTarget response:", JSON.stringify(targetRes, null, 2));
    
    if (targetRes.error) {
        console.error("CDP Error:", targetRes.error);
        cdp.close();
        return;
    }
    
    const targetId = targetRes.result.targetId;
    console.log("Target created:", targetId);
    
    // Attach to target
    console.log("Attaching to target...");
    const attachRes = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    console.log("attachToTarget response:", JSON.stringify(attachRes, null, 2));
    const sessionId = attachRes.result.sessionId;
    console.log("Attached! Session ID:", sessionId);
    
    // Wait for the page to load and check if logged in
    console.log("Waiting 5 seconds for page load and auth...");
    await new Promise(r => setTimeout(r, 5000));
    
    // Evaluate if user is logged in
    console.log("Evaluating currentUser...");
    const evalRes = await cdp.send("Runtime.evaluate", {
        expression: "window.currentUser ? { uid: window.currentUser.uid, email: window.currentUser.email, role: window.currentUserRole } : null",
        returnByValue: true
    }, sessionId);
    
    console.log("Evaluation Result:", JSON.stringify(evalRes.result, null, 2));
    
    // Close target
    console.log("Closing target...");
    await cdp.send("Target.closeTarget", { targetId });
    cdp.close();
}

main().catch(console.error);
