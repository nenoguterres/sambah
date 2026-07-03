export class SambahVoicePayController {
  constructor({ voiceService }) {
    this.voice = voiceService;
  }

  dashboard() { return this.voice.dashboard(); }
  transcriptions(query) { return this.voice.listTranscriptions({ limit: query.get("limit") }); }
  intents(query) { return this.voice.listIntents({ limit: query.get("limit") }); }
  confirmIntent(intentId) { return this.voice.confirmIntent(intentId); }
  responses(query) { return this.voice.listResponses({ limit: query.get("limit") }); }
  handoffs(query) { return this.voice.listHandoffs({ limit: query.get("limit") }); }
  paymentLinks(query) { return this.voice.listPaymentLinks({ limit: query.get("limit") }); }
  audit(query) { return this.voice.listVoiceAudit({ limit: query.get("limit") }); }
  webhookWhatsapp(body) { return this.voice.webhookWhatsapp(body); }
  transcribe(body) { return this.voice.transcribe(body); }
  intent(body) { return this.voice.identifyIntent(body); }
  respond(body) { return this.voice.respond(body); }
  handoff(body) { return this.voice.handoff(body); }
  checkout(body) { return this.voice.voiceCheckout(body); }
  walletTopup(body) { return this.voice.walletTopup(body); }
  autoserveRelease(body) { return this.voice.autoserveRelease(body); }
  session(sessionId) { return this.voice.getVoiceSession(sessionId); }
}
