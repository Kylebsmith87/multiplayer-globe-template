import { routePartykitRequest, Server } from "partyserver";

import type { OutgoingMessage, Position } from "../shared";
import type { Connection, ConnectionContext } from "partyserver";

// ---------- Globe (your existing feature) ----------

// This is the state that we'll store on each connection
type GlobeConnectionState = {
	position: Position;
};

export class Globe extends Server {
	onConnect(conn: Connection<GlobeConnectionState>, ctx: ConnectionContext) {
		// Extract position from Cloudflare headers
		const latitude = ctx.request.cf?.latitude as string | undefined;
		const longitude = ctx.request.cf?.longitude as string | undefined;

		if (!latitude || !longitude) {
			console.warn(`Missing position information for connection ${conn.id}`);
			return;
		}

		const position: Position = {
			lat: parseFloat(latitude),
			lng: parseFloat(longitude),
			id: conn.id,
		};

		// Save on this connection's state
		conn.setState({ position });

		// Send all existing markers to the new connection
		// and send the new marker to everyone else
		for (const connection of this.getConnections<GlobeConnectionState>()) {
			try {
				conn.send(
					JSON.stringify({
						type: "add-marker",
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						position: connection.state!.position,
					} satisfies OutgoingMessage),
				);

				if (connection.id !== conn.id) {
					connection.send(
						JSON.stringify({
							type: "add-marker",
							position,
						} satisfies OutgoingMessage),
					);
				}
			} catch {
				this.onCloseOrError(conn);
			}
		}
	}

	// Remove marker on disconnect/error
	onCloseOrError(connection: Connection) {
		this.broadcast(
			JSON.stringify({
				type: "remove-marker",
				id: connection.id,
			} satisfies OutgoingMessage),
			[connection.id],
		);
	}

	onClose(connection: Connection): void | Promise<void> {
		this.onCloseOrError(connection);
	}

	onError(connection: Connection): void | Promise<void> {
		this.onCloseOrError(connection);
	}
}

// ---------- Chat (NEW feature) ----------

type ChatState = {
	name: string;
	country: string;
};

export class Chat extends Server {
	private broadcastCount() {
		const n = Array.from(this.getConnections<ChatState>()).length;
		this.broadcast(JSON.stringify({ type: "count", n }));
	}

	onConnect(conn: Connection<ChatState>, ctx: ConnectionContext) {
		const country = (ctx.request.cf?.country as string | undefined) ?? "??";

		conn.setState({
			name: "anon",
			country,
		});

		this.broadcastCount();
	}

	onClose(_connection: Connection) {
		this.broadcastCount();
	}

	onError(_connection: Connection) {
		this.broadcastCount();
	}

	onMessage(conn: Connection<ChatState>, message: string) {
		let data: any;
		try {
			data = JSON.parse(message);
		} catch {
			data = { type: "chat", text: String(message || "") };
		}

		const state = conn.state ?? { name: "anon", country: "??" };

		// Set username
		if (data.type === "setName") {
			const clean = String(data.name || "anon").trim().slice(0, 20);
			conn.setState({ ...state, name: clean });
			return;
		}

		// Send a chat message
		if (data.type === "chat") {
			const text = String(data.text || "").trim().slice(0, 300);
			if (!text) return;

			this.broadcast(
				JSON.stringify({
					type: "chat",
					name: state.name,
					country: state.country,
					text,
					ts: Date.now(),
				}),
			);
		}
	}
}

// ---------- Worker fetch ----------

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return (
			(await routePartykitRequest(request, { ...env })) ||
			new Response("Not Found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
