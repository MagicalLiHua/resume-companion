import { canonical, type Scalar } from '../protocol.js';
import { BrowserError } from './errors.js';

export type OperationChange = { ref: string; before: Scalar | null; written: Scalar; reversible: boolean; undone?: boolean };
export type OperationReceipt = { operation_id: string; status: string; [key: string]: unknown };
export type OperationRecord = {
  signature: string;
  promise: Promise<OperationReceipt>;
  result?: OperationReceipt;
  changes: OperationChange[];
  createdAt: number;
  boundary?: boolean;
};

export class OperationJournal {
  private readonly records = new Map<string, OperationRecord>();

  async run(operationId: string, input: unknown, job: (record: OperationRecord) => Promise<OperationReceipt>): Promise<OperationReceipt> {
    const signature = canonical(input);
    const existing = this.records.get(operationId);
    if (existing) {
      if (existing.signature !== signature) throw new BrowserError('operation_conflict', '相同 operation_id 使用了不同参数，未重复执行');
      return existing.promise;
    }
    let record!: OperationRecord;
    const promise = Promise.resolve().then(() => job(record)).then(result => {
      record.result = result;
      return result;
    });
    record = { signature, promise, changes: [], createdAt: Date.now() };
    this.records.set(operationId, record);
    this.trim();
    return promise;
  }

  get(operationId: string): OperationRecord | undefined {
    return this.records.get(operationId);
  }

  verify(operationIds: string[]): Array<Record<string, unknown>> {
    return operationIds.map(operationId => {
      const record = this.records.get(operationId);
      if (!record) return { operation_id: operationId, status: 'unknown', message: '操作记录已过期或属于旧会话' };
      return {
        operation_id: operationId,
        status: record.result?.status ?? 'unknown',
        values: record.changes.map(change => ({ ref: change.ref, reversible: change.reversible && !change.undone && !record.boundary, value_retained: null })),
      };
    });
  }

  markBoundary(): void {
    for (const record of this.records.values()) record.boundary = true;
  }

  clear(): void {
    this.records.clear();
  }

  private trim(): void {
    if (this.records.size <= 200) return;
    for (const [id, record] of this.records) {
      if (record.result) this.records.delete(id);
      if (this.records.size <= 200) break;
    }
  }
}
