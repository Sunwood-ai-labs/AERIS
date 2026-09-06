import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const [target, platform] = process.argv.slice(2);
const allowed = {'windows-x64':'x86_64-pc-windows-msvc','macos-arm64':'aarch64-apple-darwin','macos-x64':'x86_64-apple-darwin','linux-x64':'x86_64-unknown-linux-gnu'};
if (allowed[platform] !== target) throw Error('Unsupported build target');
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const build=path.resolve('src-tauri/target',target,'release');
const output=path.resolve('release/ci'); fs.mkdirSync(output,{recursive:true});
const privateOutput=path.resolve('artifacts/native-ci.json'); fs.mkdirSync(path.dirname(privateOutput),{recursive:true});
const executable=path.join(build,process.platform==='win32'?'aeris.exe':'aeris');
// The sample includes host/process details. It is deliberately never uploaded.
const test=spawnSync(executable,['--self-test',privateOutput],{encoding:'utf8',timeout:30000,windowsHide:true});
if(test.error||test.status!==0) throw Error(`Native self-test failed: ${test.error||test.stderr||test.status}`);
console.log(`Native integration test passed on ${platform}`);

function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
const packages=walk(path.join(build,'bundle')).filter(file=>/\.(exe|dmg|deb|AppImage)$/.test(file));
if(!packages.length)throw Error('No installable package was generated');
for(const file of packages){
 const extension=path.extname(file); const suffix=extension==='.exe'?'-setup':'';
 fs.copyFileSync(file,path.join(output,`AERIS-${version}-${platform}${suffix}${extension}`));
}
if(process.platform==='win32'){
 const stage=path.resolve('release/portable/AERIS'); fs.mkdirSync(stage,{recursive:true});
 fs.copyFileSync(executable,path.join(stage,'AERIS.exe'));
 for(const file of fs.readdirSync(build).filter(name=>name.endsWith('.dll')))fs.copyFileSync(path.join(build,file),path.join(stage,file));
 for(const file of ['README.md','README.ja.md','LICENSE','THIRD_PARTY.md'])fs.copyFileSync(file,path.join(stage,file));
 for(const dir of ['docs','brand'])fs.cpSync(dir,path.join(stage,dir),{recursive:true});
 const zip=path.join(output,`AERIS-${version}-${platform}-portable.zip`);
 const escape=value=>"'"+value.replaceAll("'","''")+"'";
 const packed=spawnSync('pwsh',['-NoProfile','-Command',`Compress-Archive -LiteralPath ${escape(stage)} -DestinationPath ${escape(zip)} -Force`],{stdio:'inherit',windowsHide:true});
 if(packed.status!==0)throw Error('Portable archive failed');
}
const files=fs.readdirSync(output).filter(name=>!name.endsWith('.sha256'));
for(const name of files){const hash=createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex');fs.writeFileSync(path.join(output,`${name}.sha256`),`${hash}  ${name}\n`);}
console.log('Collected packages:',files.join(', '));
