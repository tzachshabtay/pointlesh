import { roomNames, type RoomId } from './story';
import type { AiAssetManifest } from '@ai-game-assets/core';

export const WORLD_MAP_ASSET = 'interface.world-map';
export function addWorldMapAsset(manifest: AiAssetManifest): void {
  manifest.assets[WORLD_MAP_ASSET] ??= {
    id: WORLD_MAP_ASSET, kind: 'image', dimensions: { width: 1536, height: 1024 },
    prompt: 'A hand-drawn dwarven parchment map: mine northwest, orc camp northeast, forest center, village south, pub southwest and cottage southeast. See art-source/world-map.txt for the full prompt.',
    activeVersion: 'original', tags: ['forest', 'ui', 'map'],
    versions: { original: { name: 'original', file: 'art/interface/elderwood-map.png', prompt: 'Hand-drawn dwarven map matching the room exits. Full prompt in art-source/world-map.txt.', model: 'imagegen', createdAt: '2026-10-26T00:00:00.000Z' } },
  };
  (manifest.assetPaths ??= {})[WORLD_MAP_ASSET] ??= ['Graphics', 'Interface'];
}

// Coordinates follow the cartographer's landmarks and cartouches, in percent.
// The geographical relationships mirror the room exits, not a grid of thumbnails.
const regions: { id: RoomId; bounds: number[]; label: number[] }[] = [
  { id: 'mine', bounds: [7, 5, 32, 29], label: [22.3, 30.2] },
  { id: 'camp', bounds: [66, 5, 30, 29], label: [78, 30.8] },
  { id: 'forest', bounds: [30, 34, 40, 26], label: [50, 57.1] },
  { id: 'pub', bounds: [5, 61, 26, 30], label: [18.3, 87.8] },
  { id: 'village', bounds: [33, 61, 34, 30], label: [50, 87.8] },
  { id: 'house', bounds: [70, 63, 26, 28], label: [80.8, 87.8] },
];

export function renderWorldMap(host: HTMLElement, image: CanvasImageSource, current: RoomId, travel: (room: RoomId) => void): void {
  const instruction = document.createElement('p'); instruction.className = 'world-map-instruction';
  instruction.textContent = 'Choose a landmark to travel · Follow the dotted trails';
  const scroll = document.createElement('div'); scroll.className = 'world-map-scroll';
  const map = document.createElement('nav'); map.className = 'world-map'; map.setAttribute('aria-label', 'Map of the Elderwood');
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024;
  canvas.setAttribute('aria-hidden', 'true'); canvas.getContext('2d')!.drawImage(image, 0, 0, 1536, 1024); map.append(canvas);
  for (const { id, bounds: [x, y, w, h], label: [lx, ly] } of regions) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'world-map-region'; button.dataset.room = id;
    button.setAttribute('aria-label', roomNames[id]); button.title = id === current ? `${roomNames[id]} — You are here` : `Travel to ${roomNames[id]}`;
    button.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
    const label = document.createElement('span'); label.className = 'world-map-label'; label.textContent = roomNames[id].replace(/^The /, '');
    label.style.cssText = `left:${(lx! - x!) / w! * 100}%;top:${(ly! - y!) / h! * 100}%`;
    if (id === current) { button.setAttribute('aria-current', 'location'); const marker = document.createElement('small'); marker.className = 'world-map-here'; marker.textContent = '◆ You are here'; label.append(marker); }
    button.append(label); button.onclick = () => travel(id); map.append(button);
  }
  scroll.append(map); host.replaceChildren(instruction, scroll);
}
