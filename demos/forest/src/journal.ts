import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import { PhaserAdventureIcon } from '@pointlesh/phaser';
import { JOURNAL_QUILL_ASSET, JOURNAL_SCROLL_ASSET } from './journal-assets';

/** One continuous scroll; note text remains part of the saved story. */
export function renderJournal(host: HTMLElement, notes: readonly string[]): void {
  const scroll = document.createElement('section'); scroll.className = 'journal-scroll';
  scroll.setAttribute('aria-label', 'Borin’s handwritten notes'); scroll.tabIndex = 0;
  const title = document.createElement('h3'); title.textContent = 'Borin’s field notes';
  const list = document.createElement('ul'); list.className = 'journal-notes';
  for (const note of notes) {
    const row = document.createElement('li'); row.className = 'journal-note';
    const text = document.createElement('p'); text.textContent = note;
    row.append(text); list.append(row);
  }
  const signature = document.createElement('p'); signature.className = 'journal-signature'; signature.textContent = '— Borin';
  scroll.append(title, list, signature); host.replaceChildren(scroll);
}

/** Only additions during play trigger feedback; restores establish a fresh baseline. */
export class ForestJournal {
  private known = new Set<string>();
  private pending: string[] = [];
  private animation?: Animation;
  private paperSource?: HTMLImageElement | HTMLCanvasElement;
  readonly icon: PhaserAdventureIcon;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime,
    private notification: HTMLElement, private unreadDot: HTMLElement) {
    this.icon = new PhaserAdventureIcon(scene, runtime, { assetId: JOURNAL_QUILL_ASSET, width: 104, height: 104 });
    notification.querySelector('.journal-quill')!.replaceChildren(this.icon.canvas);
    this.syncPaper();
    scene.events.once('shutdown', this.destroy);
  }
  reset(notes: readonly string[]): void {
    this.known = new Set(notes); this.markRead();
  }
  observe(notes: readonly string[]): void {
    const added = notes.filter(note => !this.known.has(note));
    this.known = new Set(notes);
    if (!added.length) return;
    this.unreadDot.hidden = false; this.pending.push(...added);
    if (!this.animation) this.next();
  }
  markRead(): void { this.unreadDot.hidden = true; this.clearNotification(); }
  clearNotification(): void {
    this.pending = []; this.animation?.cancel(); this.animation = undefined;
    this.icon.stop(); this.notification.hidden = true;
  }
  refresh(): void { this.icon.refresh(); this.syncPaper(); }
  private syncPaper(): void {
    const frame = this.scene.textures.getFrame(this.runtime.key(JOURNAL_SCROLL_ASSET));
    const source = frame?.source.image;
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) || source === this.paperSource) return;
    // AI Assets can revoke an image's loading blob after decoding it. Copy its
    // loaded pixels rather than asking CSS to fetch that expired URL again.
    const canvas = this.notification.ownerDocument.createElement('canvas');
    canvas.width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    canvas.height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    canvas.getContext('2d')!.drawImage(source, 0, 0);
    this.notification.ownerDocument.documentElement.style.setProperty('--journal-paper', `url(${JSON.stringify(canvas.toDataURL())})`);
    this.paperSource = source;
  }
  private next(): void {
    const note = this.pending.shift();
    if (!note) { this.notification.hidden = true; return; }
    this.notification.querySelector('.journal-notification-note')!.textContent = note;
    this.notification.hidden = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) this.icon.play('write');
    const move = (y: number) => reduced ? 'none' : `translateY(${y}px)`;
    this.animation = this.notification.animate([
      { opacity: 0, transform: move(-8), offset: 0 },
      { opacity: 1, transform: move(0), offset: .1 },
      { opacity: 1, transform: move(0), offset: .8 },
      { opacity: 0, transform: move(-4), offset: 1 },
    ], { duration: 3600, easing: 'ease-in-out' });
    this.animation.onfinish = () => { this.animation = undefined; this.next(); };
  }
  destroy = (): void => {
    this.clearNotification(); this.icon.destroy(); this.scene.events.off('shutdown', this.destroy);
  };
}
