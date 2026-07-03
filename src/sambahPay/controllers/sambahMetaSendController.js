export class SambahMetaSendController {
  constructor({ metaSendService }) {
    this.metaSend = metaSendService;
  }

  send(body) {
    return this.metaSend.sendText(body);
  }

  debug() {
    return this.metaSend.debug();
  }
}
