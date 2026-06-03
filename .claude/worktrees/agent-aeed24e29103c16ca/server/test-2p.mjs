// Quick 2-client smoke test against a running server (npm run dev in ./server)
import { io } from "socket.io-client";

const URL = process.env.SERVER || "http://localhost:8787";
const a = io(URL);
const b = io(URL);

await Promise.all([
  new Promise((r) => a.on("connect", r)),
  new Promise((r) => b.on("connect", r)),
]);

let finalState = null;
const done = new Promise((res) => {
  const check = (s) => {
    if (s.game?.phase === "round_over") {
      finalState = s;
      res();
    }
  };
  a.on("room:state", check);
});

a.emit("room:create", { name: "Alice" }, async (resp) => {
  if (!resp.ok) throw new Error("create failed: " + resp.error);
  console.log("Room", resp.code, "created");
  b.emit("room:join", { code: resp.code, name: "Bob" }, (r2) => {
    if (!r2.ok) throw new Error("join: " + r2.error);
    console.log("Bob joined");
    a.emit("room:start", {}, (r3) => {
      if (!r3.ok) throw new Error("start: " + r3.error);
      console.log("Game started");
      // Each peeks (start_play moves to turn_start). Only one start_play needed.
      a.emit("action", { type: "start_play" }, () => {
        // Alice calls Cabo immediately
        setTimeout(() => {
          a.emit("action", { type: "call_cabo" }, (r) => console.log("Alice cabo:", r));
          // Bob's final turn: draw + discard
          setTimeout(() => {
            b.emit("action", { type: "draw_deck" }, (r) => console.log("Bob draw:", r));
            setTimeout(() => {
              b.emit("action", { type: "swap_drawn", handIndex: 0 }, (r) => console.log("Bob swap:", r));
            }, 200);
          }, 200);
        }, 200);
      });
    });
  });
});

await Promise.race([
  done,
  new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
]);
const game = finalState.game;
const winner = game.players.find((p) => p.id === game.winnerId);
console.log("Winner:", winner?.name);
console.log("Scores:", JSON.stringify(game.scores));
console.log("Hands:", game.players.map((p) => ({ n: p.name, h: p.hand.map((c) => c.id) })));
a.close();
b.close();
process.exit(0);
