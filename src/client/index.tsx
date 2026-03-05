import "./styles.css";

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import createGlobe from "cobe";
import usePartySocket from "partysocket/react";

// The type of messages we'll be receiving from the server
import type { OutgoingMessage } from "../shared";
import type { LegacyRef } from "react";

function App() {
	// A reference to the canvas element where we'll render the globe
	const canvasRef = useRef<HTMLCanvasElement>();
	// The number of markers we're currently displaying
	const [counter, setCounter] = useState(0);
	// A map of marker IDs to their positions
	// Note that we use a ref because the globe's `onRender` callback
	// is called on every animation frame, and we don't want to re-render
	// the component on every frame.
	const positions = useRef<
		Map<
			string,
			{
				location: [number, number];
				size: number;
			}
		>
	>(new Map());
	// Connect to the PartyServer server
	const socket = usePartySocket({
		room: "default",
		party: "globe",
		onMessage(evt) {
			const message = JSON.parse(evt.data as string) as OutgoingMessage;
			if (message.type === "add-marker") {
				// Add the marker to our map
				positions.current.set(message.position.id, {
					location: [message.position.lat, message.position.lng],
					size: message.position.id === socket.id ? 0.1 : 0.05,
				});
				// Update the counter
				setCounter((c) => c + 1);
			} else {
				// Remove the marker from our map
				positions.current.delete(message.id);
				// Update the counter
				setCounter((c) => c - 1);
			}
		},
	});

	useEffect(() => {
		// The angle of rotation of the globe
		// We'll update this on every frame to make the globe spin
		let phi = 0;

		const globe = createGlobe(canvasRef.current as HTMLCanvasElement, {
			devicePixelRatio: 2,
			width: 400 * 2,
			height: 400 * 2,
			phi: 0,
			theta: 0,
			dark: 1,
			diffuse: 0.8,
			mapSamples: 16000,
			mapBrightness: 6,
			baseColor: [0.3, 0.3, 0.3],
			markerColor: [0.8, 0.1, 0.1],
			glowColor: [0.2, 0.2, 0.2],
			markers: [],
			opacity: 0.7,
			onRender: (state) => {
				// Called on every animation frame.
				// `state` will be an empty object, return updated params.

				// Get the current positions from our map
				state.markers = [...positions.current.values()];

				// Rotate the globe
				state.phi = phi;
				phi += 0.01;
			},
		});

		return () => {
			globe.destroy();
		};
	}, []);

	return (
		<div className="App">
			<h1>Where's everyone at?</h1>
			{counter !== 0 ? (
				<p>
					<b>{counter}</b> {counter === 1 ? "person" : "people"} connected.
				</p>
			) : (
				<p>&nbsp;</p>
			)}

			{/* The canvas where we'll render the globe */}
			<canvas
				ref={canvasRef as LegacyRef<HTMLCanvasElement>}
				style={{ width: 400, height: 400, maxWidth: "100%", aspectRatio: 1 }}
			/>

			{/* Let's give some credit */}
			<p>
				Powered by <a href="https://cobe.vercel.app/">🌏 Cobe</a>,{" "}
				<a href="https://www.npmjs.com/package/phenomenon">Phenomenon</a> and{" "}
				<a href="https://npmjs.com/package/partyserver/">🎈 PartyServer</a>
			</p>
		</div>
	);
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(<App />);
// ------------------------------
// FreezingBalls Chat Overlay (NO React required)
// Paste this at the VERY BOTTOM of src/client/index.tsx
// ------------------------------
(function addChatOverlay() {
  // Avoid double-inject if hot reload / double execution
  if (document.getElementById("fb-chat-overlay")) return;

  const style = document.createElement("style");
  style.textContent = `
    #fb-chat-overlay {
      position: fixed;
      right: 12px;
      bottom: 12px;
      width: 320px;
      z-index: 999999;
      background: rgba(0,0,0,0.72);
      color: #fff;
      font-family: Arial, sans-serif;
      border-radius: 12px;
      padding: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      backdrop-filter: blur(6px);
    }
    #fb-chat-top { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }
    #fb-chat-log {
      height: 160px;
      overflow: auto;
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 10px;
      padding: 6px;
      background: rgba(0,0,0,0.25);
    }
    #fb-chat-row { display:flex; gap:6px; margin-top:6px; }
    #fb-chat-input {
      flex: 1;
      padding: 8px;
      border-radius: 10px;
      border: none;
      outline: none;
    }
    #fb-chat-send, #fb-chat-name {
      padding: 8px 10px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
    }
    #fb-chat-send { font-weight: 700; }
    #fb-chat-note { opacity:0.75; font-size: 12px; margin-top:6px; }
  `;
  document.head.appendChild(style);

  const box = document.createElement("div");
  box.id = "fb-chat-overlay";
  box.innerHTML = `
    <div id="fb-chat-top">
      <div><b>Chat</b> · <span id="fb-chat-count">0</span> online</div>
      <button id="fb-chat-name">Set name</button>
    </div>
    <div id="fb-chat-log"></div>
    <div id="fb-chat-row">
      <input id="fb-chat-input" placeholder="Type a message…" />
      <button id="fb-chat-send">Send</button>
    </div>
    <div id="fb-chat-note">Tip: press Enter to send</div>
  `;
  document.body.appendChild(box);

  const log = document.getElementById("fb-chat-log") as HTMLDivElement;
  const input = document.getElementById("fb-chat-input") as HTMLInputElement;
  const sendBtn = document.getElementById("fb-chat-send") as HTMLButtonElement;
  const nameBtn = document.getElementById("fb-chat-name") as HTMLButtonElement;
  const countSpan = document.getElementById("fb-chat-count") as HTMLSpanElement;

  function flagEmoji(cc: string) {
    if (!cc || cc.length !== 2) return "🏳️";
    const A = 0x1f1e6;
    const up = cc.toUpperCase();
    const a = up.charCodeAt(0) - 65;
    const b = up.charCodeAt(1) - 65;
    if (a < 0 || a > 25 || b < 0 || b > 25) return "🏳️";
    return String.fromCodePoint(A + a, A + b);
  }

  function addLine(text: string) {
    const div = document.createElement("div");
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  // Username handling
  let name = localStorage.getItem("fb_name") || "";
  function updateNameButton() {
    nameBtn.textContent = name ? name : "Set name";
  }
  updateNameButton();

  // Connect websocket
  const ws = new WebSocket(`wss://${location.host}/parties/chat/global`);

  ws.onopen = () => {
    addLine("✅ Connected to chat");
    if (name) {
      ws.send(JSON.stringify({ type: "setName", name }));
    }
  };

  ws.onmessage = (e) => {
    let m: any;
    try { m = JSON.parse(e.data); } catch { return; }

    if (m.type === "count") {
      countSpan.textContent = String(m.n ?? 0);
      return;
    }

    if (m.type === "chat") {
      const f = flagEmoji(String(m.country || ""));
      const who = String(m.name || "anon");
      const msg = String(m.text || "");
      addLine(`${f} ${who}: ${msg}`);
      return;
    }
  };

  ws.onclose = () => addLine("❌ Chat disconnected");
  ws.onerror = () => addLine("⚠️ Chat error");

  nameBtn.onclick = () => {
    const picked = prompt("Pick a username (max 20 chars):", name || "anon");
    if (!picked) return;
    name = picked.trim().slice(0, 20) || "anon";
    localStorage.setItem("fb_name", name);
    updateNameButton();
    ws.send(JSON.stringify({ type: "setName", name }));
  };

  function send() {
    const text = input.value.trim();
    if (!text) return;
    ws.send(JSON.stringify({ type: "chat", text }));
    input.value = "";
    input.focus();
  }

  sendBtn.onclick = send;
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") send();
  });
})();
