import { createInterface } from "node:readline";
import { createServer, type Frame } from "./protocol.ts";

const handle = createServer();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
	const frame: Frame = JSON.parse(line);
	const reply = handle(frame);
	if (reply !== undefined) process.stdout.write(JSON.stringify(reply) + "\n");
}
