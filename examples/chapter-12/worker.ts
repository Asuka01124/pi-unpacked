import { setTimeout } from "node:timers/promises";
import { evidenceLine, startLine } from "./scenario.ts";

const task = process.argv[2];
if (task !== "log" && task !== "code") throw new Error("未知的实验任务。");
process.stdout.write(startLine(task) + "\n");
if (process.argv.includes("--hold")) await setTimeout(20_000);
process.stdout.write(evidenceLine(task) + "\n");
