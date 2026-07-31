import { DatabaseSync } from "node:sqlite";

export function createSqliteD1({ schema = "" } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  if (schema) sqlite.exec(schema);

  const prepare = sql => {
    const statement = sqlite.prepare(sql);
    let values = [];
    const bound = {
      bind(...input) {
        values = input;
        return bound;
      },
      async first() {
        return statement.get(...values) || null;
      },
      async all() {
        return { results: statement.all(...values) };
      },
      async run() {
        const result = statement.run(...values);
        return {
          success: true,
          meta: {
            changes: Number(result.changes || 0),
            last_row_id: Number(result.lastInsertRowid || 0)
          }
        };
      }
    };
    return bound;
  };

  return {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      sqlite.close();
    }
  };
}
