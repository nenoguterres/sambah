import crypto from "node:crypto";

const CRITICAL_INTENTS = new Set([
  "fechar_mesa",
  "pagar_conta",
  "gerar_pix",
  "comprar_credito_wallet",
  "autoserve_purchase",
  "autoserve_release"
]);

export class SambahVoicePayService {
  constructor({ repositories, audit, adapters, coreService, walletService, autoserveService, deviceService, now = () => new Date() } = {}) {
    this.repositories = repositories;
    this.audit = audit;
    this.adapters = adapters;
    this.core = coreService;
    this.wallet = walletService;
    this.autoserve = autoserveService;
    this.device = deviceService;
    this.now = now;
  }

  async webhookWhatsapp(input = {}) {
    const media = await this.adapters.whatsapp.receiveMedia(input);
    const session = await this.ensureSession({ customer_id: media.from, channel: "whatsapp_voice", phone: media.from });
    const message = await this.repositories.voiceMessages.insert({
      id: crypto.randomUUID(),
      session_id: session.id,
      provider_message_id: media.messageId,
      from: media.from,
      media_url: media.mediaUrl,
      direction: "inbound",
      status: "received",
      raw_payload: input
    });
    await this.audit.record({ type: "sambah_voice_message_received", status: "success", message: "Audio WhatsApp simulado recebido", context: { session_id: session.id, voice_message_id: message.id } });

    const transcription = await this.transcribe({ session_id: session.id, voice_message_id: message.id, media_url: media.mediaUrl, transcript: input.transcript || input.text || input.mock_text });
    const intent = await this.identifyIntent({ session_id: session.id, transcription_id: transcription.transcription.id, text: transcription.transcription.text });
    const response = await this.respond({ session_id: session.id, intent_id: intent.intent.id });
    return { ok: true, session, voice_message: message, transcription: transcription.transcription, intent: intent.intent, response: response.response };
  }

  async ensureSession(input = {}) {
    const sessionKey = input.session_id || input.phone || input.customer_id || crypto.randomUUID();
    const existing = await this.repositories.voiceSessions.findOne((item) => item.session_key === sessionKey && item.status !== "closed");
    if (existing) return existing;
    return this.repositories.voiceSessions.insert({
      id: crypto.randomUUID(),
      session_key: sessionKey,
      customer_id: input.customer_id || null,
      phone: input.phone || null,
      channel: input.channel || "whatsapp_voice",
      status: "open",
      last_intent: null,
      handoff_required: false,
      created_at: this.now().toISOString()
    });
  }

  async transcribe(input = {}) {
    const session = await this.ensureSession(input);
    const result = await this.adapters.stt.transcribe(input);
    const transcription = await this.repositories.voiceTranscriptions.insert({
      id: crypto.randomUUID(),
      session_id: session.id,
      voice_message_id: input.voice_message_id || null,
      provider: result.provider,
      text: result.text,
      confidence: result.confidence,
      language: result.language,
      status: "transcribed",
      raw_payload: result.raw
    });
    await this.audit.record({ type: "sambah_voice_transcribed", status: "success", message: "Audio transcrito em modo simulado", context: { session_id: session.id, transcription_id: transcription.id } });
    return { ok: true, session, transcription };
  }

  async identifyIntent(input = {}) {
    const session = await this.ensureSession(input);
    const result = await this.adapters.intent.detect({ text: input.text });
    const intent = await this.repositories.voiceIntents.insert({
      id: crypto.randomUUID(),
      session_id: session.id,
      transcription_id: input.transcription_id || null,
      intent: result.intent,
      confidence: result.confidence,
      confirmation_required: result.confirmationRequired,
      confirmed: input.confirmed === true,
      entities: result.entities,
      status: "identified"
    });
    await this.repositories.voiceSessions.update(session.id, { last_intent: result.intent, handoff_required: result.intent === "falar_com_humano" });
    await this.audit.record({ type: "sambah_voice_intent_identified", status: "success", message: "Intent de voz identificada", context: { session_id: session.id, intent_id: intent.id, intent: intent.intent, confirmation_required: intent.confirmation_required } });
    return { ok: true, session, intent };
  }

  async respond(input = {}) {
    const session = await this.ensureSession(input);
    const intent = input.intent_id ? await this.repositories.voiceIntents.findById(input.intent_id) : null;
    const intentName = input.intent || intent?.intent || "novo_pedido";
    const text = input.text || this.defaultResponse(intentName, intent);
    const audio = await this.adapters.tts.synthesize({ text });
    const sentText = await this.adapters.whatsapp.sendText({ to: session.phone, text, sessionId: session.id });
    const sentAudio = await this.adapters.whatsapp.sendAudio({ to: session.phone, audioUrl: audio.audioUrl, sessionId: session.id });
    const response = await this.repositories.voiceResponses.insert({
      id: crypto.randomUUID(),
      session_id: session.id,
      intent_id: intent?.id || null,
      text,
      audio_url: audio.audioUrl,
      status: "sent",
      provider: this.adapters.whatsapp.provider,
      raw_payload: { text: sentText, audio: sentAudio }
    });
    await this.audit.record({ type: "sambah_voice_response_sent", status: "success", message: "Resposta de voz simulada enviada", context: { session_id: session.id, response_id: response.id, intent: intentName } });
    return { ok: true, session, response };
  }

  async handoff(input = {}) {
    const session = await this.ensureSession(input);
    const ticket = await this.adapters.handoff.createTicket({ session_id: session.id, reason: input.reason || "voice_complex_case" });
    const log = await this.repositories.voiceHandoffLogs.insert({
      id: crypto.randomUUID(),
      session_id: session.id,
      reason: input.reason || "voice_complex_case",
      status: ticket.status,
      ticket_id: ticket.ticketId,
      provider: ticket.provider,
      raw_payload: ticket.raw
    });
    await this.repositories.voiceSessions.update(session.id, { handoff_required: true, status: "handoff" });
    await this.audit.record({ type: "sambah_voice_handoff_created", status: "warning", message: "Atendimento por voz transferido para humano", context: { session_id: session.id, handoff_id: log.id } });
    return { ok: true, session, handoff: log };
  }

  async voiceCheckout(input = {}) {
    const gate = this.requireConfirmation(input, "pagar_conta");
    if (!gate.ok) return gate;
    const payment = await this.core.createPayment({ amount: input.amount || 0, method: input.method || "voice_manual_simulated", status: "paid", customer_id: input.customer_id || null, channel: "voice_pay", metadata: { session_id: input.session_id || null } });
    const link = await this.repositories.voicePaymentLinks.insert({ id: crypto.randomUUID(), session_id: input.session_id || null, payment_id: payment.payment.id, type: "checkout", status: "simulated_paid", amount: payment.payment.amount, url: `mock://voice-payment/${payment.payment.id}` });
    await this.audit.record({ type: "sambah_voice_pay_checkout", status: "success", message: "Checkout por voz simulado", context: { payment_id: payment.payment.id, session_id: input.session_id || null } });
    return { ok: true, payment: payment.payment, voice_payment_link: link };
  }

  async walletTopup(input = {}) {
    const gate = this.requireConfirmation(input, "comprar_credito_wallet");
    if (!gate.ok) return gate;
    const customerId = input.customer_id || input.customerId || "voice-customer";
    const payment = await this.core.createPayment({ amount: input.amount || 0, method: "voice_wallet_topup_simulated", status: "paid", customer_id: customerId, channel: "voice_pay" });
    const wallet = await this.wallet.addCredit(customerId, { amount: input.amount || 0, reference_type: "voice_payment", reference_id: payment.payment.id, reason: "voice_wallet_topup" });
    const link = await this.repositories.voicePaymentLinks.insert({ id: crypto.randomUUID(), session_id: input.session_id || null, payment_id: payment.payment.id, type: "wallet_topup", status: "simulated_paid", amount: payment.payment.amount, url: `mock://voice-wallet/${payment.payment.id}` });
    await this.audit.record({ type: "sambah_voice_wallet_topup", status: "success", message: "Credito wallet por voz simulado", context: { payment_id: payment.payment.id, customer_id: customerId } });
    return { ok: true, payment: payment.payment, wallet: wallet.wallet, movement: wallet.movement, voice_payment_link: link };
  }

  async autoserveRelease(input = {}) {
    if (!input.device_id && !input.deviceId && !input.release_token && !input.token) {
      await this.audit.record({ type: "sambah_voice_autoserve_missing_device", status: "warning", message: "Compra AutoServe por voz sem device selecionado", context: { product_id: input.product_id || input.productId || null } });
      return { ok: false, error: "voice_autoserve_device_required", message: "Crie ou selecione um device antes da compra AutoServe." };
    }
    const gate = this.requireConfirmation(input, "autoserve_release");
    if (!gate.ok) return gate;
    if (input.release_token || input.token) {
      return this.autoserve.startRelease(input.release_token || input.token, { simulateFailure: input.simulateFailure === true });
    }
    const session = await this.autoserve.createSession({ customer_id: input.customer_id || "voice-customer", channel: "voice" });
    const cart = await this.autoserve.addToCart({ session_id: session.session.id, product_id: input.product_id, device_id: input.device_id, quantity: input.quantity || 1 });
    if (!cart.ok) return cart;
    const checkout = await this.autoserve.checkout({ session_id: session.session.id, method: "voice_autoserve_simulated" });
    const link = await this.repositories.voicePaymentLinks.insert({ id: crypto.randomUUID(), session_id: session.session.id, payment_id: checkout.payment.id, type: "autoserve_release", status: "simulated_paid", amount: checkout.payment.amount, url: `mock://voice-autoserve/${checkout.payment.id}` });
    await this.audit.record({ type: "sambah_voice_autoserve_purchase", status: "success", message: "Compra AutoServe por voz simulada", context: { session_id: session.session.id } });
    return { ok: true, session: checkout.session, payment: checkout.payment, release_tokens: checkout.release_tokens, voice_payment_link: link };
  }

  async dashboard() {
    const [messages, transcriptions, intents, responses, handoffs, paymentLinks, auditLogs, releaseTokens] = await Promise.all([
      this.repositories.voiceMessages.all(),
      this.repositories.voiceTranscriptions.all(),
      this.repositories.voiceIntents.all(),
      this.repositories.voiceResponses.all(),
      this.repositories.voiceHandoffLogs.all(),
      this.repositories.voicePaymentLinks.all(),
      this.repositories.auditLogs.all(),
      this.repositories.releaseTokens.all()
    ]);
    const voiceAudit = auditLogs.filter((item) => String(item.type || "").startsWith("sambah_voice"));
    return {
      ok: true,
      mode: "simulated",
      generated_at: this.now().toISOString(),
      totals: {
        voice_messages: messages.length,
        transcriptions: transcriptions.length,
        intents: intents.length,
        low_confidence_intents: intents.filter((item) => Number(item.confidence || 0) < 0.7).length,
        responses: responses.length,
        handoffs: handoffs.length,
        checkouts: paymentLinks.filter((item) => item.type === "checkout").length,
        wallet_topups: paymentLinks.filter((item) => item.type === "wallet_topup").length,
        autoserve_releases: paymentLinks.filter((item) => item.type === "autoserve_release").length,
        understanding_failures: voiceAudit.filter((item) => item.type === "sambah_voice_understanding_failed" || item.status === "error").length
      }
    };
  }

  async listTranscriptions({ limit = 100 } = {}) {
    const items = await this.repositories.voiceTranscriptions.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async listIntents({ limit = 100 } = {}) {
    const items = await this.repositories.voiceIntents.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async confirmIntent(intentId) {
    const intent = await this.repositories.voiceIntents.update(intentId, { confirmed: true, status: "confirmed" });
    if (!intent) return { ok: false, error: "voice_intent_not_found" };
    await this.audit.record({ type: "sambah_voice_intent_confirmed", status: "success", message: "Intent critica confirmada no painel", context: { intent_id: intentId, intent: intent.intent } });
    return { ok: true, intent };
  }

  async listResponses({ limit = 100 } = {}) {
    const items = await this.repositories.voiceResponses.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async listHandoffs({ limit = 100 } = {}) {
    const items = await this.repositories.voiceHandoffLogs.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async listPaymentLinks({ limit = 100 } = {}) {
    const items = await this.repositories.voicePaymentLinks.all();
    return { ok: true, total: items.length, items: items.slice(0, Number(limit) || 100) };
  }

  async listVoiceAudit({ limit = 100 } = {}) {
    const items = await this.repositories.auditLogs.all();
    const voiceItems = items.filter((item) => String(item.type || "").startsWith("sambah_voice"));
    return { ok: true, total: voiceItems.length, items: voiceItems.slice(0, Number(limit) || 100) };
  }

  async getVoiceSession(sessionId) {
    const session = await this.repositories.voiceSessions.findById(sessionId);
    if (!session) return { ok: false, error: "voice_session_not_found" };
    const [messages, transcriptions, intents, responses, handoffs, links] = await Promise.all([
      this.repositories.voiceMessages.all(),
      this.repositories.voiceTranscriptions.all(),
      this.repositories.voiceIntents.all(),
      this.repositories.voiceResponses.all(),
      this.repositories.voiceHandoffLogs.all(),
      this.repositories.voicePaymentLinks.all()
    ]);
    return {
      ok: true,
      session,
      messages: messages.filter((item) => item.session_id === sessionId),
      transcriptions: transcriptions.filter((item) => item.session_id === sessionId),
      intents: intents.filter((item) => item.session_id === sessionId),
      responses: responses.filter((item) => item.session_id === sessionId),
      handoffs: handoffs.filter((item) => item.session_id === sessionId),
      payment_links: links.filter((item) => item.session_id === sessionId)
    };
  }

  requireConfirmation(input, intent) {
    if (CRITICAL_INTENTS.has(intent) && input.confirmed !== true) {
      this.audit.record({ type: "sambah_voice_confirmation_required", status: "warning", message: "Intent critica de voz exige confirmacao", context: { intent, session_id: input.session_id || null } });
      return { ok: false, error: "voice_confirmation_required", intent, confirmation_required: true };
    }
    return { ok: true };
  }

  defaultResponse(intentName, intentRecord) {
    if (intentRecord?.confirmation_required && !intentRecord.confirmed) {
      return `Entendi a intencao ${intentName}. Para seguir, preciso da sua confirmacao.`;
    }
    if (intentName === "falar_com_humano") return "Vou transferir seu atendimento para uma pessoa da equipe.";
    if (intentName === "reportar_falha_maquina") return "Registrei o relato de falha da maquina e vou acionar a operacao.";
    if (intentName === "consultar_saldo_wallet") return "Vou consultar sua carteira SamBah.";
    return "Entendi sua mensagem. O SamBah vai organizar o atendimento e seguir pelo fluxo correto.";
  }
}
