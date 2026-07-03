const ROLES = ["ADMIN", "OPERADOR", "ATENDENTE", "CAIXA", "AUDITOR"];

const ACTIONS = [
  "draft_create",
  "draft_update",
  "draft_submit_review",
  "draft_approve",
  "draft_reject",
  "draft_schedule",
  "draft_delete",
  "giro_intelligent_run",
  "campaign_create",
  "campaign_update",
  "campaign_delete"
];

const ROLE_ACTIONS = {
  ADMIN: new Set(ACTIONS),
  OPERADOR: new Set([
    "draft_create",
    "draft_update",
    "draft_submit_review",
    "draft_approve",
    "draft_reject",
    "draft_delete",
    "giro_intelligent_run",
    "campaign_create",
    "campaign_update",
    "campaign_delete"
  ]),
  ATENDENTE: new Set(["draft_create", "draft_update", "draft_submit_review", "giro_intelligent_run", "campaign_create", "campaign_update"]),
  CAIXA: new Set(["draft_create", "draft_update", "draft_submit_review", "campaign_create"]),
  AUDITOR: new Set()
};

export class PerolaPermissionService {
  normalizeRole(role) {
    const normalized = String(role || "ATENDENTE").trim().toUpperCase();
    return ROLES.includes(normalized) ? normalized : "ATENDENTE";
  }

  can(role, action) {
    return ROLE_ACTIONS[this.normalizeRole(role)]?.has(action) || false;
  }

  authorize(role, action) {
    const normalizedRole = this.normalizeRole(role);
    if (this.can(normalizedRole, action)) {
      return { ok: true, role: normalizedRole, action };
    }
    return {
      ok: false,
      statusCode: 403,
      error: "permission_denied",
      message: "Perfil sem permissao para esta acao no Perola.",
      role: normalizedRole,
      action
    };
  }

  matrix() {
    return {
      success: true,
      mode: "local-mock",
      defaultRole: "ATENDENTE",
      roles: ROLES,
      actions: ACTIONS,
      matrix: Object.fromEntries(ROLES.map((role) => [
        role,
        Object.fromEntries(ACTIONS.map((action) => [action, this.can(role, action)]))
      ]))
    };
  }
}

export function permissionActionForDraftPatch(input = {}) {
  const statusActions = {
    pending_review: "draft_submit_review",
    approved: "draft_approve",
    rejected: "draft_reject",
    scheduled: "draft_schedule"
  };
  return statusActions[input.status] || "draft_update";
}
