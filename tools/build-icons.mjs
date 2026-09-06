import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'brand/aeris-mark.svg'), 'utf8');
if (/<(?:image|text|script|foreignObject)\b|(?:href|url\()/.test(source)) throw Error('The icon master must contain only self-contained vector geometry.');
const mark = source.replace(/^<svg[^>]*>\s*/, '').replace(/\s*<\/svg>\s*$/, '');
const mono = mark.replace(/fill="#[0-9a-f]+"/gi, 'fill="currentColor"');
const wrap = (content, label, size = 256) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">\n${content}\n</svg>\n`;
const plate = '<rect x="8" y="8" width="240" height="240" rx="56" fill="#081827"/><rect x="9" y="9" width="238" height="238" rx="55" fill="none" stroke="#24475b" stroke-width="2"/>';
const icon = wrap(`${plate}<g transform="translate(37 34) scale(2.8)">${mark}</g>`, 'AERIS application icon');
// The tray variant has a brighter one-colour silhouette and tighter spacing.
const tray = wrap(`<rect x="1" y="1" width="30" height="30" rx="8" fill="#081827"/><g color="#75e4ff" transform="translate(3 3) scale(.41)">${mono}</g>`, 'AERIS tray icon', 32);
const monoSvg = wrap(mono, 'AERIS monochrome symbol', 64);
function write(relative, content) { const file=path.join(root, relative); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,content); }
function render(svg, width) { return new Resvg(svg, {fitTo:{mode:'width',value:width}}).render().asPng(); }

write('brand/aeris-icon.svg', icon);
write('brand/aeris-tray.svg', tray);
write('brand/aeris-monochrome.svg', monoSvg);
write('src-tauri/icons/icon.png', render(icon, 256));
write('src-tauri/icons/tray.png', render(tray, 32));

// PNG-compressed ICO entries are supported by the targeted modern Windows.
// Every size is rendered from vector geometry, never enlarged from a bitmap.
const sizes=[16,20,24,32,40,48,64,128,256];
const pngs=sizes.map(size=>render(icon,size));
const directory=Buffer.alloc(6+16*sizes.length);
directory.writeUInt16LE(1,2); directory.writeUInt16LE(sizes.length,4);
let offset=directory.length;
sizes.forEach((size,i)=>{
  const entry=6+i*16;
  directory[entry]=size===256?0:size; directory[entry+1]=size===256?0:size;
  directory.writeUInt16LE(1,entry+4); directory.writeUInt16LE(32,entry+6);
  directory.writeUInt32LE(pngs[i].length,entry+8); directory.writeUInt32LE(offset,entry+12);
  offset+=pngs[i].length;
});
write('src-tauri/icons/icon.ico', Buffer.concat([directory,...pngs]));
// Modern ICNS containers store PNG representations for Retina app icons.
const icnsEntries=[[256,'ic08'],[512,'ic09'],[1024,'ic10']].map(([size,type])=>{
  const png=render(icon,size); const entry=Buffer.alloc(8); entry.write(type,0,'ascii'); entry.writeUInt32BE(png.length+8,4); return Buffer.concat([entry,png]);
});
const icnsHeader=Buffer.alloc(8); icnsHeader.write('icns'); icnsHeader.writeUInt32BE(8+icnsEntries.reduce((sum,b)=>sum+b.length,0),4);
write('src-tauri/icons/icon.icns', Buffer.concat([icnsHeader,...icnsEntries]));

const banner=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360" viewBox="0 0 1200 360" role="img" aria-label="AERIS — A lighter view of your desktop">
<rect width="1200" height="360" rx="22" fill="#081827"/>
<path d="M610 360C795 355 979 251 1200 49M767 360C960 314 1080 225 1200 105" fill="none" stroke="#56cde7" stroke-opacity=".12" stroke-width="2"/>
<g transform="translate(76 80) scale(2.8)">${mark}</g>
<text x="314" y="178" fill="#edf8fc" font-family="Segoe UI, sans-serif" font-weight="600" font-size="77" letter-spacing="13">AERIS</text>
<text x="319" y="223" fill="#a7c7d6" font-family="Segoe UI, sans-serif" font-size="21" letter-spacing="2">A lighter view of your desktop.</text>
<text x="82" y="306" fill="#6da6bc" font-family="Segoe UI, sans-serif" font-size="12" letter-spacing="3">WINDOWS SYSTEM MONITOR · TAURI + RUST</text>
<g transform="translate(1010 97) scale(2)" opacity=".07">${mono.replaceAll('currentColor','#9beaff')}</g>
</svg>\n`;
write('docs/assets/aeris-banner.svg', banner);

if (process.argv.includes('--preview')) {
  const row=sizes.slice(0,-1).map((size,i)=>`<g transform="translate(${38+i*112} 306)"><image href="data:image/png;base64,${pngs[i].toString('base64')}" width="${size}" height="${size}"/><text y="158" fill="#aac1d0" font-family="Segoe UI" font-size="12">${size}px</text></g>`).join('');
  const sheet=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="510"><rect width="960" height="510" fill="#06111d"/><g transform="translate(35 25)">${icon.replace(/<svg[^>]*>|<\/svg>/g,'')}</g><g transform="translate(365 68) scale(2.5)">${mark}</g><rect x="666" y="25" width="256" height="256" rx="18" fill="#e6eef2"/><g color="#0a293e" transform="translate(710 65) scale(2.8)">${mono}</g>${row}</svg>`;
  write('artifacts/aeris-icons-review.png',render(sheet,960));
  write('artifacts/aeris-banner-review.png',render(banner,1200));
}
console.log(`AERIS SVG family and Windows icons generated (${sizes.join(', ')} px).`);
