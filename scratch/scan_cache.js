import fs from 'fs';
import path from 'path';

const scratchDir = "C:\\Users\\Village\\.gemini\\antigravity\\scratch";
const files = [
    path.join(scratchDir, "000197.log"),
    path.join(scratchDir, "000199.ldb"),
    path.join(scratchDir, "000200.ldb")
];

function cleanPrintable(str) {
    return str.replace(/[^\x20-\x7E]/g, '.');
}

function scanFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const buffer = fs.readFileSync(filePath);
    console.log(`Scanning ${path.basename(filePath)} (${buffer.length} bytes)...`);
    
    // Search for "13/07/2026" or "Rakiba"
    const searchString1 = "13/07/2026";
    const searchString2 = "Rakiba";
    
    const term1 = Buffer.from(searchString1, 'utf8');
    const term2 = Buffer.from(searchString2, 'utf8');
    
    let offset = 0;
    const matches = [];
    
    // Scan for term2 (Rakiba) and check if it's near yesterday's date
    while (offset < buffer.length) {
        const index = buffer.indexOf(term2, offset);
        if (index === -1) break;
        
        // Grab context around the match
        const start = Math.max(0, index - 200);
        const end = Math.min(buffer.length, index + 300);
        const contextBuffer = buffer.slice(start, end);
        const contextStr = contextBuffer.toString('utf8');
        
        if (contextStr.includes(searchString1)) {
            matches.push({
                index,
                context: cleanPrintable(contextBuffer.toString('binary'))
            });
        }
        
        offset = index + term2.length;
    }
    
    console.log(`Found ${matches.length} matching transaction blocks in ${path.basename(filePath)}`);
    matches.forEach((m, idx) => {
        console.log(`\nMatch #${idx + 1} at offset ${m.index}:`);
        console.log(m.context);
    });
}

for (const file of files) {
    scanFile(file);
}
