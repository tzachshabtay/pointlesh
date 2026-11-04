const libraries = {
  pointlesh: { label: 'Pointlesh', url: 'https://github.com/tzachshabtay/pointlesh' },
  'ai-assets': { label: 'AI Assets', url: 'https://github.com/tzachshabtay/ai-assets' },
  'scene-designer': { label: 'Scene Designer', url: 'https://github.com/tzachshabtay/scene-designer' },
  'dialog-designer': { label: 'Dialog Designer', url: 'https://github.com/tzachshabtay/dialog-designer' },
};

const features = [
  { category: 'pointlesh', title: 'Walkable worlds', text: 'Click to walk, use the arrow keys, and find the nearest reachable point when the ground beneath a click is off-limits.', image: 'scene', alt: 'The Scene Designer displays walkable polygons and the character in Bramblehollow.', tag: 'Navigation', featured: true },
  { category: 'pointlesh', title: 'Characters with direction', text: 'Front, back, side and optional diagonal animation sets support facing, idle, walking and speech. Movement can follow animation frames.', image: 'assets', alt: 'Borin’s walk animation frames open in the asset editor.', thumbnail: 'village-background', thumbnailAlt: 'Borin walking back and forth across Bramblehollow using the real eight-frame sprite animation.', animated: true, tag: 'Characters', featured: true },
  { category: 'pointlesh', title: 'Areas with a purpose', text: 'One vector area can govern walking, perspective scale, camera zoom or walk-behind depth, each enabled and edited independently.', image: 'scene', alt: 'Editable polygons and character controls in the village scene.', tag: 'World' },
  { category: 'pointlesh', title: 'Things you can interact with', text: 'Characters and objects can be clickable themselves, with optional approach points and solid footprints for walking around them.', image: 'village', alt: 'Borin and Elder Rowan stand in the interactive dwarf village.', tag: 'Interactions' },
  { category: 'pointlesh', title: 'An interaction atlas', text: 'See verbs and inventory items against every interactive target in one matrix. Add code, simple hero speech, or defaults, then work through cells in a marathon.', image: 'matrix', alt: 'The interaction matrix shows characters, hotspots and item actions.', tag: 'Authoring', featured: true },
  { category: 'pointlesh', title: 'Inventory that feels tactile', text: 'Inventory items become animated cursors with editable interaction points. Pickups, combinations and use-on-target moments have room for game-specific behavior.', image: 'inventory', alt: 'An inventory item is selected as a cursor in the demo.', tag: 'Inventory' },
  { category: 'pointlesh', title: 'Room transitions and points', text: 'Named draggable points define where characters arrive, leave and approach. The demo uses them for distinct forest paths and doorway crossings.', image: 'doorway', alt: 'Borin crosses the open cottage doorway into Bramblehollow.', tag: 'Scenes' },
  { category: 'pointlesh', title: 'Animated cutscenes', text: 'Stage character actions and dialogue in the same world, preserve progress in saves, and crossfade into the playable adventure.', image: 'forest', alt: 'Orcs lead the king through the forest during an animated cutscene.', tag: 'Story' },
  { category: 'pointlesh', title: 'Saves you can trust', text: 'Versioned, validated saves restore inventory, characters, conversation and cutscene checkpoints. The demo adds screenshot previews to its slots.', image: 'save', alt: 'The demo’s load menu shows a saved game with a screenshot.', tag: 'Persistence' },
  { category: 'pointlesh', title: 'Sound in the moment', text: 'Music, voices and sound effects have separate controls. Animation-frame tags let game code cue sounds at the exact action.', image: 'chest', alt: 'The runed chest opens as part of an animated, sound-timed scene.', tag: 'Audio' },
  { category: 'pointlesh', title: 'Light, depth and atmosphere', text: 'Characters respond to scene lighting, foreground shapes occlude them, and the forest gains life from subtle environmental motion.', image: 'camp', alt: 'Borin peeks into the firelit orc encampment.', tag: 'Presentation' },
  { category: 'ai-assets', title: 'Generate, compare, choose', text: 'The AI Assets designer keeps generated candidates and versions together so a creator can compare, select and promote the one that fits.', image: 'assets', alt: 'The AI Asset Designer displays Borin’s current walking animation.', tag: 'Asset workflow', featured: true },
  { category: 'ai-assets', title: 'Animation frame editing', text: 'Inspect a sheet as individual frames, tune timing and offsets, add action tags, and touch up art without leaving the designer.', image: 'assets', alt: 'Individual Borin walk frames and timing controls in the asset editor.', tag: 'Animation' },
  { category: 'ai-assets', title: 'Scaled variants', text: 'Keep source art and alternate sizes in one asset. Pointlesh chooses the closest variant before display scaling.', image: 'assets', alt: 'Scaled variants are available beside the selected animation in AI Assets.', tag: 'Image sizes' },
  { category: 'ai-assets', title: 'Voices and line takes', text: 'Create or record lines, keep alternate takes and select a favorite. The same asset catalog connects text, audio and portrait lip sync.', image: 'dialog', alt: 'Mara’s spoken line appears beside her portrait in the game.', tag: 'Voice' },
  { category: 'scene-designer', title: 'Draw the playable ground', text: 'Edit native vector polygons directly on the scene canvas, including curved edges and vertices, while the game remains visible.', image: 'scene', alt: 'The scene canvas displays editable walkable shapes over Bramblehollow.', tag: 'Vector areas', featured: true },
  { category: 'scene-designer', title: 'Reusable, extensible prefabs', text: 'Characters and objects have dedicated prefabs with inheritable properties and behaviors; scene instances override only what differs.', image: 'scene', alt: 'The prefab inspector shows Borin’s inherited movement properties.', tag: 'Prefabs' },
  { category: 'scene-designer', title: 'Move and inspect live', text: 'Drag actors, objects and points on the canvas; inspect their properties and see the running scene respond as you edit.', image: 'scene', alt: 'A selected character and its editable settings in the scene designer.', tag: 'Live editing' },
  { category: 'dialog-designer', title: 'Branching conversations', text: 'Build dialogue choices and reply trees. Configure whether each option returns to the conversation or ends it.', image: 'dialog', alt: 'Mara the innkeeper speaks to Borin in the tavern.', tag: 'Dialogue', featured: true },
  { category: 'dialog-designer', title: 'Spoken options', text: 'Mark a choice as spoken by the character and its text joins the voice-line workflow, rather than becoming a disconnected label.', image: 'dialog', alt: 'A speaking portrait and text line during a tavern conversation.', tag: 'Voice linkage' },
  { category: 'dialog-designer', title: 'Portraits and lip sync', text: 'Dialogue uses close-up animated portraits with blinking and automatic text- or voice-based lip sync for the speaking character.', image: 'dialog', alt: 'Mara’s animated speaking portrait above her dialogue box.', tag: 'Portraits' },
];

const grid = document.querySelector('#feature-grid');
const summary = document.querySelector('#filter-summary');
const filters = [...document.querySelectorAll('.feature-filter')];
const mediaDialog = document.querySelector('#media-dialog');
const dialogImage = mediaDialog.querySelector('img');
const dialogCaption = mediaDialog.querySelector('p');

function featureCard(feature) {
  const library = libraries[feature.category];
  const card = document.createElement('article');
  card.className = 'feature-card';

  const picture = document.createElement('button');
  picture.className = 'feature-picture';
  picture.type = 'button';
  picture.setAttribute('aria-label', `Enlarge screenshot: ${feature.title}`);
  const img = document.createElement('img');
  img.src = `media/${feature.thumbnail ?? feature.image}.jpg`;
  img.alt = feature.thumbnailAlt ?? feature.alt;
  img.loading = 'lazy';
  picture.append(img);
  if (feature.animated) {
    const sprite = document.createElement('span');
    sprite.className = 'walking-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    picture.append(sprite);
  }
  const expand = document.createElement('span');
  expand.className = 'picture-expand';
  expand.setAttribute('aria-hidden', 'true');
  expand.textContent = '↗';
  picture.append(expand);
  picture.addEventListener('click', () => {
    dialogImage.src = `media/${feature.image}.jpg`;
    dialogImage.alt = feature.alt;
    dialogCaption.textContent = `${feature.title} · ${library.label}`;
    mediaDialog.showModal();
  });

  const body = document.createElement('div');
  body.className = 'feature-body';
  const meta = document.createElement('div');
  meta.className = 'feature-meta';
  const tag = document.createElement('span');
  tag.textContent = feature.tag;
  const credit = document.createElement('a');
  credit.href = library.url;
  credit.textContent = library.label;
  meta.append(tag, credit);
  const title = document.createElement('h3');
  title.textContent = feature.title;
  const text = document.createElement('p');
  text.textContent = feature.text;
  body.append(meta, title, text);
  card.append(picture, body);
  return card;
}

function showFeatures(category) {
  const visible = category === 'all' ? features : features.filter((feature) => category === 'highlights' ? feature.featured : feature.category === category);
  grid.replaceChildren(...visible.map(featureCard));
  summary.textContent = category === 'all' ? `All ${visible.length} features` : category === 'highlights' ? `${visible.length} highlights from the suite` : `${visible.length} ${libraries[category].label} features`;
  filters.forEach((filter) => {
    const active = filter.dataset.filter === category;
    filter.classList.toggle('is-active', active);
    filter.setAttribute('aria-pressed', String(active));
  });
}

filters.forEach((filter) => filter.addEventListener('click', () => showFeatures(filter.dataset.filter)));
mediaDialog.querySelector('.dialog-close').addEventListener('click', () => mediaDialog.close());
mediaDialog.addEventListener('click', (event) => { if (event.target === mediaDialog) mediaDialog.close(); });
showFeatures('highlights');
