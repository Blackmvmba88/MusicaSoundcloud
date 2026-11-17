/** Opt-in macOS launchd installer for the BlackMamba Downloads observer. */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.platform !== 'darwin') throw new Error('Solo macOS (launchd)');

const label = 'com.blackmamba.records.download-ingest';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plist = join(homedir(), 'Library', 'LaunchAgents', label + '.plist');
const service = 'gui/' + process.getuid() + '/' + label;
const domain = 'gui/' + process.getuid();
const agent = join(root, 'automations', 'download-ingest-agent.mjs');
const state = resolve(process.env.BLACKMAMBA_INGEST_STATE || join(root, 'storage/sync/download-ingest-state.json'));
const logs = join(root, 'storage/logs');
const downloads = resolve(process.env.BLACKMAMBA_DOWNLOADS_DIR || join(homedir(), 'Downloads'));
const media = resolve(process.env.WORKER_MEDIA_DIR || join(root, 'media'));
const xml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const launchctl = (...args) => spawnSync('/bin/launchctl', args, { encoding: 'utf8' });
const action = process.argv[2] || 'status';

if (action === 'install') {
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(logs, { recursive: true });
  mkdirSync(dirname(state), { recursive: true });
  const env = {
    BLACKMAMBA_DOWNLOADS_DIR: downloads,
    WORKER_MEDIA_DIR: media,
    BLACKMAMBA_INGEST_STATE: state,
    BLACKMAMBA_STABLE_MS: process.env.BLACKMAMBA_STABLE_MS || '3000',
    BLACKMAMBA_RESCAN_SECONDS: process.env.BLACKMAMBA_RESCAN_SECONDS || '30',
  };
  const envXML = Object.entries(env).map(([key,val])=>'<key>'+xml(key)+'</key><string>'+xml(val)+'</string>').join('\n');
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '<key>Label</key><string>'+label+'</string>',
    '<key>ProgramArguments</key><array><string>'+xml(process.execPath)+'</string><string>'+xml(agent)+'</string></array>',
    '<key>WorkingDirectory</key><string>'+xml(root)+'</string>',
    '<key>EnvironmentVariables</key><dict>'+envXML+'</dict>',
    '<key>RunAtLoad</key><true/>',
    '<key>KeepAlive</key><true/>',
    '<key>ThrottleInterval</key><integer>10</integer>',
    '<key>StandardOutPath</key><string>'+xml(join(logs,'download-ingest.log'))+'</string>',
    '<key>StandardErrorPath</key><string>'+xml(join(logs,'download-ingest.err.log'))+'</string>',
    '</dict></plist>\n',
  ].join('\n');
  // Only touch our own named service.
  launchctl('bootout',service);
  writeFileSync(plist,body,{mode:0o600});
  const result = launchctl('bootstrap',domain,plist);
  if (result.status !== 0) throw new Error('launchd bootstrap: '+String(result.stderr).trim());
  const kick = launchctl('kickstart','-k',service);
  if (kick.status !== 0) throw new Error('launchd kickstart: '+String(kick.stderr).trim());
  process.stdout.write(JSON.stringify({status:'installed',label,downloads,media,plist})+'\n');
} else if (action === 'status') {
  const result = launchctl('print',service);
  process.stdout.write(result.status === 0 ? result.stdout : 'No iniciado: '+String(result.stderr));
  process.exitCode = result.status === 0 ? 0 : 1;
} else if (action === 'uninstall') {
  launchctl('bootout',service);
  rmSync(plist,{force:true});
  process.stdout.write('Desinstalado. Los archivos y checkpoints se conservaron.\n');
} else throw new Error('Uso: node scripts/download-agent-service.mjs install|status|uninstall');
