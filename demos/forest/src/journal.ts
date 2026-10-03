import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import { PhaserAdventureIcon } from '@pointlesh/phaser';
import { JOURNAL_QUILL_ASSET } from './journal-assets';

const NOTES_PER_PAGE = 3;

/** The demo's notebook presentation; note text remains part of the saved story. */
export function renderJournal(host: HTMLElement, notes: readonly string[]): void {
  let spread = 0;
  const spreads = Math.max(1, Math.ceil(notes.length / (NOTES_PER_PAGE * 2)));
  const draw = () => {
    const book = document.createElement('div'); book.className = 'journal-spread';
    for (let side = 0; side < 2; side++) {
      const page = document.createElement('section'); page.className = 'journal-leaf';
      const pageIndex = spread * 2 + side;
      page.setAttribute('aria-label', `Journal page ${pageIndex + 1}`);
      const heading = document.createElement('header'); heading.className = 'journal-page-heading';
      const kicker = document.createElement('span'); kicker.className = 'journal-kicker';
      kicker.textContent = side === 0 ? 'THE ELDERWOOD · A RESCUE' : 'OBSERVATIONS & SMALL REVELATIONS';
      const title = document.createElement('h3'); title.textContent = side === 0 ? 'Borin’s field notes' : 'Along the way';
      const subtitle = document.createElement('p'); subtitle.textContent = side === 0 ? 'A king to bring home. A few things to remember.' : 'Best written down before I forget.';
      heading.append(kicker, title, subtitle); page.append(heading);
      const first = pageIndex * NOTES_PER_PAGE, entries = notes.slice(first, first + NOTES_PER_PAGE);
      const list = document.createElement('ol'); list.className = 'journal-notes'; list.start = first + 1;
      for (const [index, note] of entries.entries()) {
        const row = document.createElement('li'); row.className = 'journal-note';
        const number = document.createElement('span'); number.className = 'journal-note-number'; number.setAttribute('aria-hidden', 'true');
        number.textContent = String(first + index + 1).padStart(2, '0');
        const text = document.createElement('p'); text.textContent = note;
        row.append(number, text); list.append(row);
      }
      page.append(list);
      if (!entries.length) {
        const blank = document.createElement('p'); blank.className = 'journal-blank';
        blank.textContent = 'A little room for good news…'; page.append(blank);
      }
      const folio = document.createElement('span'); folio.className = 'journal-folio'; folio.textContent = String(pageIndex + 1);
      page.append(folio); book.append(page);
    }
    const nav = document.createElement('nav'); nav.className = 'journal-pagination'; nav.setAttribute('aria-label', 'Journal pages');
    const previous = document.createElement('button'); previous.textContent = '← Earlier notes'; previous.disabled = spread === 0;
    previous.onclick = () => { spread--; draw(); host.scrollIntoView({ block: 'nearest' }); };
    const label = document.createElement('span'); label.textContent = `Pages ${spread * 2 + 1}–${spread * 2 + 2} of ${spreads * 2}`;
    const next = document.createElement('button'); next.textContent = 'Later notes →'; next.disabled = spread === spreads - 1;
    next.onclick = () => { spread++; draw(); host.scrollIntoView({ block: 'nearest' }); };
    nav.append(previous, label, next); host.replaceChildren(book, nav);
  };
  draw();
}

/** Only additions during play trigger feedback; restores establish a fresh baseline. */
export class ForestJournal {
  private known = new Set<string>();
  private pending: string[] = [];
  private animation?: Animation;
  readonly icon: PhaserAdventureIcon;
  constructor(private scene: Phaser.Scene, runtime: AiAssetRuntime,
    private notification: HTMLElement, private unreadDot: HTMLElement) {
    this.icon = new PhaserAdventureIcon(scene, runtime, { assetId: JOURNAL_QUILL_ASSET, width: 104, height: 104 });
    notification.querySelector('.journal-quill')!.replaceChildren(this.icon.canvas);
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
  refresh(): void { this.icon.refresh(); }
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
