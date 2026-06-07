/**
 * check-kick.ts — TWO-CLIENT socket integration test for the host "kick" flow.
 * Drives real socket.io-client connections against the running server (PORT).
 *
 * Run (server must be running) from server/:
 *   node --import tsx scripts/check-kick.ts
 *
 * Asserts the server-authoritative rules:
 *   - non-host can't kick (rejected)
 *   - host can't kick self (rejected)
 *   - host kicks a player → that player gets `room:kicked`, is removed from the
 *     roster broadcast to remaining members, and is blocked from rejoining
 *   - kicking after the game has started is rejected
 */
import { io, type Socket } from "socket.io-client";

const PORT = Number(process.env.PORT) || 8787;
const URL = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`); }
}

function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(URL, { forceNew: true, transports: ["websocket", "polling"] });
    const t = setTimeout(() => reject(new Error("connect timeout")), 8000);
    s.on("connect", () => { clearTimeout(t); resolve(s); });
    s.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
}
function emit(s: Socket, ev: string, payload: unknown): Promise<any> {
  return new Promise((resolve) => s.emit(ev, payload, resolve));
}
/** Resolve with the next `ev` payload, or null after timeoutMs. */
function waitFor(s: Socket, ev: string, timeoutMs = 2500): Promise<any> {
  return new Promise((resolve) => {
    const t = setTimeout(() => { s.off(ev, h); resolve(null); }, timeoutMs);
    const h = (data: any) => { clearTimeout(t); resolve(data); };
    s.once(ev, h);
  });
}

async function main() {
  console.log(`\n=== Host-kick two-client integration (${URL}) ===\n`);
  const host = await connect();
  const victim = await connect();
  const bystander = await connect();
  check("3 sockets connected", host.connected && victim.connected && bystander.connected);

  const created = await emit(host, "room:create", { name: "Host" });
  const code = created?.code;
  const hostId = created?.playerId;
  check("host created room", created?.ok === true && !!code, `code=${code}`);

  const vJoin = await emit(victim, "room:join", { code, name: "Victim" });
  const victimId = vJoin?.playerId;
  check("victim joined", vJoin?.ok === true && !!victimId);
  const bJoin = await emit(bystander, "room:join", { code, name: "Bystander" });
  check("bystander joined", bJoin?.ok === true);

  // 1. Non-host cannot kick.
  const byNonHost = await emit(victim, "room:kick", { targetPlayerId: hostId });
  check("non-host kick rejected", byNonHost?.ok === false, byNonHost?.error);

  // 2. Host cannot kick self.
  const kickSelf = await emit(host, "room:kick", { targetPlayerId: hostId });
  check("host kick-self rejected", kickSelf?.ok === false, kickSelf?.error);

  // 3. Host kicks the victim → victim gets room:kicked; bystander's roster updates.
  const kickedEvt = waitFor(victim, "room:kicked");
  const bystanderState = waitFor(bystander, "room:state");
  const kickRes = await emit(host, "room:kick", { targetPlayerId: victimId });
  check("host kick accepted", kickRes?.ok === true, kickRes?.error ?? "");
  check("victim received room:kicked", (await kickedEvt) !== null);
  const bs = await bystanderState;
  const stillThere = bs?.members?.some((m: any) => m.id === victimId);
  check("victim removed from roster broadcast", bs !== null && stillThere === false,
    JSON.stringify(bs?.members?.map((m: any) => m.name)));

  // 4. Kicked victim cannot rejoin.
  const rejoin = await emit(victim, "room:rejoin", { code, playerId: victimId });
  check("kicked victim cannot rejoin", rejoin?.ok === false, rejoin?.error);

  // 5. After the game starts, kicking is rejected (host + bystander = 2 players).
  const start = await emit(host, "room:start", {});
  check("game started (host + bystander)", start?.ok === true, start?.error ?? "");
  const kickAfterStart = await emit(host, "room:kick", {
    targetPlayerId: bJoin?.playerId,
  });
  check("kick after start rejected", kickAfterStart?.ok === false, kickAfterStart?.error);

  host.disconnect();
  victim.disconnect();
  bystander.disconnect();

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("UNEXPECTED ERROR:", e); process.exit(1); });
