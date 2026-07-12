import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_LEADS_FILE = "data/event-leads.json";
const DEFAULT_SERVICES_FILE = "data/insano-services.json";
const VALID_STATUSES = new Set([
  "AGUARDANDO_ANALISE",
  "new",
  "needs_info",
  "pre_reserved",
  "quote_sent",
  "confirmed",
  "canceled",
  "lost"
]);

const DEFAULT_SERVICES = [
  "Food Truck Completo",
  "Insano Food Truck",
  "Xeriffe Obirici",
  "Espetinhos / Churrasco",
  "Kachurrasco / Hot Dog",
  "Burger",
  "Beer Truck / Chope",
  "Aniversário",
  "Evento corporativo",
  "Condomínio",
  "Feira / evento público",
  "Outro"
];

export class EventScheduleService {
  constructor({ leadsFile = DEFAULT_LEADS_FILE, servicesFile = DEFAULT_SERVICES_FILE, now = () => new Date() } = {}) {
    this.leadsFile = leadsFile;
    this.servicesFile = servicesFile;
    this.now = now;
  }

  async createLead(input = {}) {
    const leads = await this.readLeads();
    const lead = this.normalizeLead(input);
    const duplicated = leads.find((item) => lead.externalId && item.externalId === lead.externalId);
    if (duplicated) return { ok: true, lead: sanitizeLead(duplicated), duplicated: true };
    leads.unshift(lead);
    await this.writeLeads(leads);
    return { ok: true, lead: sanitizeLead(lead), duplicated: false };
  }

  async listLeads({ limit = 100, status = null } = {}) {
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const leads = await this.readLeads();
    const filtered = status ? leads.filter((lead) => lead.status === status) : leads;
    return {
      ok: true,
      total: filtered.length,
      items: filtered.slice(0, normalizedLimit).map(sanitizeLead)
    };
  }

  async updateLead({ id, status, event = {}, customer = {}, note = "" } = {}) {
    if (!id) return { ok: false, error: "id_required" };
    if (status && !VALID_STATUSES.has(status)) return { ok: false, error: "invalid_status" };
    const leads = await this.readLeads();
    const lead = leads.find((item) => item.id === id);
    if (!lead) return { ok: false, error: "lead_not_found" };
    const previousStatus = lead.status;
    if (status) lead.status = status;
    lead.customer = { ...lead.customer, ...cleanObject(customer) };
    lead.event = { ...lead.event, ...cleanObject(event) };
    lead.updatedAt = this.now().toISOString();
    lead.history = addHistory(lead.history, "updated", note || `Status ${previousStatus} -> ${lead.status}`, this.now);
    await this.writeLeads(leads);
    return { ok: true, lead: sanitizeLead(lead) };
  }

  async cancelLead({ id, reason = "" } = {}) {
    return this.updateLead({ id, status: "canceled", note: reason || "Lead cancelado" });
  }

  async services() {
    const services = await this.readServices();
    return { ok: true, total: services.length, items: services };
  }

  async stats() {
    const leads = await this.readLeads();
    const byStatus = {};
    for (const status of VALID_STATUSES) byStatus[status] = 0;
    for (const lead of leads) byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
    const upcoming = leads
      .filter((lead) => ["new", "needs_info", "pre_reserved", "quote_sent", "confirmed"].includes(lead.status))
      .filter((lead) => lead.event?.date)
      .sort((a, b) => String(a.event.date).localeCompare(String(b.event.date)))
      .slice(0, 8)
      .map(sanitizeLead);
    return {
      ok: true,
      total: leads.length,
      byStatus,
      new: byStatus.new || 0,
      needsInfo: byStatus.needs_info || 0,
      quotePending: byStatus.needs_info + byStatus.pre_reserved,
      preReserved: byStatus.pre_reserved || 0,
      confirmed: byStatus.confirmed || 0,
      canceled: byStatus.canceled || 0,
      upcoming
    };
  }

  normalizeLead(input = {}) {
    const now = this.now().toISOString();
    const formData = input.formData || {};
    const classification = input.classification || {};
    const customer = input.customer || {};
    const event = input.event || {};
    const type = event.type || formData.eventType || formData.formType || input.formType || classification.subtype || classification.intent || inferEventType(input);
    const service = event.service || input.service || formData.service || inferService(type, input.message || input.text || input.notes || "");
    return {
      id: input.id || `event_${crypto.randomUUID()}`,
      eventRequestId: input.eventRequestId || input.id || "",
      externalId: input.externalId || input.eventId || null,
      source: input.source || input.channel || "samBah!",
      status: VALID_STATUSES.has(input.status) ? input.status : "new",
      conversationId: input.conversationId || formData.conversationId || "",
      telefoneOriginal: input.telefoneOriginal || input.originalPhone || formData.originalPhone || input.from || "",
      telefoneContato: input.telefoneContato || input.contactPhone || formData.contactPhone || input.phone || formData.phone || "",
      telefone: input.telefone || input.phone || input.from || formData.phone || "",
      submittedAt: input.submittedAt || now,
      customer: {
        name: customer.name || input.name || formData.name || "",
        phone: customer.phone || input.phone || input.from || formData.phone || "",
        phoneMasked: maskPhone(customer.phone || input.phone || input.from || formData.phone || ""),
        email: customer.email || input.email || formData.email || ""
      },
      event: {
        type,
        date: event.date || formData.date || "",
        time: event.time || formData.time || "",
        location: event.location || event.place || formData.place || formData.location || "",
        people: normalizePeople(event.people ?? formData.people),
        startsAt: event.startsAt || formData.startsAt || "",
        endsAt: event.endsAt || formData.endsAt || "",
        endTimeUndefined: Boolean(event.endTimeUndefined || formData.endTimeUndefined),
        city: event.city || formData.city || "",
        service,
        notes: event.notes || input.message || input.text || input.notes || formData.message || formData.celebration || ""
      },
      origin: input.origin || formData.origin || "",
      alert: input.alert || null,
      formData,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
      history: addHistory(input.history || [], "created", "Lead registrado na Agenda Insano", this.now)
    };
  }

  async readLeads() {
    try {
      const raw = await readFile(this.leadsFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeLeads([]);
        return [];
      }
      if (error instanceof SyntaxError) return [];
      throw error;
    }
  }

  async writeLeads(leads) {
    await mkdir(dirname(this.leadsFile), { recursive: true });
    await writeFile(this.leadsFile, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
  }

  async readServices() {
    try {
      const raw = await readFile(this.servicesFile, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      return Array.isArray(parsed) && parsed.length ? parsed : defaultServiceObjects();
    } catch (error) {
      if (error.code === "ENOENT") {
        const services = defaultServiceObjects();
        await this.writeServices(services);
        return services;
      }
      throw error;
    }
  }

  async writeServices(services) {
    await mkdir(dirname(this.servicesFile), { recursive: true });
    await writeFile(this.servicesFile, `${JSON.stringify(services, null, 2)}\n`, "utf8");
  }
}

function addHistory(history = [], action, message, now = () => new Date()) {
  return [
    ...history,
    {
      at: now().toISOString(),
      action,
      message
    }
  ];
}

function sanitizeLead(lead) {
  return {
    ...lead,
    customer: {
      ...lead.customer,
      phone: undefined,
      phoneMasked: lead.customer?.phoneMasked || maskPhone(lead.customer?.phone)
    }
  };
}

function defaultServiceObjects() {
  return DEFAULT_SERVICES.map((name, index) => ({
    id: slugify(name),
    name,
    active: true,
    sort: index + 1
  }));
}

function inferEventType(input = {}) {
  const text = normalizeText(`${input.message || ""} ${input.text || ""} ${input.formType || ""}`);
  if (text.includes("reserva") || text.includes("xeriffe")) return "reservation";
  if (text.includes("food truck") || text.includes("foodtruck")) return "food_truck";
  if (text.includes("corporativo") || text.includes("empresa")) return "corporate";
  if (text.includes("aniversario")) return "birthday";
  return "event";
}

function inferService(type, text = "") {
  const normalized = normalizeText(`${type} ${text}`);
  if (normalized.includes("chope") || normalized.includes("beer")) return "Beer Truck / Chope";
  if (normalized.includes("xeriffe") || normalized.includes("reserva")) return "Xeriffe Obirici";
  if (normalized.includes("food")) return "Insano Food Truck";
  if (normalized.includes("corporativo") || normalized.includes("empresa")) return "Evento corporativo";
  if (normalized.includes("condominio")) return "Condomínio";
  if (normalized.includes("aniversario")) return "Aniversário";
  if (normalized.includes("burger")) return "Burger";
  if (normalized.includes("kachurrasco") || normalized.includes("hot dog")) return "Kachurrasco / Hot Dog";
  return "Outro";
}

function normalizePeople(value) {
  const people = Number(value);
  return Number.isFinite(people) && people > 0 ? people : null;
}

function cleanObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}

function maskPhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return `****${digits.slice(-4)}`;
}

function slugify(value = "") {
  return normalizeText(value).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBom(value = "") {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
