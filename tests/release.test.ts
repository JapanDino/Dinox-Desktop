import {test,expect} from 'bun:test';
import {manifest} from '../scripts/release-manifest.mjs';
import {readFileSync} from 'node:fs';
test('release metadata uses the matching version, repository and Windows target',()=>{
 const m=manifest('4.0.1',' fixture-signature ','2026-09-25T00:00:00Z');
 expect(m.platforms['windows-x86_64'].url).toBe('https://github.com/JapanDino/Dinox-Desktop/releases/download/v4.0.1/Dinox-Desktop_4.0.1_x64-setup.exe');
 expect(m.platforms['windows-x86_64'].signature).toBe('fixture-signature');
 expect(()=>manifest('4.0.1-beta','sig')).toThrow();expect(()=>manifest('4.0.1','')).toThrow();
});
test('shipping updater has no original Bloom endpoint and requires its own public key',()=>{
 const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
 expect(config.plugins.updater.endpoints).toEqual(['https://github.com/JapanDino/Dinox-Desktop/releases/latest/download/latest.json']);
 expect(config.bundle.createUpdaterArtifacts).toBe(true);
 expect(Buffer.from(config.plugins.updater.pubkey,'base64').toString()).toContain('minisign public key');
 expect(config.plugins.updater.dangerousInsecureTransportProtocol).not.toBe(true);
});
