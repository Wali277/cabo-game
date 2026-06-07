import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { sendChat } from "../state/mp";
import { Audio } from "../audio/sounds";

/**
 * Multiplayer chat: a floating button in the bottom-right that expands into
 * a small chat window. Messages live only in client memory and only while the
 * current room exists — clearChat() runs on leaveRoomToLobby / backToMenu.
 */
export function ChatPanel() {
  const mode = useStore((s) => s.mode);
  const mp = useStore((s) => s.mp);
  const humanId = useStore((s) => s.humanId);
  const messages = useStore((s) => s.chatMessages);
  const open = useStore((s) => s.chatOpen);
  const unread = useStore((s) => s.chatUnread);
  const setChatOpen = useStore((s) => s.setChatOpen);
  // When the Settings speed-dial is open it springs UP from the gear, into the
  // column where this toggle lives — hide the toggle so they don't overlap.
  // (Opening Settings already closes the chat panel via the FAB mutex; this
  // just hides the button. The unread count is untouched, so it returns intact
  // when Settings closes.)
  const settingsOpen = useStore((s) => s.settingsOpen);

  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom whenever messages change or the panel opens
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  if (mode !== "mp" || !mp) return null;

  async function handleSend() {
    const t = text.trim();
    if (!t) return;
    setText("");
    Audio.playSfx("click");
    await sendChat(t);
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            className="chat-panel"
            initial={{ y: 30, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <div className="chat-header">
              <span>Chat</span>
              <button
                className="chat-close"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
            <div className="chat-list" ref={listRef}>
              {messages.length === 0 ? (
                <div className="chat-empty">No messages yet — say hi!</div>
              ) : (
                messages.map((m, i) => (
                  <div
                    key={`${m.at}-${i}`}
                    className={`chat-msg ${m.from === humanId ? "mine" : ""}`}
                  >
                    <span className="chat-msg-name">{m.name}</span>
                    <span className="chat-msg-text">{m.text}</span>
                  </div>
                ))
              )}
            </div>
            <form
              className="chat-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <input
                className="chat-input"
                type="text"
                placeholder="Type a message…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                autoFocus
              />
              <button className="btn primary chat-send" type="submit" disabled={!text.trim()}>
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {!settingsOpen && (
        <button
          className={`chat-toggle ${open ? "open" : ""}`}
          onClick={() => setChatOpen(!open)}
          aria-label={open ? "Close chat" : "Open chat"}
        >
          <span className="chat-toggle-icon">💬</span>
          {!open && unread > 0 && <span className="chat-unread">{unread}</span>}
        </button>
      )}
    </>
  );
}
