// Temporary multi-client integration test for the room ready-up rework.
// Drives real socket.io clients against the running server on :8787.
import { io } from "socket.io-client";

const URL = "http://localhost:8787";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, cond) {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}`);
}
function mk() {
  const s = io(URL, { forceNew: true, transports: ["websocket"] });
  const c = { s, state: null, playerId: null };
  s.on("room:state", (st) => { c.state = st; });
  return c;
}
const connect = (c) => new Promise((res, rej) => { c.s.once("connect", res); c.s.once("connect_error", rej); });
const emitP = (c, ev, payload = {}) => new Promise((res) => c.s.emit(ev, payload, res));

async function run() {
  // ---------- Test 1: 2 players — one ready does NOT start; all ready DOES ----------
  {
    const a = mk(), b = mk();
    await connect(a); await connect(b);
    const ra = await emitP(a, "room:create", { name: "Alice" }); a.playerId = ra.playerId;
    const rb = await emitP(b, "room:join", { code: ra.code, name: "Bob" }); b.playerId = rb.playerId;
    await sleep(250);
    check("T1 room has 2 members", a.state?.members?.length === 2);
    await emitP(a, "room:ready");
    await sleep(250);
    check("T1 one player ready → NOT started", a.state?.game == null);
    check("T1 readyVotes = [Alice] only", a.state?.readyVotes?.length === 1 && a.state.readyVotes.includes(a.playerId));
    await emitP(b, "room:ready");
    await sleep(350);
    check("T1 ALL ready → game STARTED (both clients)", a.state?.game != null && b.state?.game != null);
    check("T1 2 players → coinToss set, no strawDraw", a.state?.coinToss != null && a.state?.strawDraw == null);
    a.s.close(); b.s.close();
  }

  // ---------- Test 2: cancel (unready) holds the start ----------
  {
    const a = mk(), b = mk();
    await connect(a); await connect(b);
    const ra = await emitP(a, "room:create", { name: "Cara" }); a.playerId = ra.playerId;
    await emitP(b, "room:join", { code: ra.code, name: "Dan" });
    await sleep(250);
    await emitP(a, "room:ready");
    await sleep(180);
    check("T2 after ready → 1 vote", a.state?.readyVotes?.length === 1);
    await emitP(a, "room:unready");
    await sleep(220);
    check("T2 after CANCEL → 0 votes", a.state?.readyVotes?.length === 0);
    check("T2 after CANCEL → NOT started", a.state?.game == null);
    // recovery: both ready now → starts
    await emitP(a, "room:ready"); await emitP(b, "room:ready");
    await sleep(350);
    check("T2 re-ready both → STARTED", a.state?.game != null);
    a.s.close(); b.s.close();
  }

  // ---------- Test 3: 3 players — every player must ready ----------
  {
    const p1 = mk(), p2 = mk(), p3 = mk();
    await connect(p1); await connect(p2); await connect(p3);
    const r1 = await emitP(p1, "room:create", { name: "P1" }); p1.playerId = r1.playerId;
    await emitP(p2, "room:join", { code: r1.code, name: "P2" });
    await emitP(p3, "room:join", { code: r1.code, name: "P3" });
    await sleep(280);
    check("T3 3 members", p1.state?.members?.length === 3);
    await emitP(p1, "room:ready"); await sleep(140);
    check("T3 1/3 ready → not started", p1.state?.game == null);
    await emitP(p2, "room:ready"); await sleep(140);
    check("T3 2/3 ready → not started (votes=2)", p1.state?.game == null && p1.state?.readyVotes?.length === 2);
    await emitP(p3, "room:ready"); await sleep(350);
    check("T3 3/3 ready → STARTED", p1.state?.game != null);
    check("T3 3 players → strawDraw set, no coinToss", p1.state?.strawDraw != null && p1.state?.coinToss == null);
    p1.s.close(); p2.s.close(); p3.s.close();
  }

  // ---------- Test 4: disconnect unblocks remaining ready players (no stuck lobby) ----------
  {
    const q1 = mk(), q2 = mk(), q3 = mk();
    await connect(q1); await connect(q2); await connect(q3);
    const rq = await emitP(q1, "room:create", { name: "Q1" }); q1.playerId = rq.playerId;
    await emitP(q2, "room:join", { code: rq.code, name: "Q2" });
    await emitP(q3, "room:join", { code: rq.code, name: "Q3" });
    await sleep(280);
    await emitP(q1, "room:ready"); await sleep(120);
    await emitP(q2, "room:ready"); await sleep(180);
    check("T4 2/3 ready while P3 connected → not started", q1.state?.game == null);
    q3.s.close(); // P3 drops
    await sleep(700);
    check("T4 P3 disconnect → STARTED (all connected were ready)", q1.state?.game != null);
    q1.s.close(); q2.s.close();
  }

  await sleep(150);
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed.map((f) => f.name).join("; ")); process.exit(1); }
  process.exit(0);
}
run().catch((e) => { console.error("ERROR", e); process.exit(2); });
