import type { Point } from '@pointlesh/core';
import type { RoomId } from './story';
import doorMasks from './door-occlusion.json';

export type ForestDoorLayout = {
  id: string; room: RoomId; to: RoomId; targetId: string; name: string; background: string;
  crop: { left: number; top: number; width: number; height: number };
  aperture: Point[]; scaleX: number; scaleY: number;
  alwaysOpen?: boolean;
};
const points = (pairs: number[][]): Point[] => pairs.map(([x, y]) => ({ x: x!, y: y! }));
export const forestDoors: ForestDoorLayout[] = [
  { id: 'village-pub', room: 'village', to: 'pub', targetId: 'pub-door', name: 'Copper Tankard door · outside', background: 'atlas-village-pub-lamps.png', alwaysOpen: true,
    crop: { left: 150, top: 285, width: 105, height: 185 }, aperture: points([[14,43],[22,27],[44,21],[60,26],[81,48],[83,175],[13,175]]), scaleX: 960 / 1182, scaleY: 540 / 664 },
  { id: 'village-house', room: 'village', to: 'house', targetId: 'home-door', name: 'Cottage door · outside', background: 'atlas-village-pub-lamps.png',
    crop: { left: 893, top: 315, width: 110, height: 150 }, aperture: points([[17,51],[27,24],[50,16],[73,23],[92,48],[93,139],[18,139]]), scaleX: 960 / 1182, scaleY: 540 / 664 },
  { id: 'pub', room: 'pub', to: 'village', targetId: 'pub-exit', name: 'Copper Tankard door · inside', background: 'pub-lamps.png', alwaysOpen: true,
    crop: { left: 975, top: 110, width: 159, height: 275 }, aperture: points([[26,63],[38,34],[66,20],[96,27],[123,47],[140,80],[140,260],[24,260]]), scaleX: 960 / 1182, scaleY: 540 / 664 },
  { id: 'house', room: 'house', to: 'village', targetId: 'house-exit', name: 'Cottage door · inside', background: 'house-lamps.png',
    crop: { left: 1040, top: 145, width: 128, height: 300 }, aperture: points([[22,71],[34,40],[62,22],[86,43],[108,70],[108,286],[22,286]]), scaleX: 960 / 1182, scaleY: 540 / 664 },
  { id: 'forest-mine', room: 'forest', to: 'mine', targetId: 'mine-path', name: 'Goldroot Mine gate', background: 'forest-lamps.png',
    crop: { left: 305, top: 303, width: 120, height: 145 }, aperture: points([[17,55],[25,33],[48,20],[72,29],[96,48],[96,125],[17,125]]), scaleX: 1620 / 2172, scaleY: 540 / 724 },
  { id: 'forest-camp', room: 'forest', to: 'camp', targetId: 'camp-path', name: 'Orc camp gate', background: 'forest-lamps.png',
    crop: { left: 1760, top: 270, width: 142, height: 170 }, aperture: points([[23,16],[120,16],[120,136],[23,136]]), scaleX: 1620 / 2172, scaleY: 540 / 724 },
  { id: 'camp', room: 'camp', to: 'forest', targetId: 'camp-exit', name: 'Orc camp gate · inside', background: 'camp-ambient.png',
    crop: { left: 70, top: 177, width: 118, height: 195 }, aperture: points([[20,15],[106,15],[106,183],[20,183]]), scaleX: 960 / 1182, scaleY: 540 / 664 },
];
export const doorObjectId = (door: ForestDoorLayout) => `${door.room}.door.${door.id}`;
export const doorWorldAperture = (door: ForestDoorLayout) => door.aperture.map(p => ({ x: (door.crop.left + p.x) * door.scaleX, y: (door.crop.top + p.y) * door.scaleY }));

/** Center the walking lane in the OPEN passage, clear of either door leaf. */
export function doorPassageX(door: ForestDoorLayout): number {
  const left = Math.min(...door.aperture.map(point => point.x)), right = Math.max(...door.aperture.map(point => point.x));
  const rectangles = (doorMasks as Record<string, number[][][]>)[door.id]!.at(-1)!;
  const intervals = rectangles.map(([x, , width]) => [x!, x! + width!] as const).sort((a, b) => a[0] - b[0]);
  let cursor = left, start = left, end = left;
  for (const [minimum, maximum] of [...intervals, [right, right]]) {
    if (minimum - cursor > end - start) { start = cursor; end = minimum; }
    cursor = Math.max(cursor, maximum);
  }
  return (door.crop.left + (start + end) / 2) * door.scaleX;
}
