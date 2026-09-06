import type { Settings } from './model';
import { ShuffleDeck } from './shuffle';
import aurora from './assets/backgrounds/aurora.png';
import glass from './assets/backgrounds/glass.png';
import nebula from './assets/backgrounds/nebula.png';

export const wallpapers = [
  { id: 'aurora', name: 'オーロラ', url: aurora },
  { id: 'glass', name: 'ガラスの波', url: glass },
  { id: 'nebula', name: '星雲', url: nebula },
] as const;

export function createBackground(shell: HTMLElement) {
  const backdrop = document.createElement('div');
  backdrop.className = 'wallpaper';
  backdrop.setAttribute('aria-hidden', 'true');
  const layers = [new Image(), new Image()];
  layers.forEach(img => { img.alt = ''; img.draggable = false; backdrop.append(img); });
  shell.prepend(backdrop);
  const deck = new ShuffleDeck(wallpapers.length);
  let current: Settings | undefined;
  let activeLayer = 0;
  let currentIndex = -1;
  let generation = 0;
  let nativeActive = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => nativeActive && !document.hidden;
  const stop = () => { clearTimeout(timer); timer = undefined; };
  function schedule() {
    stop();
    if (visible() && current?.wallpaper === 'random' && current.imageOpacity > 0) {
      timer = setTimeout(() => { void show(deck.next()); schedule(); }, current.wallpaperInterval * 1000);
    }
  }
  async function show(index: number) {
    if (index === currentIndex) { shell.dataset.wallpaper = wallpapers[index].id; return; }
    const request = ++generation;
    const incoming = layers[1 - activeLayer];
    incoming.src = wallpapers[index].url;
    try { await incoming.decode(); } catch { return; }
    if (request !== generation || !current || current.wallpaper === 'none') return;
    layers[activeLayer].classList.remove('active');
    incoming.classList.add('active');
    activeLayer = 1 - activeLayer;
    currentIndex = index;
    shell.dataset.wallpaper = wallpapers[index].id;
  }
  document.addEventListener('visibilitychange', schedule);
  return {
    setActive(active: boolean) { nativeActive = active; schedule(); },
    update(settings: Settings) {
      const modeChanged = current?.wallpaper !== settings.wallpaper;
      const timerChanged = modeChanged || current?.wallpaperInterval !== settings.wallpaperInterval || current?.imageOpacity !== settings.imageOpacity;
      current = { ...settings };
      shell.style.setProperty('--glass-opacity', String(settings.glassOpacity / 100));
      backdrop.style.opacity = settings.wallpaper === 'none' ? '0' : String(settings.imageOpacity / 100);
      if (modeChanged) {
        ++generation;
        if (settings.wallpaper === 'none') shell.dataset.wallpaper = 'none';
        else void show(settings.wallpaper === 'random' ? deck.next() : wallpapers.findIndex(w => w.id === settings.wallpaper));
      }
      if (timerChanged) schedule();
    },
  };
}

export const appearanceSettings = `<div class="appearance-settings">
  <div class="appearance-title"><div><div class="eyebrow">GLASS & ATMOSPHERE</div><h3>透ける背景</h3></div><span class="muted">メイン画面・ガジェット共通</span></div>
  <div class="wallpaper-picker" role="group" aria-label="背景画像">
    <button data-wallpaper="random" class="wallpaper-option random-option"><span class="wallpaper-thumb">↝</span><span>ランダム再生</span></button>
    ${wallpapers.map(w => `<button data-wallpaper="${w.id}" class="wallpaper-option"><img src="${w.url}" alt="" loading="lazy"><span>${w.name}</span></button>`).join('')}
    <button data-wallpaper="none" class="wallpaper-option none-option"><span class="wallpaper-thumb">○</span><span>画像なし</span></button>
  </div>
  <div class="appearance-controls">
    <label>背景の切り替え<select id="wallpaper-interval"><option value="15">15 秒</option><option value="30">30 秒</option><option value="60">1 分</option><option value="300">5 分</option></select></label>
    <label>パネルの濃さ <output id="glass-value">70%</output><input id="glass-opacity" type="range" min="35" max="90" step="1" value="70" aria-label="パネルの濃さ"></label>
    <label>画像の濃さ <output id="image-value">24%</output><input id="image-opacity" type="range" min="0" max="60" step="1" value="24" aria-label="画像の濃さ"></label>
  </div>
  <p class="appearance-hint">パネルを薄くすると背後が透けます。ランダム再生は3枚をひと巡りし、順序を変えて繰り返します。</p>
</div>`;
