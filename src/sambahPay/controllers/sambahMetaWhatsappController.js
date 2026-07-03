export class SambahMetaWhatsappController {
  constructor({ metaWhatsappService }) {
    this.metaWhatsapp = metaWhatsappService;
  }

  verify(query) {
    return this.metaWhatsapp.verify(query);
  }

  receiveWebhook(body) {
    return this.metaWhatsapp.receiveWebhook(body);
  }
}
