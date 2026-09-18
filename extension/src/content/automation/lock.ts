/** One document-wide execution lane, shared by the widget, legacy API and core tools. */
export class ExecutionLock {
  persistenceRevision = 0;
  persistenceBoundary() { this.persistenceRevision++; }
  private owner: string | null = null;
  async run<T>(owner: string, job: () => Promise<T> | T): Promise<T> {
    if (this.owner) throw new Error('busy: 此页面已有操作正在进行，请等待后重新观察');
    this.owner = owner;
    try { return await job(); } finally { this.owner = null; }
  }
  assertIdle() { if (this.owner) throw new Error('busy: 此页面已有操作正在进行'); }
}
export const documentLock = new ExecutionLock();
