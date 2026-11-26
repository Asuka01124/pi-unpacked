import { createReader, encode, type Command } from "./protocol.ts";
import { createSession } from "./session.ts";

const session = createSession((record) => process.stdout.write(encode(record)), 1200, 5000);
const reader = createReader((line) => session.receive(JSON.parse(line) as Command));
process.stdin.on("data", reader.push);
process.stdin.on("end", () => {
	reader.end();
	session.dispose();
});
