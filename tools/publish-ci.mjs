import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const tag=process.env.RELEASE_TAG;
if(tag!==`v${version}`)throw Error('Tag must match the application version');
const files=fs.readdirSync('release/ci').sort();
for(const platform of ['windows-x64','macos-arm64','macos-x64','linux-x64']){
 if(!files.some(name=>name.includes(platform)&&!name.endsWith('.sha256')))throw Error(`Missing platform: ${platform}`);
}
function gh(args){const result=spawnSync('gh',args,{stdio:'inherit'});if(result.status!==0)throw Error(`GitHub release command failed (${result.status})`);}
const notes=`AERIS ${version}\n\nWindows x64 / macOS Apple Silicon + Intel / Linux x64.\n\nAll platform packages are built and integration-tested by GitHub Actions. The UI is Japanese. See README for installation, screenshots, and platform differences.\n\nmacOS builds use ad-hoc signing and are not notarized. Windows installers are not Authenticode-signed.\n\nIndividual .sha256 files are included.\n`;
fs.writeFileSync('release/release-notes.md',notes);
const exists=spawnSync('gh',['release','view',tag],{stdio:'ignore'}).status===0;
if(!exists)gh(['release','create',tag,'--verify-tag','--draft','--title',`AERIS ${version}`,'--notes-file','release/release-notes.md']);
gh(['release','upload',tag,...files.map(name=>path.join('release/ci',name)),'--clobber']);
gh(['release','edit',tag,'--draft=false','--latest']);
