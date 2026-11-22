import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pidFile = path.join(root, '.bot.pid');
const distEntry = path.join(root, 'dist', 'index.js');
const logsDir = path.join(root, 'logs');
const logPath = path.join(logsDir, 'bot.log');

function isAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function readSavedPid() {
	try {
		const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
		return Number.isFinite(pid) && pid > 0 ? pid : undefined;
	} catch {
		return undefined;
	}
}

const existing = readSavedPid();
if (existing !== undefined && isAlive(existing)) {
	console.error(`Bot already running (PID ${existing}). Run: npm run bot:stop`);
	process.exit(1);
}
if (existing !== undefined) {
	try {
		fs.unlinkSync(pidFile);
	} catch {
		// stale pid file
	}
}

if (!fs.existsSync(distEntry)) {
	console.error('Missing dist/index.js — run: npm run build');
	process.exit(1);
}

fs.mkdirSync(logsDir, { recursive: true });
fs.appendFileSync(logPath, `\n--- start ${new Date().toISOString()} ---\n`);

const logFd = fs.openSync(logPath, 'a');
const child = spawn(process.execPath, [distEntry], {
	cwd: root,
	detached: true,
	stdio: ['ignore', logFd, logFd],
	env: process.env,
});

child.unref();

if (child.pid !== undefined) {
	fs.writeFileSync(pidFile, String(child.pid), 'utf8');
}

console.log(`Bot started detached (PID ${child.pid}).`);
console.log(`Log file: ${logPath}`);
console.log('Use npm run bot:stop to shut down.');