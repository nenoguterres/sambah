export class SambahPayWalletController {
  constructor({ walletService }) { this.wallet = walletService; }
  create(body) { return this.wallet.createWallet(body); }
  get(customerId) { return this.wallet.getWallet(customerId); }
  addCredit(customerId, body) { return this.wallet.addCredit(customerId, body); }
  debit(customerId, body) { return this.wallet.debit(customerId, body); }
  statement(customerId) { return this.wallet.statement(customerId); }
}
