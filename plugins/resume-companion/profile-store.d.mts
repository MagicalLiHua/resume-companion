export const ProfileSchema: any;
export const ProfileChangesSchema: any;
export const ProfileSaveSchema: any;
export function resolveDataDir(value?: string): string;
export class ProfileStore {
  readonly dataDir: string;
  constructor(dataDir?: string);
  initialize(): Promise<Record<string, unknown>>;
  list(): Promise<any[]>;
  status(): Promise<Record<string, unknown>>;
  get(profileId: string): Promise<any>;
  save(input: unknown): Promise<any>;
  readView(input: unknown): Promise<any>;
  resolveSource(reference: unknown): Promise<string | boolean>;
  rebuildIndex(): Promise<{ rebuilt: true; profiles: number; backup: string | null }>;
}
