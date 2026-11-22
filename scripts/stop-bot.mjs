import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pidFile = path.join(root, '.bot.pid');

function readSavedPid() {
	try {
		const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
		return Number.isFinite(pid) && pid > 0 ? pid : undefined;
	} catch {
		return undefined;
	}
}

function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

const pid = readSavedPid();
if (pid === undefined) {
	console.log('No .bot.pid file — bot does not appear to be running.');
	process.exit(0);
}

if (!isAlive(pid)) {
	try {
		fs.unlinkSync(pidFile);
	} catch {
		// ignore
	}
	console.log(`Stale PID file (${pid} not running). Cleared.`);
	process.exit(0);
}

try {
	process.kill(pid);
	try {
		fs.unlinkSync(pidFile);
	} catch {
		// ignore
	}
	console.log(`Stopped bot PID ${pid}.`);
} catch (err) {
	console.error(`Could not stop PID ${pid}:`, err);
	process.exit(1);
}