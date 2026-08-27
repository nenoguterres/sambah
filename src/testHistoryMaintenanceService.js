import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const TEST_HISTORY_RESET_ID = "2026-08-27-sambah-ecosystem-v1";

const ARRAY_HISTORY_FILES = [
  "audit-logs.json",
  "whatsapp-messages.json",
  "whatsapp-sessions.json",
  "call-center-alerts.json",
  "event-email-alerts.json",
  "event-leads.json",
  "clientes.json",
  "leads.json",
  "atendimentos.json",
  "eventos.json",
  "precomandas.json",
  "order-drafts.json",
  "order-tracking.json",
  "mesa-queue.json",
  "whatsapp-orders.json",
  "xeriffe-public-sessions.json",
  "pay-perola-signals.json",
  "pay-perola-suggestions.json",
  "sambah-perola-signals.json",
  "sambah-perola-suggestions.json",
  "perola-alerts.json",
  "perola-audit.json",
  "perola-campaign-distributions.json",
  "perola-ecosystem-signals.json",
  "perola-mesa-daily-report.json",
  "perola-mesa-interactions.json",
  "perola-sales-daily.json",
  "perola-human-approval-queue.json",
  "controlled-ai-audit.json",
  "sambah-events.json",
  "sambah-event-outbox.json",
  "sambah-event-dead-letter.json",
  "sambah-event-consumer-state.json",
  "sambah-traces.json",
  "sambah-operational-alerts.json",
  "sambah-security-events.json",
  "sambah-security-incidents.json",
  "sambah-security-actions.json",
  "sambah-lgpd-privacy-requests.json",
  "sambah-pay-audit-logs.json",
  "sambah-pay-payments.json",
  "sambah-pay-wallets.json",
  "sambah-pay-wallet-movements.json",
  "sambah-pay-customer-blocklist.json",
  "sambah-pay-devices.json",
  "sambah-pay-device-products.json",
  "sambah-pay-device-commands.json",
  "sambah-pay-device-status-logs.json",
  "sambah-pay-release-tokens.json",
  "sambah-pay-release-attempts.json",
  "sambah-pay-delivery-events.json",
  "sambah-pay-flow-meter-readings.json",
  "sambah-pay-stock-volumes.json",
  "sambah-pay-machine-alerts.json",
  "sambah-pay-autoserve-sessions.json",
  "sambah-pay-pickup-codes.json",
  "sambah-pay-scale-readings.json",
  "sambah-pay-event-accounts.json",
  "sambah-pay-event-participants.json",
  "sambah-pay-event-consumptions.json",
  "sambah-pay-bi-snapshots.json",
  "sambah-pay-voice-messages.json",
  "sambah-pay-voice-transcriptions.json",
  "sambah-pay-voice-intents.json",
  "sambah-pay-voice-sessions.json",
  "sambah-pay-voice-responses.json",
  "sambah-pay-voice-handoff-logs.json",
  "sambah-pay-voice-payment-links.json",
  "sambah-pay-weight-readings.json",
  "sambah-pay-weight-validations.json",
  "sambah-pay-weight-events.json",
  "sambah-pay-weight-calibrations.json",
  "sambah-pay-i9acao-security-events.json",
  "sambah-pay-secure-pickup-sessions.json",
  "sambah-pay-secure-pickup-items.json",
  "sambah-pay-secure-pickup-attempts.json",
  "sambah-pay-secure-pickup-events.json",
  "sambah-pay-locker-zones.json",
  "sambah-metrics.json"
];

const NESTED_ARRAY_HISTORY_FILES = [
  "sambah-crm/leads.json",
  "sambah-crm/contacts.json",
  "sambah-crm/handoffs.json"
];

const OBJECT_HISTORY_FILES = {
  "whatsapp-conversas.json": { conversas: [] },
  "whatsapp-v2-state.json": { states: {}, messageStatuses: {} },
  "controlled-ai-metrics.json": {
    messagesAnalyzed: 0,
    intentDetected: {},
    approvedResponses: 0,
    blockedResponses: 0,
    humanHandoffs: 0,
    lowConfidenceEvents: 0,
    confidenceTotal: 0,
    averageConfidence: 0,
    blockReasons: {}
  },
  "controlled-ai-performance.json": {
    totalConversations: 0,
    aiResolvedConversations: 0,
    humanTransferredConversations: 0,
    automationRate: 0,
    responseTimeTotalMs: 0,
    responseTimeCount: 0,
    averageResponseTime: 0,
    confidenceTotal: 0,
    averageConfidence: 0,
    conversationsByHour: {},
    conversationsByDay: {},
    intentDetected: {},
    handoffsByIntent: {}
  },
  "controlled-ai-conversion.json": {
    events: [],
    intentDetected: {},
    origins: {},
    ordersStarted: 0,
    ordersCompleted: 0,
    leadsCreated: 0,
    quotesRequested: 0,
    confirmedConversions: 0
  }
};

export async function resetTestHistoryOnce({
  dataDir = "data",
  resetId = TEST_HISTORY_RESET_ID,
  now = () => new Date()
} = {}) {
  const markerFile = join(dataDir, "maintenance-test-history-reset.json");
  const previous = await readJson(markerFile, null);
  if (previous?.resetId === resetId) return { ok: true, applied: false, ...previous };

  const backupDir = join(dataDir, "maintenance-backups", resetId);
  const targets = [
    ...ARRAY_HISTORY_FILES.map((name) => ({ name, empty: [] })),
    ...NESTED_ARRAY_HISTORY_FILES.map((name) => ({ name, empty: [] })),
    ...Object.entries(OBJECT_HISTORY_FILES).map(([name, empty]) => ({ name, empty }))
  ];
  const resetFiles = [];
  const missingFiles = [];

  for (const target of targets) {
    const source = join(dataDir, target.name);
    const current = await readFileIfPresent(source);
    if (current === null) {
      missingFiles.push(target.name);
      continue;
    }
    const backup = join(backupDir, target.name);
    await mkdir(dirname(backup), { recursive: true });
    await copyFile(source, backup);
    await writeJson(source, target.empty);
    resetFiles.push(target.name);
  }

  const completedAt = now().toISOString();
  const marker = { resetId, completedAt, resetFiles, missingFiles };
  await writeJson(markerFile, marker);
  return { ok: true, applied: true, ...marker };
}

async function readFileIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readJson(filePath, fallback) {
  const content = await readFileIfPresent(filePath);
  if (content === null) return fallback;
  try {
    return JSON.parse(String(content).replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
