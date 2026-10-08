import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CustomAgent, Database, Issue, TestRecord } from '../domain/types';

const DATA_DIR = process.env.SILEX_DATA_DIR ?? join(import.meta.dir, '..', '..', 'data');
const DB_PATH = join(DATA_DIR, 'db.json');

const emptyDatabase = (): Database => ({
  version: 1,
  tests: [],
  issues: [],
  customAgents: [],
  calibratedAt: null,
});

let cache: Database | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Database {
  if (cache) return cache;
  try {
    if (existsSync(DB_PATH)) {
      const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8')) as Database;
      cache = {
        version: 1,
        tests: Array.isArray(parsed.tests) ? parsed.tests : [],
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        customAgents: Array.isArray(parsed.customAgents) ? parsed.customAgents : [],
        calibratedAt: parsed.calibratedAt ?? null,
      };
      return cache;
    }
  } catch {
    // corrupt file: start clean
  }
  cache = emptyDatabase();
  return cache;
}

function flush(): void {
  const db = load();
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, DB_PATH);
}

function persist(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, 150);
}

export const store = {
  read(): Database {
    return load();
  },

  addTest(test: TestRecord, issue: Issue | null): void {
    const db = load();
    db.tests.push(test);
    if (issue) db.issues.push(issue);
    persist();
  },

  listCustomAgents(): CustomAgent[] {
    return load().customAgents;
  },

  addCustomAgent(agent: CustomAgent): void {
    load().customAgents.push(agent);
    flush();
  },

  listIssues(): Issue[] {
    return [...load().issues].sort((a, b) => b.createdAt - a.createdAt);
  },

  reset(): void {
    cache = emptyDatabase();
    flush();
  },

  flushNow(): void {
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
    }
    flush();
  },
};
