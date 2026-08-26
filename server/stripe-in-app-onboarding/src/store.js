import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function createFileAccountStore(filePath) {
  if (!filePath) {
    throw new Error("filePath is required");
  }

  const data = load(filePath);

  return {
    get(userId) {
      return data[userId];
    },
    set(userId, accountId) {
      if (!userId || !accountId) {
        throw new Error("userId and accountId are required");
      }
      data[userId] = accountId;
      save(filePath, data);
      return this;
    },
    toMap() {
      return new Map(Object.entries(data));
    },
  };
}

function load(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function save(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
