/**
 * Who sees which records, within a workspace everyone already shares.
 *
 * Module permissions answer "may you open Clients at all". This answers the
 * next question down: once you are in, do you see every account or only the
 * ones you handle. A salesperson working their own book wants the second;
 * an administrator needs the first.
 *
 * Deliberately NOT derived from the role. Two people can hold the same role
 * and need different visibility - a senior sales lead covering the whole book
 * and a new starter on their own accounts are both SALES_EXECUTIVE. So it is
 * a property of the membership, set per person in Team Management.
 *
 * Pure, so the rule can be tested without a database. The filters it returns
 * are plain objects that Prisma accepts as `where` fragments; keeping them
 * data rather than queries is what makes the decision testable at all.
 *
 * The default is UNRESTRICTED. A restriction nobody asked for is the
 * dangerous default: it silently hides records and looks like data loss.
 */

export type RecordScope = {
  /** The viewer's membership id. Null for someone outside the workspace. */
  membershipId: string | null
  /** True when this person should see only records they own. */
  restrictedToOwn: boolean
}

/** A `where` fragment. Empty object means "no restriction". */
export type ScopeFilter = Record<string, unknown>

/**
 * Whether this viewer sees everything in the workspace.
 *
 * Someone restricted but with no membership id sees NOTHING rather than
 * everything - if we cannot tell which records are theirs, the safe answer
 * is none of them, not all of them.
 */
export function seesAllRecords(scope: RecordScope): boolean {
  return !scope.restrictedToOwn
}

/**
 * The filter for clients.
 *
 * `ownerId` is the account owner - who handles this client. A restricted
 * viewer sees the accounts assigned to them and nothing else, including no
 * unassigned ones: an account with no owner is not implicitly everybody's.
 */
export function clientScopeFilter(scope: RecordScope): ScopeFilter {
  if (seesAllRecords(scope)) return {}
  // No membership and restricted: nothing can match, which is the safe
  // reading of "only their own" when we cannot say who they are.
  if (!scope.membershipId) return { id: { in: [] } }
  return { ownerId: scope.membershipId }
}

/**
 * The filter for leads.
 *
 * A lead is "theirs" when it is assigned to them. Unlike clients, a lead with
 * nobody assigned IS shown to everyone: an unworked lead sitting invisible in
 * a queue is how it goes stale, and the inbox exists to surface exactly that.
 */
export function dealScopeFilter(scope: RecordScope): ScopeFilter {
  if (seesAllRecords(scope)) return {}
  if (!scope.membershipId) return { id: { in: [] } }
  return { OR: [{ assignedToId: scope.membershipId }, { assignedToId: null }] }
}

/** The filter for projects. "Theirs" means they manage it. */
export function projectScopeFilter(scope: RecordScope): ScopeFilter {
  if (seesAllRecords(scope)) return {}
  if (!scope.membershipId) return { id: { in: [] } }
  return { managerId: scope.membershipId }
}

/**
 * The filter for documents.
 *
 * Documents hang off a client rather than carrying their own assignment, so
 * the restriction follows the client's owner. A document with no client at
 * all is not visible to a restricted viewer - there is nothing tying it to
 * them.
 */
export function documentScopeFilter(scope: RecordScope): ScopeFilter {
  if (seesAllRecords(scope)) return {}
  if (!scope.membershipId) return { id: { in: [] } }
  return { client: { ownerId: scope.membershipId } }
}

/**
 * Merges a scope filter into a `where` that is already built.
 *
 * Spreading would let a scope key silently overwrite a caller's own
 * predicate - and a filter that quietly replaces "archivedAt: null" would
 * start showing deleted records to the one person who is meant to see less.
 * AND keeps both.
 */
export function withScope<T extends Record<string, unknown>>(
  where: T,
  filter: ScopeFilter
): T | (T & { AND: ScopeFilter[] }) {
  if (Object.keys(filter).length === 0) return where
  const existing = Array.isArray(where.AND) ? (where.AND as ScopeFilter[]) : []
  return { ...where, AND: [...existing, filter] }
}
