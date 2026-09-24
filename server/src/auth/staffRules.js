import { Staff, User } from '../models/index.js';
import { PERMISSIONS, isValidGrant, scopeCovers } from './permissions.js';
import { AppError } from '../utils/AppError.js';
import { idString } from '../utils/ids.js';

/** Number of active Directors with an active login. */
export async function activeDirectorCount({ excludeStaffId } = {}) {
  const directors = await Staff.find({ staffRole: 'director', status: 'active', user: { $ne: null }, ...(excludeStaffId ? { _id: { $ne: excludeStaffId } } : {}) })
    .select('user')
    .lean();
  if (directors.length === 0) return 0;
  return User.countDocuments({ _id: { $in: directors.map((d) => d.user) }, status: 'active' });
}

/**
 * Rules for changing someone's staff access. Nobody can raise their own privileges,
 * and nobody can hand out more than they hold themselves.
 */
export function assertCanManageStaff(auth, target, { newRole, grants } = {}) {
  if (target.user && idString(target.user) === idString(auth.user._id)) {
    throw AppError.forbidden('You cannot change your own role, permissions or status.', 'SELF_MODIFICATION');
  }
  if (target.staffRole === 'director' && !auth.isDirector) {
    throw AppError.forbidden('Only a Club Director can change another Director.');
  }
  if (newRole === 'director' && !auth.isDirector) {
    throw AppError.forbidden('Only a Club Director can appoint a Director.');
  }
  if (grants && !auth.isDirector) {
    for (const g of grants) {
      const held = auth.grants.get(g.permission);
      if (!held || !scopeCovers(held, g.scope)) {
        throw AppError.forbidden(`You cannot grant "${PERMISSIONS[g.permission]?.label ?? g.permission}" because you do not hold it at that scope.`);
      }
    }
  }
}

export function validateGrants(grants) {
  const problems = [];
  grants.forEach((g, i) => {
    if (!isValidGrant(g)) problems.push({ path: `grants.${i}`, message: `"${g.scope}" is not a valid scope for ${g.permission}.` });
  });
  if (problems.length) throw AppError.validation(problems);
  // Keep one grant per permission (the broadest).
  const map = new Map();
  for (const g of grants) {
    const cur = map.get(g.permission);
    if (!cur || scopeCovers(g.scope, cur)) map.set(g.permission, g.scope);
  }
  return [...map.entries()].map(([permission, scope]) => ({ permission, scope }));
}
