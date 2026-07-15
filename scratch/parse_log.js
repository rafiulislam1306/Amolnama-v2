import fs from 'fs';
import path from 'path';

const scratchDir = "C:\\Users\\Village\\.gemini\\antigravity\\scratch";
const logFile = path.join(scratchDir, "000004.log");
const ldbFile = path.join(scratchDir, "000005.ldb");

function extractStrings(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    const buffer = fs.readFileSync(filePath);
    console.log(`\n--- Strings in ${path.basename(filePath)} (${buffer.length} bytes) ---`);
    
    let currentString = "";
    const minLength = 4;
    
    for (let i = 0; i < buffer.length; i++) {
        const charCode = buffer[i];
        // Printable ASCII characters
        if (charCode >= 32 && charCode <= 126) {
            currentString += String.fromCharCode(charCode);
        } else {
            if (currentString.length >= minLength) {
                console.log(currentString);
            }
            currentString = "";
        }
    }
    if (currentString.length >= minLength) {
        console.log(currentString);
    }
}

extractStrings(logFile);
extractStrings(ldbFile);
