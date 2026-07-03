export class SambahPayAutoServeController {
  constructor({ autoserveService }) { this.autoserve = autoserveService; }
  createSession(body) { return this.autoserve.createSession(body); }
  addToCart(body) { return this.autoserve.addToCart(body); }
  checkout(body) { return this.autoserve.checkout(body); }
  status(sessionId) { return this.autoserve.getStatus(sessionId); }
  createRelease(body) { return this.autoserve.createReleaseToken(body); }
  validateRelease(token) { return this.autoserve.validateReleaseToken(token); }
  startRelease(token, body) { return this.autoserve.startRelease(token, body); }
  completeRelease(token, body) { return this.autoserve.completeRelease(token, body); }
  failRelease(token, body) { return this.autoserve.failRelease(token, body); }
}
