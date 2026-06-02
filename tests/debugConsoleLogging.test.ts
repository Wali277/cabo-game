import assert from "node:assert/strict";

import { clear, getEntries, logDebug } from "../cobo/src/state/debugLog";

type ConsoleCall = {
  level: "error" | "warn" | "info";
  args: unknown[];
};

const calls: ConsoleCall[] = [];
const originalConsole = {
  error: console.error,
  warn: console.warn,
  info: console.info,
};

console.error = (...args: unknown[]) => {
  calls.push({ level: "error", args });
};
console.warn = (...args: unknown[]) => {
  calls.push({ level: "warn", args });
};
console.info = (...args: unknown[]) => {
  calls.push({ level: "info", args });
};

try {
  clear();

  logDebug("error", "react", "Render exploded", "stack line");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, "error");
  assert.match(String(calls[0].args[0]), /\[Cabo:error\] react: Render exploded/);
  assert.equal(calls[0].args[1], "stack line");

  calls.length = 0;
  logDebug("warn", "socket", "connect_error", "transport close");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, "warn");
  assert.match(String(calls[0].args[0]), /\[Cabo:warn\] socket: connect_error/);
  assert.equal(calls[0].args[1], "transport close");

  calls.length = 0;
  logDebug("error", "console", "Already emitted", undefined, { echoToConsole: false });
  assert.equal(calls.length, 0);
  assert.equal(getEntries().length, 3);
} finally {
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  clear();
}
