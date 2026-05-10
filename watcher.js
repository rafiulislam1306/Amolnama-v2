const fs = require('fs');
const path = require('path');

// Folders we want the AI to ignore so the map stays clean
const IGNORE = ['node_modules', '.git', '.expo', 'assets'];

function buildTree(dir, prefix = '') {
  let result = '';
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return result;
  }

  const filtered = items.filter(item => !IGNORE.includes(item.name));

  filtered.forEach((item, index) => {
    const isLast = index === filtered.length - 1;
    const pointer = isLast ? '└── ' : '├── ';
    result += prefix + pointer + item.name + '\n';

    if (item.isDirectory()) {
      const extension = isLast ? '    ' : '│   ';
      result += buildTree(path.join(dir, item.name), prefix + extension);
    }
  });
  return result;
}

function updateMap() {
  const treeMap = "Amolnama-v2 PWA POS Directory Map\n=========================\n" + buildTree(__dirname);
  fs.writeFileSync(path.join(__dirname, 'Amolnama-v2PWAPOSDirectoryMap.txt'), treeMap);
  console.log(`[${new Date().toLocaleTimeString()}] Amolnama-v2PWAPOSDirectoryMap.txt auto-updated!`);
}

// Generate the map immediately on startup
updateMap();

// Watch the entire folder for any additions, deletions, or changes
fs.watch(__dirname, { recursive: true }, (eventType, filename) => {
  if (filename && !IGNORE.some(ignored => filename.includes(ignored) || filename.includes('Amolnama-v2PWAPOSDirectoryMap.txt'))) {
    updateMap();
  }
});