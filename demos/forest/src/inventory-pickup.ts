import type Phaser from 'phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import { PhaserAdventureIcon } from '@pointlesh/phaser';

export type PickupOrigin = { x: number; y: number };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - (1 - t) ** 3;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Presentation only: items are owned immediately, even if feedback is cancelled. */
export class InventoryPickup {
  private known = new Set<string>();
  private queue: { id: string; origin: PickupOrigin }[] = [];
  private active?: { id: string; origin: PickupOrigin; elapsed: number; node: HTMLDivElement; icon: PhaserAdventureIcon; label: HTMLSpanElement };
  private landing?: Animation;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime, private options: {
    asset: (id: string) => string; name: (id: string) => string;
    slot: (id: string) => HTMLElement | undefined; origin: () => PickupOrigin;
    stage: HTMLElement; bar: HTMLElement; paused: () => boolean;
  }) {
    scene.events.on('postupdate', this.update);
    scene.events.once('shutdown', this.destroy);
  }
  reset(ids: readonly string[]): void { this.cancel(); this.known = new Set(ids); }
  observe(ids: readonly string[], origin = this.options.origin()): void {
    for (const id of ids) if (!this.known.has(id)) this.queue.push({ id, origin });
    this.known = new Set(ids);
    this.queue = this.queue.filter(item => this.known.has(item.id));
    if (this.active && !this.known.has(this.active.id)) this.finish();
    if (!this.active) this.next();
    // Inventory renders can replace the DOM slots while feedback is in flight.
    for (const id of [this.active?.id, ...this.queue.map(item => item.id)]) {
      if (id) this.options.slot(id)?.classList.add('pickup-pending');
    }
  }
  cancel(): void {
    this.queue = []; this.finish(); this.landing?.cancel(); this.landing = undefined;
    this.options.bar.classList.remove('pickup-revealed');
    this.options.bar.querySelectorAll('.pickup-pending').forEach(node => node.classList.remove('pickup-pending'));
  }
  private finish(): void {
    if (!this.active) return;
    this.options.slot(this.active.id)?.classList.remove('pickup-pending');
    this.active.icon.destroy(); this.active.node.remove(); this.active = undefined;
  }
  private next(): void {
    const item = this.queue.shift();
    if (!item) { this.options.bar.classList.remove('pickup-revealed'); return; }
    this.options.bar.classList.add('pickup-revealed');
    this.options.bar.closest<HTMLElement>('.game-shell')?.style.setProperty('--pickup-bar-height', `${this.options.bar.offsetHeight}px`);
    const node = document.createElement('div'); node.className = 'inventory-pickup-flight'; node.setAttribute('aria-hidden', 'true');
    node.dataset.itemId = item.id;
    const icon = new PhaserAdventureIcon(this.scene, this.runtime, {
      assetId: this.options.asset(item.id), width: 112, height: 112, idleAnimation: 'idle', paused: this.options.paused,
    });
    const label = document.createElement('span'); label.textContent = this.options.name(item.id);
    node.append(icon.canvas, label); document.body.append(node);
    this.active = { ...item, elapsed: 0, node, icon, label };
    this.draw();
  }
  private draw(): void {
    const a = this.active;
    if (!a) return;
    const stage = this.options.stage.getBoundingClientRect();
    const slot = this.options.slot(a.id)?.getBoundingClientRect();
    if (!slot) { this.finish(); this.next(); return; }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 350 : 1450;
    const t = Math.min(1, a.elapsed / duration);
    const center = { x: stage.left + stage.width / 2, y: stage.top + stage.height * .43 };
    const end = { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 };
    const peak = Math.min(112, stage.width * .19) / 112, normal = 36 / 112;
    let x: number, y: number, scale: number, turn = 0;
    if (reduced) { x = end.x; y = end.y; scale = normal; }
    else if (t < .46) {
      const p = ease(t / .46);
      x = mix(a.origin.x, center.x, p); y = mix(a.origin.y, center.y, p) - Math.sin(Math.PI * p) * 24;
      scale = mix(normal, peak, p); turn = 360 * p;
    } else if (t < .58) { x = center.x; y = center.y; scale = peak; turn = 360; }
    else {
      const p = smooth((t - .58) / .42);
      x = mix(center.x, end.x, p); y = mix(center.y, end.y, p) - Math.sin(Math.PI * p) * 35;
      scale = mix(peak, normal, p); turn = 360;
    }
    a.node.style.transform = `translate3d(${x - 56}px,${y - 56}px,0) scale(${scale})`;
    a.icon.canvas.style.transform = `rotate(${turn}deg)`;
    a.label.style.opacity = reduced ? '0' : String(Math.max(0, Math.min(1, (t - .3) * 10, (.8 - t) * 10)));
    if (t === 1) {
      const target = this.options.slot(a.id);
      this.finish();
      this.landing = target?.animate([{ boxShadow: '0 0 0 2px #dfc78aaa', backgroundColor: '#58613a' },
        { boxShadow: '0 0 0 0px #dfc78a00' }], { duration: 450, easing: 'ease-out' });
      if (this.queue.length) this.next();
      else if (this.landing) this.landing.onfinish = () => { if (!this.active) this.options.bar.classList.remove('pickup-revealed'); };
      else this.options.bar.classList.remove('pickup-revealed');
    }
  }
  private update = (_time: number, delta: number): void => {
    if (!this.active || this.options.paused()) return;
    this.active.elapsed += Math.min(100, Math.max(0, delta)); this.draw();
  };
  destroy = (): void => {
    this.cancel(); this.scene.events.off('postupdate', this.update); this.scene.events.off('shutdown', this.destroy);
  };
}
