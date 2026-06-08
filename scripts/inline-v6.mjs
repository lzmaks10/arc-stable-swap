// Replace old ABI + add LP_TOKEN_ABI in index.html
import { readFileSync, writeFileSync } from "fs";

var html = readFileSync("frontend/index.html", "utf8");
var embed = readFileSync("frontend/contract-embed.js", "utf8");

// Find the old ABI block (from the EMBEDDED_ABI line through to the closing comment)
var startMarker = "// Contract info (embedded)";
var endMarker = "// EMBEDDED_CONTRACT, EMBEDDED_ABI set by contract-embed.js";

var start = html.indexOf(startMarker);
var end = html.indexOf(endMarker, start) + endMarker.length;

if (start < 0 || end < start) {
  console.error("Could not find old ABI block");
  process.exit(1);
}

// Extract embed.js content without the export comment
var replacement = embed.trim();

// Replace
var newHtml = html.substring(0, start) + replacement + "\n" + html.substring(end).trimStart();

writeFileSync("frontend/index.html", newHtml);
console.log("Done. File size:", newHtml.length, "bytes");
console.log("Old block lines:", html.substring(start, end).split("\n").length);
