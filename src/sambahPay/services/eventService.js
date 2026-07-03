import crypto from "node:crypto";

export class SambahPayEventService {
  constructor({ eventAccountsRepository, participantsRepository, consumptionsRepository, audit, now = () => new Date() } = {}) {
    this.eventAccounts = eventAccountsRepository;
    this.participants = participantsRepository;
    this.consumptions = consumptionsRepository;
    this.audit = audit;
    this.now = now;
  }

  async createEvent(input = {}) {
    const event = await this.eventAccounts.insert({ id: crypto.randomUUID(), name: input.name || "Evento SamBah Pay", status: "open", starts_at: input.starts_at || this.now().toISOString(), ends_at: input.ends_at || null, contract_type: input.contract_type || "cashless_simulated", default_payment_policy: input.default_payment_policy || "wallet_or_cashless" });
    await this.audit.record({ type: "sambah_pay_event_created", status: "success", message: "Evento SamBah Pay criado", context: { event_id: event.id } });
    return { ok: true, event };
  }

  async addParticipant(eventId, input = {}) {
    const event = await this.eventAccounts.findById(eventId);
    if (!event) return { ok: false, error: "event_not_found" };
    const participant = await this.participants.insert({ id: crypto.randomUUID(), event_account_id: eventId, customer_id: input.customer_id || null, name: input.name || "Participante", document: input.document || null, phone: input.phone || null, qr_code: input.qr_code || crypto.randomUUID(), wristband_code: input.wristband_code || null, balance: Number(input.balance || 0), package_id: input.package_id || null, status: "active" });
    await this.audit.record({ type: "sambah_pay_event_participant_created", status: "success", message: "Participante de evento cadastrado", context: { event_id: eventId, participant_id: participant.id } });
    return { ok: true, participant };
  }

  async consume(eventId, input = {}) {
    const event = await this.eventAccounts.findById(eventId);
    if (!event || event.status !== "open") return { ok: false, error: "event_not_open" };
    const consumption = await this.consumptions.insert({ id: crypto.randomUUID(), event_account_id: eventId, participant_id: input.participant_id || null, product_id: input.product_id || null, product_name: input.product_name || "Produto evento", quantity: Number(input.quantity || 1), unit_price: Number(input.unit_price || 0), total_amount: Number(input.total_amount ?? (Number(input.quantity || 1) * Number(input.unit_price || 0))), payment_method: input.payment_method || "event_cashless", operator_id: input.operator_id || null, point_of_sale_id: input.point_of_sale_id || null, food_truck_id: input.food_truck_id || null, is_courtesy: input.is_courtesy === true, courtesy_reason: input.courtesy_reason || "" });
    await this.audit.record({ type: "sambah_pay_event_consumption", status: "success", message: "Consumo de evento registrado", context: { event_id: eventId, consumption_id: consumption.id } });
    return { ok: true, consumption };
  }

  async report(eventId) {
    const consumptions = (await this.consumptions.all()).filter((item) => item.event_account_id === eventId);
    return { ok: true, event_id: eventId, total_consumptions: consumptions.length, total_amount: consumptions.reduce((sum, item) => sum + Number(item.total_amount || 0), 0), by_operator: groupCount(consumptions, "operator_id"), by_payment_method: groupCount(consumptions, "payment_method"), items: consumptions };
  }

  async close(eventId) {
    const event = await this.eventAccounts.update(eventId, { status: "closed", closed_at: this.now().toISOString() });
    if (!event) return { ok: false, error: "event_not_found" };
    await this.audit.record({ type: "sambah_pay_event_closed", status: "success", message: "Evento SamBah Pay fechado", context: { event_id: eventId } });
    return { ok: true, event, report: await this.report(eventId) };
  }
}

function groupCount(items, field) {
  return items.reduce((acc, item) => {
    const key = item[field] || "none";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
