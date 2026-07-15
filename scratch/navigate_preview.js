const wsUrl = process.env.AGY_BROWSER_WS_URL;
if (!wsUrl) {
    console.error("AGY_BROWSER_WS_URL is not set");
    process.exit(1);
}

const targetId = "8AA412132348AB9561536CF03116AAA9";
const prodUrl = "https://amolnama-new.web.app";

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
    
    console.log(`Navigating preview tab to ${prodUrl}...`);
    await cdp.send("Page.navigate", { url: prodUrl }, sessionId);
    console.log("Navigation command sent successfully!");
    
    cdp.close();
}

main().catch(console.error);
