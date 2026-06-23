import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export class SambahMemoryService {
  constructor({ dataDir = "data", now = () => new Date() } = {}) {
    this.filePath = join(dataDir, "sambah-crm", "contacts.json");
    this.now = now;
  }

  async upsertContact(input = {}) {
    const phone = normalizePhone(input.phone);
    if (!phone) return { ok: false, statusCode: 400, error: "phone_required" };

    const contacts = await this.readContacts();
    const index = contacts.findIndex((contact) => contact.phone === phone);
    const timestamp = this.now().toISOString();
    const existing = index >= 0 ? contacts[index] : null;
    const messages = [
      ...(Array.isArray(existing?.messages) ? existing.messages : []),
      ...normalizeMessages(input.messages, timestamp)
    ].slice(-20);
    const contact = {
      id: existing?.id || crypto.randomUUID(),
      phone,
      name: input.name || existing?.name || "",
      firstContactAt: existing?.firstContactAt || timestamp,
      lastContactAt: timestamp,
      totalInteractions: Number(existing?.totalInteractions || 0) + 1,
      lastIntent: input.intent || input.lastIntent || existing?.lastIntent || "",
      lastMessage: input.message || input.lastMessage || "",
      notes: input.notes ?? existing?.notes ?? "",
      tags: Array.isArray(input.tags) ? input.tags : existing?.tags || [],
      messages
    };

    if (existing) contacts[index] = contact;
    else contacts.unshift(contact);
    await this.writeContacts(contacts);
    return { ok: true, created: !existing, contact };
  }

  async getContact(phoneInput) {
    const phone = normalizePhone(phoneInput);
    if (!phone) return { ok: false, statusCode: 400, error: "phone_required" };
    const contacts = await this.readContacts();
    const contact = contacts.find((item) => item.phone === phone);
    if (!contact) return { ok: false, statusCode: 404, error: "contact_not_found" };
    return {
      ok: true,
      contact: {
        id: contact.id,
        phone: contact.phone,
        name: contact.name,
        firstContactAt: contact.firstContactAt,
        lastContactAt: contact.lastContactAt,
        totalInteractions: contact.totalInteractions,
        lastIntent: contact.lastIntent,
        lastMessage: contact.lastMessage,
        notes: contact.notes,
        tags: contact.tags,
        messages: Array.isArray(contact.messages) ? contact.messages : []
      }
    };
  }

  async readContacts() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeContacts([]);
        return [];
      }
      throw error;
    }
  }

  async writeContacts(contacts) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(contacts, null, 2)}\n`, "utf8");
  }
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function normalizeMessages(messages = [], fallbackCreatedAt) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message?.text)
    .map((message) => ({
      id: message.id || crypto.randomUUID(),
      direction: message.direction === "outbound" ? "outbound" : "inbound",
      text: String(message.text),
      intent: message.intent || "",
      createdAt: message.createdAt || fallbackCreatedAt
    }));
}
