import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_ALERTS_FILE = "data/event-email-alerts.json";

export class EventEmailAlertService {
  constructor({ filePath = DEFAULT_ALERTS_FILE, now = () => new Date(), env = globalThis.process?.env || {}, smtpClient = null } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.env = env;
    this.smtpClient = smtpClient;
  }

  async createAlert(input = {}) {
    const alerts = await this.readAlerts();
    const eventRequestId = input.eventRequestId || input.leadId || "";
    const duplicated = eventRequestId ? alerts.find((item) => item.eventRequestId === eventRequestId) : null;
    if (duplicated) return { ok: true, alert: duplicated, duplicated: true };
    const alert = {
      alertId: input.alertId || input.id || `event_alert_${crypto.randomUUID()}`,
      eventRequestId,
      conversationId: input.conversationId || "",
      to: input.to || this.env.EVENT_EMAIL_TO || "chefnenogutterres@gmail.com",
      subject: input.subject || "",
      body: input.body || "",
      conversationUrl: input.conversationUrl || "",
      status: "PENDING",
      attempts: 0,
      createdAt: input.createdAt || this.now().toISOString(),
      lastAttemptAt: null,
      sentAt: null,
      providerMessageId: "",
      error: ""
    };
    alerts.unshift(alert);
    await this.writeAlerts(alerts);
    return { ok: true, alert };
  }

  async sendAlert(eventRequestId = "") {
    const alerts = await this.readAlerts();
    const index = alerts.findIndex((item) => item.eventRequestId === eventRequestId || item.alertId === eventRequestId);
    if (index === -1) return { ok: false, error: "alert_not_found" };
    if (alerts[index].status === "SENT") return { ok: true, alert: alerts[index], skipped: true };
    const config = smtpConfig(this.env, alerts[index].to);
    if (!config.ok) {
      alerts[index] = markFailed(alerts[index], config.error, this.now);
      await this.writeAlerts(alerts);
      return { ok: false, alert: alerts[index], error: config.error };
    }
    alerts[index] = { ...alerts[index], status: "SENDING", attempts: Number(alerts[index].attempts || 0) + 1, lastAttemptAt: this.now().toISOString(), error: "" };
    await this.writeAlerts(alerts);
    try {
      const messageId = await (this.smtpClient || sendSmtpMail)({
        ...config,
        to: alerts[index].to,
        subject: alerts[index].subject,
        body: alerts[index].body
      });
      const latest = await this.readAlerts();
      const latestIndex = latest.findIndex((item) => item.alertId === alerts[index].alertId);
      if (latestIndex === -1) return { ok: false, error: "alert_not_found_after_send" };
      latest[latestIndex] = {
        ...latest[latestIndex],
        status: "SENT",
        sentAt: this.now().toISOString(),
        providerMessageId: sanitizeText(messageId),
        error: ""
      };
      await this.writeAlerts(latest);
      return { ok: true, alert: latest[latestIndex] };
    } catch (error) {
      const latest = await this.readAlerts();
      const latestIndex = latest.findIndex((item) => item.alertId === alerts[index].alertId);
      if (latestIndex >= 0) {
        latest[latestIndex] = markFailed(latest[latestIndex], sanitizeText(error?.message || error, [this.env.EVENT_SMTP_PASSWORD]), this.now);
        await this.writeAlerts(latest);
        return { ok: false, alert: latest[latestIndex], error: latest[latestIndex].error };
      }
      return { ok: false, error: sanitizeText(error?.message || error, [this.env.EVENT_SMTP_PASSWORD]) };
    }
  }

  async readAlerts() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeAlerts([]);
        return [];
      }
      throw error;
    }
  }

  async writeAlerts(alerts) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(alerts, null, 2)}\n`, "utf8");
  }
}

function smtpConfig(env = {}, to = "") {
  const host = env.EVENT_SMTP_HOST || "";
  const port = Number(env.EVENT_SMTP_PORT || 587);
  const user = env.EVENT_SMTP_USER || "";
  const password = env.EVENT_SMTP_PASSWORD || "";
  const from = env.EVENT_EMAIL_FROM || user;
  if (!host || !port || !user || !password || !from || !to) return { ok: false, error: "smtp_not_configured" };
  return {
    ok: true,
    host,
    port,
    secure: String(env.EVENT_SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
    user,
    password,
    from
  };
}

function markFailed(alert = {}, error = "", now = () => new Date()) {
  return {
    ...alert,
    status: "FAILED",
    lastAttemptAt: alert.lastAttemptAt || now().toISOString(),
    error: sanitizeText(error)
  };
}

async function sendSmtpMail(config = {}) {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });
  const client = new SmtpClient(socket, config);
  return client.send();
}

class SmtpClient {
  constructor(socket, config) {
    this.socket = socket;
    this.config = config;
    this.buffer = "";
  }

  async send() {
    await this.expect([220]);
    await this.command(`EHLO ${this.config.host}`, [250]);
    if (!this.config.secure) {
      await this.command("STARTTLS", [220]);
      this.socket = tls.connect({ socket: this.socket, servername: this.config.host });
      this.buffer = "";
      await this.command(`EHLO ${this.config.host}`, [250]);
    }
    await this.command("AUTH LOGIN", [334]);
    await this.command(Buffer.from(this.config.user).toString("base64"), [334]);
    await this.command(Buffer.from(this.config.password).toString("base64"), [235]);
    await this.command(`MAIL FROM:<${this.config.from}>`, [250]);
    await this.command(`RCPT TO:<${this.config.to}>`, [250, 251]);
    await this.command("DATA", [354]);
    const messageId = `<${crypto.randomUUID()}@sambah.local>`;
    const message = [
      `From: ${this.config.from}`,
      `To: ${this.config.to}`,
      `Subject: ${this.config.subject}`,
      `Message-ID: ${messageId}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      this.config.body,
      "."
    ].join("\r\n");
    await this.command(message, [250]);
    await this.command("QUIT", [221]).catch(() => null);
    this.socket.end();
    return messageId;
  }

  command(line, codes) {
    this.socket.write(`${line}\r\n`);
    return this.expect(codes);
  }

  expect(codes) {
    return new Promise((resolve, reject) => {
      const onData = (chunk) => {
        this.buffer += chunk.toString("utf8");
        const lines = this.buffer.split(/\r?\n/).filter(Boolean);
        const last = lines.at(-1) || "";
        if (!/^\d{3}\s/.test(last)) return;
        cleanup();
        const code = Number(last.slice(0, 3));
        if (codes.includes(code)) resolve(last);
        else reject(new Error(`smtp_${code}`));
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
        this.buffer = "";
      };
      this.socket.on("data", onData);
      this.socket.on("error", onError);
    });
  }
}

function sanitizeText(value = "", secrets = []) {
  let text = String(value || "");
  for (const secret of secrets.filter(Boolean)) {
    text = text.replaceAll(String(secret), "[secret]");
  }
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]").replace(/[A-Za-z0-9_-]{24,}/g, "[secret]");
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
