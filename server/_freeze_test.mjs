// Integration test for the multiplayer freeze fixes (Task 2).
// Drives real socket.io clients against the running server on :8787.
//   Test A — a snapper who disconnects before picking must NOT leave snapPhase
//            stuck "armed_*" (root cause #1: the silent table-wide freeze).
//   Test B — normal turn progression still works (regression guard for the
//            skipKickedTurn / round-over-guard changes).
import { io } from "socket.io-client";

const URL = "http://127.0.0.1:8787";
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

// Drive 3 fresh players from lobby all the way to an in-game turn_start.
async function start3PlayerGame(names) {
  const cs = names.map(() => mk());
  for (const c of cs) await connect(c);
  const ra = await emitP(cs[0], "room:create", { name: names[0] });
  cs[0].playerId = ra.playerId;
  const code = ra.code;
  for (let i = 1; i < cs.length; i++) {
    const r = await emitP(cs[i], "room:join", { code, name: names[i] });
    cs[i].playerId = r.playerId;
  }
  await sleep(250);
  for (const c of cs) await emitP(c, "room:ready");        // all ready → starts (3p → straw draw)
  await sleep(350);
  for (let i = 0; i < cs.length; i++) await emitP(cs[i], "room:straw_pick", { index: i }); // distinct straws
  await sleep(350);
  for (const c of cs) await emitP(c, "room:straw_ready");  // all continue → into setup_peek
  await sleep(450);
  for (const c of cs) await emitP(c, "action", { type: "start_play" }); // all ready → turn_start
  await sleep(350);
  return { cs, code };
}

async function run() {
  // ---------- Test A: snapper disconnect clears the stuck snapPhase ----------
  {
    const { cs } = await start3PlayerGame(["Alice", "Bob", "Cara"]);
    const g0 = cs[0].state?.game;
    check("A setup: game reached turn_start", g0?.phase === "turn_start");
    const curId = g0?.players?.[g0.currentPlayer]?.id;
    const snapper = cs.find((c) => c.playerId !== curId);        // a non-current player arms
    const observer = cs.find((c) => c.playerId !== snapper.playerId); // stays connected to observe

    await emitP(snapper, "action", { type: "action_start_snap_self" });
    await sleep(300);
    check("A snap armed (snapPhase=armed_self)", observer.state?.game?.snapPhase === "armed_self");
    check("A snappingPlayerId = the snapper", observer.state?.game?.snappingPlayerId === snapper.playerId);

    // The freeze trigger: the snapper drops before picking a card.
    snapper.s.close();
    await sleep(600);

    // FIX: the server abandons the unresolved snap on disconnect so the table
    // unpauses. Before the fix, snapPhase stayed "armed_self" forever.
    check("A snapPhase cleared to idle after snapper disconnect", observer.state?.game?.snapPhase === "idle");
    check("A snappingPlayerId cleared to null", observer.state?.game?.snappingPlayerId == null);

    for (const c of cs) { try { c.s.close(); } catch {} }
    await sleep(150);
  }

  // ---------- Test B: normal turn progression (regression guard) ----------
  {
    const { cs } = await start3PlayerGame(["Dan", "Eve", "Finn"]);
    const g = cs[0].state?.game;
    check("B setup: turn_start", g?.phase === "turn_start");
    const cur = cs.find((c) => c.playerId === g.players[g.currentPlayer].id);

    const drawResp = await emitP(cur, "action", { type: "draw_deck" });
    await sleep(250);
    check("B draw_deck accepted", drawResp?.ok === true);
    check("B phase advanced to turn_drawn", cs[0].state?.game?.phase === "turn_drawn");

    const discResp = await emitP(cur, "action", { type: "discard_and_skip" });
    await sleep(250);
    check("B discard accepted — turn progresses, not frozen", discResp?.ok === true);
    check("B back to turn_start for next player", cs[0].state?.game?.phase === "turn_start");

    for (const c of cs) { try { c.s.close(); } catch {} }
    await sleep(150);
  }

  await sleep(200);
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log("FAILURES:", failed.map((f) => f.name).join("; ")); process.exit(1); }
  process.exit(0);
}
run().catch((e) => { console.error("ERROR", e); process.exit(2); });
