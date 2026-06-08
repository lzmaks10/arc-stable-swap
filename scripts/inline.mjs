import { readFileSync, writeFileSync } from "fs";

const html = readFileSync("../frontend/index.html", "utf8");
const embed = readFileSync("../frontend/contract-embed.js", "utf8");
const js = readFileSync("../frontend/scripts.js", "utf8");

// Replace external script tags with inline script block
const out = html.replace(
  '<script src="contract-embed.js"></script>\n<script src="scripts.js"></script>',
  "<script>\n" + embed + "\n" + js + "\n</script>"
);

writeFileSync("../frontend/index-full.html", out);
console.log("OK, wrote index-full.html (" + out.length + " bytes)");
