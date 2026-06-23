export const PLANNED_TOPICS = [
  "sambah.payments",
  "sambah.wallet",
  "sambah.locker",
  "sambah.autoserve",
  "sambah.devices",
  "sambah.security",
  "sambah.audit",
  "sambah.erp",
  "sambah.notifications",
  "sambah.observability",
  "sambah.lgpd",
  "sambah.perola"
];

export const MESSAGE_CONTRACTS = [
  { type: "payment.confirmed", topic: "sambah.payments", routingKey: "payment.confirmed", source: "sambah-pay", critical: true },
  { type: "wallet.credited", topic: "sambah.wallet", routingKey: "wallet.credited", source: "sambah-wallet", critical: true },
  { type: "locker.pickup.completed", topic: "sambah.locker", routingKey: "locker.pickup.completed", source: "sambah-locker", critical: true },
  { type: "locker.pickup.fraud_suspected", topic: "sambah.security", routingKey: "locker.pickup.fraud_suspected", source: "sambah-locker", critical: true },
  { type: "machine_alert.created", topic: "sambah.security", routingKey: "machine_alert.created", source: "sambah-devices", critical: true },
  { type: "device.offline", topic: "sambah.devices", routingKey: "device.offline", source: "sambah-devices", critical: true },
  { type: "erp.sync.failed", topic: "sambah.erp", routingKey: "erp.sync.failed", source: "sambah-erp-adapter", critical: true },
  { type: "audit.created", topic: "sambah.audit", routingKey: "audit.created", source: "sambah-audit", critical: false },
  { type: "lgpd.request.created", topic: "sambah.lgpd", routingKey: "lgpd.request.created", source: "sambah-lgpd", critical: true },
  { type: "security.incident.created", topic: "sambah.security", routingKey: "security.incident.created", source: "sambah-security", critical: true },
  { type: "pay.perola.signal.created", topic: "sambah.perola", routingKey: "pay.perola.signal.created", source: "sambah-pay", critical: false }
];

export class MessageContractService {
  topics() {
    return PLANNED_TOPICS;
  }

  contracts() {
    return MESSAGE_CONTRACTS;
  }

  find(type) {
    return MESSAGE_CONTRACTS.find((contract) => contract.type === type) || {
      type,
      topic: topicFor(type),
      routingKey: type || "unknown",
      source: "sambah-messaging",
      critical: false
    };
  }

  validate(message = {}) {
    const missing = ["id", "type", "topic", "routingKey", "correlationId", "createdAt"].filter((key) => !message[key]);
    return { ok: missing.length === 0, missing, schemaVersion: message.headers?.schemaVersion || "1.0" };
  }
}

function topicFor(type = "") {
  if (type.startsWith("payment.")) return "sambah.payments";
  if (type.startsWith("wallet.")) return "sambah.wallet";
  if (type.startsWith("locker.")) return "sambah.locker";
  if (type.startsWith("device.")) return "sambah.devices";
  if (type.startsWith("machine_alert.") || type.startsWith("security.")) return "sambah.security";
  if (type.startsWith("erp.")) return "sambah.erp";
  if (type.startsWith("lgpd.")) return "sambah.lgpd";
  if (type.startsWith("audit.")) return "sambah.audit";
  if (type.startsWith("pay.perola.")) return "sambah.perola";
  return "sambah.observability";
}
