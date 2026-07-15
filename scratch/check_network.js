const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
    console.error("AGY_BROWSER_WS_URL is not set");
    process.exit(1);
}

const targetId = "8AA412132348AB9561536CF03116AAA9";
const appUrl = "http://localhost:5173/Amolnama-v2/";
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
        } else {
            // Event messages from session
            if (msg.method === "Network.loadingFailed") {
                console.error(`[NETWORK FAILED] URL: ${msg.params.errorText} for ${msg.params.requestId}`);
            } else if (msg.method === "Network.responseReceived") {
                console.log(`[NETWORK RESPONSE] [${msg.params.response.status}] URL: ${msg.params.response.url}`);
            } else if (msg.method === "Runtime.consoleAPICalled") {
                const args = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(" ");
                console.log(`[BROWSER CONSOLE] [${msg.params.type}] ${args}`);
            } else if (msg.method === "Runtime.exceptionThrown") {
                console.error(`[BROWSER EXCEPTION]`, JSON.stringify(msg.params.exceptionDetails, null, 2));
            }
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
    
    // Enable Console, Runtime, Page, and Network
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    
    console.log(`Navigating to ${appUrl}...`);
    await cdp.send("Page.navigate", { url: appUrl }, sessionId);
    
    console.log("Waiting 8 seconds to capture network events...");
    await new Promise(r => setTimeout(r, 8000));
    
    console.log(`Restoring preview tab to chat URL...`);
    await cdp.send("Page.navigate", { url: chatUrl }, sessionId);
    
    console.log("Waiting 3 seconds for restore...");
    await new Promise(r => setTimeout(r, 3000));
    
    cdp.close();
    console.log("Done");
}

main().catch(console.error);
