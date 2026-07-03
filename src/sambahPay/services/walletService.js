import crypto from "node:crypto";
import { WALLET_STATUS, assertOneOf, normalizeMoney } from "../models/schemas.js";

export class SambahPayWalletService {
  constructor({ walletsRepository, movementsRepository, blocklistRepository, audit, eventBus, now = () => new Date() } = {}) {
    this.wallets = walletsRepository;
    this.movements = movementsRepository;
    this.blocklist = blocklistRepository;
    this.audit = audit;
    this.eventBus = eventBus;
    this.now = now;
  }

  async createWallet(input = {}) {
    const customerId = input.customer_id || input.customerId;
    if (!customerId) return { ok: false, error: "customer_required" };
    const existing = await this.wallets.findOne((wallet) => wallet.customer_id === customerId);
    if (existing) return { ok: true, wallet: existing, existing: true };
    const wallet = await this.wallets.insert({ id: crypto.randomUUID(), customer_id: customerId, status: "active", balance: 0, currency: "BRL", expires_at: input.expires_at || null });
    await this.audit.record({ type: "sambah_pay_wallet_created", status: "success", message: "Wallet criada", context: { wallet_id: wallet.id, customer_id: customerId } });
    return { ok: true, wallet };
  }

  async getWallet(customerId) {
    const wallet = await this.wallets.findOne((item) => item.customer_id === customerId);
    return { ok: Boolean(wallet), wallet };
  }

  async addCredit(customerId, input = {}) {
    return this.move(customerId, { ...input, type: "credit", amount: normalizeMoney(input.amount) });
  }

  async debit(customerId, input = {}) {
    return this.move(customerId, { ...input, type: "debit", amount: -Math.abs(normalizeMoney(input.amount)) });
  }

  async move(customerId, input = {}) {
    const blocked = await this.blocklist.findOne((item) => item.customer_id === customerId && item.status === "active" && ["wallet", "all"].includes(item.scope));
    if (blocked) return { ok: false, error: "customer_blocked" };
    const walletResult = await this.createWallet({ customer_id: customerId });
    const wallet = walletResult.wallet;
    assertOneOf(wallet.status, WALLET_STATUS, "wallet.status");
    if (wallet.status !== "active") return { ok: false, error: "wallet_not_active" };
    const balanceBefore = normalizeMoney(wallet.balance);
    const amount = normalizeMoney(input.amount);
    const balanceAfter = normalizeMoney(balanceBefore + amount);
    if (balanceAfter < 0) return { ok: false, error: "insufficient_balance" };
    const movement = await this.movements.insert({
      id: crypto.randomUUID(),
      wallet_id: wallet.id,
      customer_id: customerId,
      type: input.type,
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_type: input.reference_type || null,
      reference_id: input.reference_id || null,
      operator_id: input.operator_id || null,
      reason: input.reason || "simulated_wallet_movement"
    });
    const updated = await this.wallets.update(wallet.id, { balance: balanceAfter });
    await this.audit.record({ type: "sambah_pay_wallet_movement", status: "success", message: "Movimentacao de wallet registrada", context: { wallet_id: wallet.id, movement_id: movement.id, amount, balance_after: balanceAfter } });
    await this.eventBus?.publish?.({
      type: amount >= 0 ? "wallet.credited" : "wallet.debited",
      aggregateType: "wallet",
      aggregateId: wallet.id,
      payload: { wallet: updated, movement },
      correlationId: input.correlationId
    });
    return { ok: true, wallet: updated, movement };
  }

  async statement(customerId) {
    const movements = await this.movements.all();
    const items = movements.filter((item) => item.customer_id === customerId);
    return { ok: true, total: items.length, items };
  }
}
