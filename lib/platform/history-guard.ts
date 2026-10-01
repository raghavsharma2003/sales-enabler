import { sameWorkspaceRoute, type WorkspaceRoute } from './navigation';

const positionKey = '__relayWorkspacePosition';
type Position = { scope: string; index: number };
type HistoryPort = {
  read: () => { route: WorkspaceRoute; state: unknown };
  write: (mode: 'push' | 'replace', state: Record<string, unknown>, route?: WorkspaceRoute) => void;
  go: (delta: number) => void;
  allowLeave: () => boolean;
  accept: (route: WorkspaceRoute) => void;
  newScope: () => string;
};

function positionOf(state: unknown): Position | undefined {
  if (!state || typeof state !== 'object') return;
  const value = (state as Record<string, unknown>)[positionKey] as Position | undefined;
  if (value && typeof value.scope === 'string' && value.scope && Number.isSafeInteger(value.index) && value.index >= 0) return value;
}
function withPosition(state: unknown, position: Position): Record<string, unknown> {
  return { ...(state && typeof state === 'object' ? state : {}), [positionKey]: position };
}
const samePosition = (a?: Position, b?: Position) => !!a && !!b && a.scope === b.scope && a.index === b.index;

/** Browser-independent history policy. The port owns browser events and rendering. */
export class WorkspaceHistoryGuard {
  private accepted?: WorkspaceRoute;
  private position?: Position;
  private restoring = false;

  constructor(private port: HistoryPort) {}

  private freshPosition(): Position { return { scope: this.port.newScope(), index: 0 }; }

  sync(): void {
    const observed = this.port.read();
    const target = positionOf(observed.state);
    // popstate and hashchange both fire for a traversal. Neither the rejected
    // traversal nor its restoration should ask the operator a second time.
    if (this.restoring) {
      if (this.accepted && sameWorkspaceRoute(this.accepted, observed.route) && samePosition(this.position, target)) this.restoring = false;
      return;
    }
    const changed = !!this.accepted && !sameWorkspaceRoute(this.accepted, observed.route);
    if (changed && !this.port.allowLeave()) {
      if (this.position && target && this.position.scope === target.scope && this.position.index !== target.index) {
        this.restoring = true;
        this.port.go(this.position.index - target.index);
      } else {
        // An old/unmarked entry has no reliable direction. Preserve its URL;
        // append the accepted route rather than overwrite somebody's history.
        this.position = this.freshPosition();
        this.port.write('push', withPosition(observed.state, this.position), this.accepted);
      }
      return;
    }
    // Native hash links can inherit the current entry's state. Give their new
    // route its own position instead of assigning two URLs the same index.
    const position = changed && samePosition(target, this.position)
      ? { scope: this.position!.scope, index: this.position!.index + 1 }
      : target || this.freshPosition();
    if (!samePosition(target, position)) this.port.write('replace', withPosition(observed.state, position));
    this.position = position;
    this.accepted = observed.route;
    this.port.accept(observed.route);
  }

  navigate(route: WorkspaceRoute): boolean {
    if (this.restoring) return false;
    const changed = !this.accepted || !sameWorkspaceRoute(this.accepted, route);
    if (this.accepted && changed && !this.port.allowLeave()) return false;
    if (changed) {
      const state = this.port.read().state;
      this.position = this.position ? { scope: this.position.scope, index: this.position.index + 1 } : this.freshPosition();
      this.port.write('push', withPosition(state, this.position), route);
    }
    this.accepted = route;
    this.port.accept(route);
    return true;
  }
}
