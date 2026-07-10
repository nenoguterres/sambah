#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const all = args.has("--all");
const conversationArg = process.argv.slice(2).find((arg) => arg.startsWith("--conversation="));
const conversationId = conversationArg ? conversationArg.slice("--conversation=".length) : "";
const dataDir = resolve(process.env.SAMBAH_DATA_DIR || "data");

if (!dryRun) {
  console.error("Uso seguro: node scripts/audit-whatsapp-v1-data.js --dry-run [--all|--conversation=<id>]");
  process.exitCode = 2;
} else {
  const result = await auditLegacyWhatsappData({ dataDir, all, conversationId });
  console.log(JSON.stringify(result, null, 2));
}

export async function auditLegacyWhatsappData({ dataDir, all = false, conversationId = "" } = {}) {
  const files = await findJsonFiles(dataDir);
  const findings = [];
  for (const file of files) {
    const parsed = await readJsonFile(file);
    scanValue(parsed, {
      file,
      path: "",
      findings,
      all,
      conversationId
    });
  }
  return {
    ok: true,
    mode: "dry-run",
    dataDir,
    filesScanned: files.length,
    findingsCount: findings.length,
    findings
  };
}

async function findJsonFiles(dir) {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) return [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await findJsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

async function readJsonFile(file) {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(stripBom(raw) || "null");
  } catch (error) {
    return { __auditReadError: error.message };
  }
}

function scanValue(value, context) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, { ...context, path: `${context.path}[${index}]` }));
    return;
  }
  if (!value || typeof value !== "object") return;

  const objectId = String(value.id || value.telefone || value.phone || value.conversationId || "");
  const inScope = context.all || !context.conversationId || objectId === context.conversationId;
  if (inScope) {
    for (const [key, item] of Object.entries(value)) {
      const reason = legacyReason(key, item);
      if (reason) {
        context.findings.push({
          file: context.file,
          path: context.path ? `${context.path}.${key}` : key,
          key,
          reason,
          valuePreview: previewValue(item)
        });
      }
    }
  }

  for (const [key, item] of Object.entries(value)) {
    scanValue(item, { ...context, path: context.path ? `${context.path}.${key}` : key });
  }
}

function legacyReason(key, value) {
  const normalizedKey = String(key || "").toLowerCase();
  if ([
    "activeflow",
    "activestep",
    "flowdata",
    "flowupdatedat",
    "intentengine",
    "operationroute",
    "currentmodule",
    "nextaction",
    "draftid",
    "lastintent",
    "autointent",
    "directautoreply",
    "automaticoativo"
  ].includes(normalizedKey)) return "whatsapp_v1_state_field";
  if (normalizedKey === "respostasugerida" && String(value || "").trim()) return "whatsapp_v1_suggested_reply";
  if (normalizedKey === "status" && (/^AGUARDANDO_/.test(String(value || "")) || String(value || "") === "pendente_configuracao")) return "whatsapp_v1_status";
  return "";
}

function previewValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") return JSON.stringify(value).slice(0, 160);
  return String(value).slice(0, 160);
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
