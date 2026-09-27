// Native artwork coordinates. Pane rectangles exclude the original metal bars.
export const lampRooms = {
  village: { asset: 'background.village-pub', source: 'atlas-village-pub.png', output: 'atlas-village-pub-lamps.png', width: 1182, height: 1330, worldWidth: 960, worldHeight: 540, roomHeight: 664, lamps: [
    { id: 'tavern', name: 'Tavern sign lantern', crop: [330, 300, 65, 74], panes: [[351, 325, 13, 27], [368, 326, 12, 26]], radius: [105, 110] },
  ] },
  pub: { asset: 'background.pub', source: 'pub-unlit.png', output: 'pub-lamps.png', width: 1182, height: 664, worldWidth: 960, worldHeight: 540, roomHeight: 664, lamps: [
    { id: 'left-wall', name: 'Left wall lantern', crop: [8, 100, 65, 80], panes: [[24, 132, 16, 27], [46, 137, 10, 22]], radius: [90, 100] },
    { id: 'bar', name: 'Hanging bar lantern', crop: [87, 90, 70, 85], panes: [[100, 119, 5, 32], [109, 118, 22, 33], [136, 120, 9, 31]], radius: [125, 120] },
    { id: 'barrels', name: 'Barrel lantern', crop: [308, 127, 50, 60], panes: [[320, 150, 12, 20], [335, 151, 11, 20]], radius: [90, 105] },
    { id: 'back-door', name: 'Back door lantern', crop: [431, 142, 59, 64], panes: [[448, 168, 10, 20], [461, 167, 11, 22]], radius: [95, 105] },
    { id: 'entrance', name: 'Entrance lantern', crop: [880, 142, 66, 70], panes: [[898, 168, 15, 26], [917, 169, 10, 24]], radius: [110, 120] },
  ] },
  house: { asset: 'background.house', source: 'house-unlit.png', output: 'house-lamps.png', width: 1182, height: 664, worldWidth: 960, worldHeight: 540, roomHeight: 664, lamps: [
    { id: 'bed', name: 'Bedside lantern', crop: [12, 222, 67, 80], panes: [[28, 247, 9, 15], [41, 247, 12, 16], [56, 247, 7, 16], [28, 266, 9, 21], [41, 267, 12, 19], [56, 267, 7, 17]], radius: [95, 115] },
    { id: 'workbench', name: 'Workbench lantern', crop: [597, 116, 49, 66], panes: [[614, 140, 15, 9], [614, 153, 15, 10]], radius: [110, 115] },
    { id: 'door', name: 'Cottage door lantern', crop: [962, 159, 58, 74], panes: [[975, 184, 6, 11], [985, 184, 9, 11], [998, 185, 5, 10], [975, 199, 6, 12], [985, 199, 9, 15], [998, 199, 5, 12]], radius: [100, 115] },
  ] },
  mine: { asset: 'background.mine-camp', source: 'atlas-mine-camp.png', output: 'atlas-mine-camp-lamps.png', width: 1182, height: 1330, worldWidth: 960, worldHeight: 540, roomHeight: 664, lamps: [
    { id: 'entrance', name: 'Mine entrance lantern', crop: [274, 182, 49, 60], panes: [[286, 207, 3, 16], [292, 206, 10, 17], [306, 210, 3, 13]], radius: [100, 115] },
    { id: 'winch', name: 'Winch lantern', crop: [625, 145, 57, 60], panes: [[640, 171, 4, 18], [647, 171, 10, 18], [662, 174, 3, 15]], radius: [125, 145] },
    { id: 'tunnel', name: 'Distant tunnel lantern', crop: [898, 220, 37, 45], panes: [[912, 242, 7, 9]], radius: [38, 48] },
  ] },
  forest: { asset: 'background.forest-wide', source: 'forest-wide.png', output: 'forest-lamps.png', width: 2172, height: 724, worldWidth: 1620, worldHeight: 540, roomHeight: 724, lamps: [
    { id: 'mine', name: 'Mine doorway lantern', crop: [264, 310, 45, 61], panes: [[281, 335, 6, 16], [290, 332, 10, 25], [303, 338, 3, 14]], radius: [80, 95] },
    { id: 'gate-left', name: 'Left gate lantern', crop: [1753, 287, 40, 60], panes: [[1765, 314, 8, 18]], radius: [45, 65] },
    { id: 'gate-right', name: 'Right gate lantern', crop: [1885, 285, 40, 60], panes: [[1897, 312, 8, 20]], radius: [45, 65] },
    { id: 'gate-torch', name: 'Distant gate torch', crop: [1781, 224, 40, 47], panes: [[1793, 237, 10, 24]], radius: [50, 65], exposed: true },
  ] },
} as const;

export function lampBounds(panes: readonly (readonly number[])[]) {
  const x = Math.min(...panes.map(pane => pane[0]!)), y = Math.min(...panes.map(pane => pane[1]!));
  return { x, y, width: Math.max(...panes.map(pane => pane[0]! + pane[2]!)) - x, height: Math.max(...panes.map(pane => pane[1]! + pane[3]!)) - y };
}

export const lampBrightness = [.89, .965, 1, .94, .865, .985, .925, .905];
export const torchBrightness = [.68, .87, 1, .76, .58, .95, .82, .67];
