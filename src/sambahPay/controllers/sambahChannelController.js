export class SambahChannelController {
  constructor({ channelService }) {
    this.channel = channelService;
  }

  receiveMessage(body) {
    return this.channel.receiveMessage(body);
  }
}
