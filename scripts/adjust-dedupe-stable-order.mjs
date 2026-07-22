import { readFile, writeFile } from "node:fs/promises";

const path = "src/whatsapp/conversationMessageDedupe.js";
const content = await readFile(path, "utf8");
const before = `function compareCreatedAt(left = {}, right = {}) {
  const byTime = String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
  if (byTime !== 0) return byTime;
  return String(left.id || "").localeCompare(String(right.id || ""));
}`;
const after = `function compareCreatedAt(left = {}, right = {}) {
  return String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
}`;
const first = content.indexOf(before);
if (first === -1) throw new Error("PATCH_TARGET_NOT_FOUND: stable equal-timestamp order");
if (content.indexOf(before, first + before.length) !== -1) throw new Error("PATCH_TARGET_NOT_UNIQUE: stable equal-timestamp order");
await writeFile(path, `${content.slice(0, first)}${after}${content.slice(first + before.length)}`, "utf8");
console.log("Equal-timestamp message order preserved.");
