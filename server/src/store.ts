import fs from "node:fs"; import path from "node:path";
export type Character = { userId: string; name: string; color: string; variant: string; createdAt: number };
/** Storage interface — swap JsonStore for a SupabaseStore (Postgres) later without touching game code. */
export interface CharacterStore { get(userId: string): Promise<Character | null>; save(c: Character): Promise<void>; nameTaken(name: string, exceptUser: string): Promise<boolean>; }
export class JsonStore implements CharacterStore {
  private data: Record<string, Character> = {};
  constructor(private file = path.resolve(process.env.DATA_DIR || "data", "characters.json")) {
    fs.mkdirSync(path.dirname(file), { recursive: true }); if (fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  async get(id: string) { return this.data[id] ?? null; }
  async save(c: Character) { this.data[c.userId] = c; fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.data, null, 1)); fs.renameSync(this.file + ".tmp", this.file); }
  async nameTaken(n: string, ex: string) { return Object.values(this.data).some(c => c.userId !== ex && c.name.toLowerCase() === n.toLowerCase()); }
}
