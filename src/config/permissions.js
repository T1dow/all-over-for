/**
 * src/config/permissions.js
 * ------------------------------------------------------------------
 * Role-Based Access Control (RBAC) definition (FR-02, NFR-SEC-02).
 *
 * Five roles, one permission map. Every permission is a string like
 * "users.manage". The map is the SINGLE source of truth; the
 * middleware (middleware/rbac.js) and the navigation both read it.
 *
 * Rule: "deny by default" — a role only has what is listed here.
 * ------------------------------------------------------------------
 */

const ROLES = {
  ADMIN: 'ADMIN',
  PAYROLL_OFFICER: 'PAYROLL_OFFICER',
  HR_OFFICER: 'HR_OFFICER',
  MANAGEMENT: 'MANAGEMENT',
  EMPLOYEE: 'EMPLOYEE',
};

const ROLE_LABELS = {
  ADMIN: 'System Administrator',
  PAYROLL_OFFICER: 'Payroll Officer',
  HR_OFFICER: 'HR Officer',
  MANAGEMENT: 'School Management',
  EMPLOYEE: 'Employee',
};

const PERMISSIONS = {
  ADMIN: [
    'dashboard.view',
    'users.manage',
    'employees.view', 'employees.manage',
    'salaries.manage',
    'allowances.manage',
    'deductions.manage',
    'payroll.process', 'payroll.finalise', 'payroll.override',
    'payslips.view_all', 'payslips.regenerate',
    'email.manage',
    'reports.view',
    'audit.view',
    'settings.manage',
    'scheduler.manage',
    'profile.edit_own',
  ],
  PAYROLL_OFFICER: [
    'dashboard.view',
    'employees.view', 'employees.manage',
    'salaries.manage',
    'allowances.manage',
    'deductions.manage',
    'payroll.process', 'payroll.finalise',
    'payslips.view_all', 'payslips.regenerate',
    'email.manage',
    'reports.view',
    'scheduler.manage',
    'profile.edit_own',
  ],
  HR_OFFICER: [
    'dashboard.view',
    'employees.view', 'employees.manage',
    'profile.edit_own',
  ],
  MANAGEMENT: [
    'dashboard.view',
    'employees.view',
    'payslips.view_all',
    'reports.view',
    'profile.edit_own',
  ],
  EMPLOYEE: [
    'dashboard.view',
    'payslips.view_own',
    'profile.edit_own',
  ],
};

/** True if the role holds the permission. Deny by default. */
function can(role, permission) {
  if (!role) return false;
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Navigation items. `available: false` items appear greyed out until
 * their stage ships (no dead links); the permission still controls
 * visibility per role.
 */
const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', permission: 'dashboard.view', available: true },
  { label: 'Employees', href: '/employees', permission: 'employees.view', available: true },
  { label: 'Allowances', href: '/allowances', permission: 'allowances.manage', available: true },
  { label: 'Deductions', href: '/deductions', permission: 'deductions.manage', available: true },
  { label: 'Payroll', href: '/payroll', permission: 'payroll.process', available: true },
  { label: 'Payslips', href: '/payslips', permission: 'payslips.view_all', available: true },
  { label: 'My Payslips', href: '/payslips', permission: 'payslips.view_own', available: true },
  { label: 'Notifications', href: '/notifications', permission: 'email.manage', available: true },
  { label: 'Scheduler', href: '/scheduler', permission: 'scheduler.manage', available: true },
  { label: 'Reports', href: '/reports', permission: 'reports.view', available: true },
  { label: 'Users', href: '/users', permission: 'users.manage', available: true },
  { label: 'Audit Log', href: '/audit', permission: 'audit.view', available: true },
  { label: 'Settings', href: '/settings', permission: 'settings.manage', available: true },
];

module.exports = { ROLES, ROLE_LABELS, PERMISSIONS, NAV_ITEMS, can };
