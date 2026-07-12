import fs from 'fs';
import path from 'path';

const distDir = path.join(process.cwd(), 'dist');
const swPath = path.join(distDir, 'sw.js');
const assetsDir = path.join(distDir, 'assets');

try {
  if (!fs.existsSync(swPath)) {
    console.error(`Service worker not found at: ${swPath}`);
    process.exit(1);
  }

  let assetsList = [];
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    assetsList = files.map(file => `, withBase('/assets/${file}')`);
  }

  let swContent = fs.readFileSync(swPath, 'utf8');
  if (swContent.includes('// __INJECTED_ASSETS__')) {
    swContent = swContent.replace('// __INJECTED_ASSETS__', assetsList.join('\n  '));
    fs.writeFileSync(swPath, swContent, 'utf8');
    console.log('Successfully injected assets into sw.js:', assetsList.length, 'files');
  } else {
    console.warn('Placeholder // __INJECTED_ASSETS__ not found in sw.js');
  }
} catch (error) {
  console.error('Postbuild asset injection failed:', error);
  process.exit(1);
}
