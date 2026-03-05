import { routePartykitRequest, Server } from "partyserver";

import type { OutgoingMessage, Position } from "../shared";
import type { Connection, ConnectionContext } from "partyserver";

// ---------- Globe (existing feature) ----------

type GlobeConnectionState = {
	position: Position;
};

export class Globe extends Server {
	onConnect(conn: Connection<GlobeConnectionState>, ctx: ConnectionContext) {
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

		conn.setState({ position });

		for (const connection of this.getConnections<GlobeConnectionState>()) {
			try {
				// Send existing markers to the new connection
				conn.send(
					JSON.stringify({
						type: "add-marker",
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						position: connection.state!.position,
					} satisfies OutgoingMessage),
				);

				// Send the new marker to everyone else
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
	private onlineCount() {
		return Array.from(this.getConnections<ChatState>()).length;
	}

	private broadcastCount() {
		this.broadcast(JSON.stringify({ type: "count", n: this.onlineCount() }));
	}

	onConnect(conn: Connection<ChatState>, ctx: ConnectionContext) {
		const country = (ctx.request.cf?.country as string | undefined) ?? "??";

		conn.setState({
			name: "anon",
			country,
		});

		// Update online count for everyone
		this.broadcastCount();
	}

	onClose(_connection: Connection) {
		this.broadcastCount();
	}

	onError(_connection: Connection) {
		this.broadcastCount();
	}

	onMessage(conn: Connection<ChatState>, message: unknown) {
		// PartyServer may deliver message as string or something else.
		const raw =
			typeof message === "string"
				? message
				: message instanceof ArrayBuffer
					? new TextDecoder().decode(message)
					: "";

		let data: any;
		try {
			data = JSON.parse(raw);
		} catch {
			data = { type: "chat", text: raw };
		}

		const state = conn.state ?? { name: "anon", country: "??" };

		// Set username
		if (data?.type === "setName") {
			const clean = String(data.name || "anon").trim().slice(0, 20) || "anon";
			conn.setState({ ...state, name: clean });
			return;
		}

		// Send a chat message
		if (data?.type === "chat") {
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
		// If someone opens a party endpoint in a normal browser tab,
		// return a clear response instead of throwing a Worker exception.
		const url = new URL(request.url);
		if (url.pathname.startsWith("/parties/")) {
			const upgrade = request.headers.get("Upgrade") || "";
			if (upgrade.toLowerCase() !== "websocket") {
				return new Response("This endpoint is WebSocket-only.", { status: 426 });
			}
		}

		return (
			(await routePartykitRequest(request, { ...env })) ||
			new Response("Not Found", { status: 404 })
		);
	},
} satisfies ExportedHandler<Env>;
