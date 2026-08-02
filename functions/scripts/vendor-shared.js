const fs = require("fs");
const path = require("path");

const target = process.argv[2];
const pkgPath = path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.dependencies.shared = target;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("functions/package.json dependencies.shared ->", target);
