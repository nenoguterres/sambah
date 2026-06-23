export class InsanoWorkhubController {
  constructor({ workhubService }) {
    if (!workhubService) throw new TypeError("workhubService is required");
    this.service = workhubService;
  }

  createTask(body) { return this.service.createTask(body); }
  listTasks(filters) { return this.service.listTasks(filters); }
  updateTask(id, body) { return this.service.updateTask(id, body); }
  summary() { return this.service.summary(); }
}

