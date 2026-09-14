import "server-only";

export interface MongoId {
  toString(): string;
}

export interface MongoCursor<T> {
  sort(spec: Record<string, 1 | -1>): MongoCursor<T>;
  limit(value: number): MongoCursor<T>;
  toArray(): Promise<T[]>;
}

export interface MongoCollection<T> {
  createIndex(spec: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<string>;
  findOne(filter: Record<string, unknown>): Promise<(T & { _id: MongoId }) | null>;
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): MongoCursor<T & { _id: MongoId }>;
  insertOne(document: T): Promise<{ insertedId: MongoId }>;
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<{ matchedCount: number; modifiedCount: number }>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
}

interface MongoDatabase {
  collection<T>(name: string): MongoCollection<T>;
}

interface MongoClientLike {
  connect(): Promise<MongoClientLike>;
  db(name: string): MongoDatabase;
}

interface MongoModule {
  MongoClient: new (uri: string, options?: Record<string, unknown>) => MongoClientLike;
  ObjectId: new (id: string) => MongoId;
}

export interface UserDocument {
  nome: string;
  email: string;
  passwordSalt: string;
  passwordHash: string;
  privacyAcceptedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDocument {
  tokenHash: string;
  userId: MongoId;
  createdAt: Date;
  expiresAt: Date;
}

export interface CatalogDocument {
  ownerId: MongoId;
  nome: string;
  nomeArquivo: string;
  plataforma: "amazon" | "mercado_livre";
  totalVariacoes: number;
  config: Record<string, unknown>;
  linhas: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginAttemptDocument {
  key: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
}

interface Collections {
  users: MongoCollection<UserDocument>;
  sessions: MongoCollection<SessionDocument>;
  catalogs: MongoCollection<CatalogDocument>;
  loginAttempts: MongoCollection<LoginAttemptDocument>;
}

declare global {
  var __bytelabMongoClient: Promise<MongoClientLike> | undefined;
  var __bytelabMongoIndexes: Promise<void> | undefined;
}

let moduloMongo: Promise<MongoModule> | undefined;

async function carregarModuloMongo(): Promise<MongoModule> {
  if (!moduloMongo) {
    const importar = new Function("pacote", "return import(pacote)") as (pacote: string) => Promise<MongoModule>;
    moduloMongo = importar("mongodb").catch(() => {
      throw new Error("O driver mongodb não está instalado. Execute npm install antes de iniciar o ByteLab.");
    });
  }
  return moduloMongo;
}

function configuracao(): { uri: string; database: string } {
  const uri = process.env.MONGODB_URI?.trim();
  const database = process.env.MONGODB_DB?.trim() || "bytelab";
  if (!uri) throw new Error("MONGODB_URI não configurada.");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(database)) throw new Error("MONGODB_DB inválido.");
  return { uri, database };
}

export function mongoConfigurado(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim() && process.env.BYTELAB_SESSION_SECRET?.trim());
}

async function banco(): Promise<MongoDatabase> {
  const { uri, database } = configuracao();
  if (!global.__bytelabMongoClient) {
    global.__bytelabMongoClient = carregarModuloMongo().then(({ MongoClient }) =>
      new MongoClient(uri, { appName: "ByteLab" }).connect()
    );
  }
  const cliente = await global.__bytelabMongoClient;
  return cliente.db(database);
}

async function criarIndices(collections: Collections): Promise<void> {
  await Promise.all([
    collections.users.createIndex({ email: 1 }, { unique: true, name: "users_email_unique" }),
    collections.sessions.createIndex({ tokenHash: 1 }, { unique: true, name: "sessions_token_unique" }),
    collections.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "sessions_ttl" }),
    collections.catalogs.createIndex({ ownerId: 1, updatedAt: -1 }, { name: "catalogs_owner_updated" }),
    collections.loginAttempts.createIndex({ key: 1 }, { unique: true, name: "login_attempts_key_unique" }),
    collections.loginAttempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "login_attempts_ttl" }),
  ]);
}

export async function colecoes(): Promise<Collections> {
  const db = await banco();
  const resultado: Collections = {
    users: db.collection<UserDocument>("users"),
    sessions: db.collection<SessionDocument>("sessions"),
    catalogs: db.collection<CatalogDocument>("catalogs"),
    loginAttempts: db.collection<LoginAttemptDocument>("login_attempts"),
  };

  if (!global.__bytelabMongoIndexes) {
    global.__bytelabMongoIndexes = criarIndices(resultado).catch((erro) => {
      global.__bytelabMongoIndexes = undefined;
      throw erro;
    });
  }
  await global.__bytelabMongoIndexes;
  return resultado;
}

export async function objectId(valor: string): Promise<MongoId | null> {
  if (!/^[a-f\d]{24}$/i.test(valor)) return null;
  const { ObjectId } = await carregarModuloMongo();
  return new ObjectId(valor);
}
