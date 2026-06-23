export const SAMBAH_ROLES = ["ADMIN", "GERENTE", "CAIXA", "OPERADOR", "ATENDENTE", "AUDITOR"];

const ROLE_PERMISSIONS = {
  ADMIN: ["voice_checkout", "voice_wallet_topup", "voice_autoserve_release", "voice_handoff", "voice_audit_full", "voice_reprocess", "voice_cancel", "voice_session", "ecosystem_bootstrap", "lgpd_view", "lgpd_export", "critical_logs_view", "privacy_request_manage", "retention_policy_manage"],
  GERENTE: ["voice_checkout", "voice_wallet_topup_partial", "voice_autoserve_release_partial", "voice_handoff", "voice_audit_full", "voice_session", "lgpd_view", "critical_logs_view"],
  CAIXA: ["voice_checkout", "voice_wallet_topup", "voice_audit_summary", "voice_session"],
  OPERADOR: ["voice_simulate", "voice_session", "voice_handoff"],
  ATENDENTE: ["voice_simulate", "voice_respond", "voice_handoff", "voice_intent"],
  AUDITOR: ["voice_audit_full", "voice_session", "lgpd_view", "lgpd_export", "critical_logs_view"]
};

const PERMISSION_MATRIX_ACTIONS = [
  { key: "checkout", label: "Checkout", permission: "voice_checkout" },
  { key: "wallet", label: "Wallet", permission: "voice_wallet_topup" },
  { key: "autoserve", label: "Autoserve", permission: "voice_autoserve_release" },
  { key: "audit", label: "Auditoria", fullPermission: "voice_audit_full", partialPermission: "voice_audit_summary" },
  { key: "settings", label: "Configuracoes", adminOnly: true },
  { key: "bootstrap", label: "Bootstrap Demo", permission: "ecosystem_bootstrap" },
  { key: "lgpd", label: "LGPD", permission: "lgpd_view" },
  { key: "critical_logs", label: "Logs Criticos", permission: "critical_logs_view" }
];

export class SambahPermissionService {
  constructor({ audit, now = () => new Date() } = {}) {
    this.audit = audit;
    this.now = now;
  }

  normalizeRole(role) {
    const value = String(role || "ATENDENTE").trim().toUpperCase();
    return SAMBAH_ROLES.includes(value) ? value : "ATENDENTE";
  }

  permissionsFor(role) {
    return ROLE_PERMISSIONS[this.normalizeRole(role)] || ROLE_PERMISSIONS.ATENDENTE;
  }

  can(role, permission) {
    const normalized = this.normalizeRole(role);
    const permissions = this.permissionsFor(normalized);
    if (permissions.includes(permission)) return true;
    if (permission === "voice_wallet_topup" && permissions.includes("voice_wallet_topup_partial")) return true;
    if (permission === "voice_autoserve_release" && permissions.includes("voice_autoserve_release_partial")) return true;
    if (permission === "voice_audit_summary" && permissions.includes("voice_audit_full")) return true;
    return false;
  }

  async authorize({ role, permission, action, path, context = {} } = {}) {
    const normalized = this.normalizeRole(role);
    if (this.can(normalized, permission)) return { ok: true, role: normalized, permission };
    await this.audit.record({
      type: "sambah_permission_denied",
      status: "warning",
      message: context.source === "session" ? "Tentativa bloqueada por permissao da sessao" : "Tentativa bloqueada por permissao mockada",
      context: {
        role: normalized,
        permission,
        action: action || permission,
        path: path || null,
        ...context
      }
    });
    return {
      ok: false,
      statusCode: 403,
      error: "permission_denied",
      role: normalized,
      permission,
      message: context.source === "session" ? "Perfil da sessao sem permissao para esta acao" : "Perfil sem permissao para esta acao em modo mockado"
    };
  }

  matrix() {
    return {
      ok: true,
      roles: SAMBAH_ROLES,
      permissions: ROLE_PERMISSIONS,
      actions: PERMISSION_MATRIX_ACTIONS,
      matrix: this.permissionMatrix(),
      default_role: "ATENDENTE",
      mode: "internal",
      note: "Permissoes internas locais para validacao do SamBah Voice Pay"
    };
  }

  permissionMatrix() {
    return SAMBAH_ROLES.reduce((matrix, role) => {
      matrix[role] = PERMISSION_MATRIX_ACTIONS.reduce((row, action) => {
        row[action.key] = this.statusForAction(role, action);
        return row;
      }, {});
      return matrix;
    }, {});
  }

  statusForAction(role, action) {
    if (action.adminOnly) return this.normalizeRole(role) === "ADMIN" ? "Liberado" : "Bloqueado";
    if (action.fullPermission && this.can(role, action.fullPermission)) return "Liberado";
    if (action.partialPermission && this.can(role, action.partialPermission)) return "Parcial";
    if (action.permission && this.can(role, action.permission)) {
      const permissions = this.permissionsFor(role);
      if (action.permission === "voice_wallet_topup" && permissions.includes("voice_wallet_topup_partial")) return "Parcial";
      if (action.permission === "voice_autoserve_release" && permissions.includes("voice_autoserve_release_partial")) return "Parcial";
      return "Liberado";
    }
    return "Bloqueado";
  }
}
