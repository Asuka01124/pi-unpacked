import * as reference from "./protocol.ts";
import { encode, type Command, type CommandInput, type CreateReader, type Event, type PendingReply, type Record, type Reply, type RouteRecord } from "./protocol.ts";

type Implementation = { createReader: CreateReader; routeRecord: RouteRecord };
type Write = (chunk: Uint8Array, command: Command) => void | Promise<void>;

export function createClient(write: Write, onEvent: (event: Event) => void, implementation: Implementation = reference) {
	const pending = new Map<string, PendingReply>();
	const reader = implementation.createReader((line) => implementation.routeRecord(JSON.parse(line) as Record, pending, onEvent));
	let nextId = 1;
	let closed = false;

	return {
		push: reader.push,
		send(input: CommandInput): Promise<Reply> {
			const command = { ...input, id: `req-${nextId++}` };
			if (closed) return Promise.reject(new Error("RPC 客户端已关闭。"));
			return new Promise((resolve, reject) => {
				const fail = (error: unknown) => {
					pending.delete(command.id);
					reject(error);
				};
				pending.set(command.id, {
					resolve: (reply) => reply.success ? resolve(reply) : fail(new Error(reply.error)),
					reject: fail,
				});
				try {
					Promise.resolve(write(encode(command), command)).catch(fail);
				} catch (error) {
					fail(error);
				}
			});
		},
		close() {
			if (closed) return;
			closed = true;
			try {
				reader.end();
			} finally {
				for (const request of pending.values()) request.reject(new Error("RPC 连接已关闭。"));
			}
		},
	};
}
