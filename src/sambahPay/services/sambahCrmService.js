import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const STAGES = ["novo", "atendimento", "orcamento", "aguardando_cliente", "fechado", "perdido"];

export class SambahCrmService {
  constructor({ dataDir = "data", now = () => new Date() } = {}) {
    this.filePath = join(dataDir, "sambah-crm", "leads.json");
    this.now = now;
  }

  async status() {
    const leads = await this.readLeads();
    return { ok: true, module: "sambah-crm", mode: "json", total: leads.length, stages: STAGES };
  }

  async createLead(input = {}) {
    if (!input.phone) return { ok: false, statusCode: 400, error: "phone_required" };
    if (!input.source) return { ok: false, statusCode: 400, error: "source_required" };
    const stage = input.stage || "novo";
    if (!STAGES.includes(stage)) return { ok: false, statusCode: 400, error: "invalid_stage" };

    const timestamp = this.now().toISOString();
    const lead = {
      id: input.id || crypto.randomUUID(),
      name: input.name || "",
      phone: String(input.phone),
      source: String(input.source),
      interest: input.interest || "",
      message: input.message || "",
      stage,
      tags: Array.isArray(input.tags) ? input.tags : [],
      notes: input.notes || "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const leads = await this.readLeads();
    leads.unshift(lead);
    await this.writeLeads(leads);
    return { ok: true, lead };
  }

  async listLeads(filters = {}) {
    const leads = await this.readLeads();
    const items = leads.filter((lead) => {
      if (filters.stage && lead.stage !== filters.stage) return false;
      if (filters.source && lead.source !== filters.source) return false;
      if (filters.phone && lead.phone !== filters.phone) return false;
      return true;
    });
    return { ok: true, total: items.length, items };
  }

  async updateStage(id, input = {}) {
    const stage = input.stage;
    if (!STAGES.includes(stage)) return { ok: false, statusCode: 400, error: "invalid_stage" };
    return this.updateLead(id, { stage });
  }

  async updateNotes(id, input = {}) {
    return this.updateLead(id, { notes: input.notes || "" });
  }

  async upsertByIntent(input = {}) {
    if (!input.phone) return { ok: false, statusCode: 400, error: "phone_required" };
    const mapping = intentToCrm(input.intent);

    const leads = await this.readLeads();
    const phone = String(input.phone);
    const index = leads.findIndex((lead) => lead.phone === phone);
    const timestamp = this.now().toISOString();
    const existing = index >= 0 ? leads[index] : null;
    const tags = Array.from(new Set([...(Array.isArray(existing?.tags) ? existing.tags : []), mapping.tag].filter(Boolean)));
    const commercialData = { ...(existing?.commercialData || {}), ...(input.commercialData || {}) };
    const priority = calculatePriority({
      intent: input.intent,
      commercialData,
      totalInteractions: input.totalInteractions
    });
    const lead = {
      id: existing?.id || crypto.randomUUID(),
      name: input.name || existing?.name || "",
      phone,
      source: input.source || existing?.source || "whatsapp",
      interest: input.interest || existing?.interest || input.intent || "",
      message: input.message || existing?.message || "",
      stage: mapping.stage,
      tags,
      commercialData,
      priorityScore: priority.score,
      priorityLabel: priority.label,
      notes: existing?.notes || "",
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };

    if (existing) leads[index] = lead;
    else leads.unshift(lead);
    await this.writeLeads(leads);
    return { ok: true, created: !existing, lead };
  }

  async updateLead(id, patch) {
    const leads = await this.readLeads();
    const index = leads.findIndex((lead) => lead.id === id);
    if (index < 0) return { ok: false, statusCode: 404, error: "lead_not_found" };
    leads[index] = { ...leads[index], ...patch, updatedAt: this.now().toISOString() };
    await this.writeLeads(leads);
    return { ok: true, lead: leads[index] };
  }

  async readLeads() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeLeads([]);
        return [];
      }
      throw error;
    }
  }

  async writeLeads(leads) {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(leads, null, 2)}\n`, "utf8");
  }
}

function intentToCrm(intent) {
  if (intent === "evento") return { stage: "orcamento", tag: "evento" };
  if (intent === "orcamento") return { stage: "orcamento", tag: "orcamento" };
  if (intent === "pedido") return { stage: "atendimento", tag: "pedido" };
  if (intent === "humano") return { stage: "atendimento", tag: "humano" };
  return { stage: "novo", tag: null };
}

function calculatePriority({ intent, commercialData = {}, totalInteractions = 0 } = {}) {
  let score = 0;
  if (["evento", "orcamento"].includes(intent)) score += 30;
  if (commercialData.peopleCount) score += 20;
  if (commercialData.requestedDate) score += 15;
  if (commercialData.locationHint) score += 15;
  if (commercialData.budgetHint) score += 10;
  if (intent === "humano") score += 10;
  if (Number(totalInteractions || 0) >= 3) score += 10;
  return { score, label: priorityLabel(score) };
}

function priorityLabel(score) {
  if (score >= 60) return "quente";
  if (score >= 30) return "morno";
  return "frio";
}
