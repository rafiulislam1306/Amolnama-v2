const fs = require("fs");
const path = require("path");

const IGNORE = ["node_modules", ".git", ".expo", "dist", "build", ".DS_Store"];

function buildTree(dir, prefix = "") {
  let output = "";
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !IGNORE.includes(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    output += prefix + connector + entry.name + "\n";
    if (entry.isDirectory()) {
      output += buildTree(path.join(dir, entry.name), prefix + childPrefix);
    }
  });

  return output;
}

const tree = "Amolnama-v2/\n" + buildTree(".");
console.log(tree);
fs.writeFileSync("filetree.txt", tree);
console.log("\n✅ Saved to filetree.txt");