import type { AiAssetManifest } from '@ai-game-assets/core';
import { dialogOptionVoiceLineId, type DialogDesignerManifest, type DialogElementTarget, type DialogOption } from '@dialog-designer/core';
import type { StoryState } from './story';

type StoryGate = { requiresFlag?: string; hideAfterFlag?: string };

function gate(element: { metadata?: Record<string, unknown> }, conditions: StoryGate) {
  element.metadata = { ...element.metadata, ...conditions };
}

function lineAsset(assets: AiAssetManifest, id: string, voiceId: string, text: string, label: string) {
  assets.assets[id] ??= { id, kind: 'voice-line', prompt: text,
    voiceSettings: { voiceAssetId: voiceId, text }, activeVersion: '', versions: {} };
  const voice = assets.assets[voiceId];
  if (voice?.kind === 'voice') (voice.linkedAnimationAssets ??= {})[id] ??= { assetId: id, label };
  (assets.assetPaths ??= {})[id] ??= ['Voices'];
}

function replaceText(assets: AiAssetManifest, id: string, before: string, after: string) {
  const asset = assets.assets[id];
  if (asset?.voiceSettings?.text === before) asset.voiceSettings.text = after;
  if (asset?.prompt === before) asset.prompt = after;
}

/** Story-specific additions are idempotent so older authored manifests gain the new branches without losing edits. */
export function addForestStoryDialogs(manifest: DialogDesignerManifest, assets: AiAssetManifest): void {
  const addTopic = (dialogId: string, option: DialogOption, voiceId: string, reply: string) => {
    const dialog = manifest.dialogs[dialogId], topics = dialog?.nodes.topics;
    if (!dialog || topics?.type !== 'decision') return;
    const optionVoiceId = dialogOptionVoiceLineId(dialogId, 'topics', option.id);
    if (!topics.options.some(existing => existing.id === option.id)) {
      const goodbye = topics.options.findIndex(existing => existing.id === 'goodbye');
      topics.options.splice(goodbye < 0 ? topics.options.length : goodbye, 0,
        { ...option, exitDialog: false, spokenByCharacter: true, voiceAssetId: 'voice.borin', lineAssetId: optionVoiceId });
    }
    const nodeId = `answer-${option.id}`, assetId = `line.${dialogId}.${option.id}`;
    dialog.nodes[nodeId] ??= { id: nodeId, type: 'block', name: option.text, enabled: false,
      metadata: { ...option.metadata }, lines: [{ id: option.id, enabled: true, voiceAssetId: voiceId, lineAssetId: assetId }] };
    lineAsset(assets, assetId, voiceId, reply, `${dialogId} · ${option.text}`);
    lineAsset(assets, optionVoiceId, 'voice.borin', option.text, `${dialogId} · ${option.text}`);
  };
  const gatedOption = (dialogId: string, id: string, conditions: StoryGate) => {
    const topics = manifest.dialogs[dialogId]?.nodes.topics;
    if (topics?.type !== 'decision') return;
    const option = topics.options.find(candidate => candidate.id === id);
    if (option) gate(option, conditions);
  };
  const clearOldHide = (dialogId: string, id: string, oldFlag: string) => {
    const topics = manifest.dialogs[dialogId]?.nodes.topics;
    if (topics?.type !== 'decision') return;
    const option = topics.options.find(candidate => candidate.id === id);
    if (option?.metadata?.hideAfterFlag !== oldFlag) return;
    delete option.metadata.hideAfterFlag;
    if (!Object.keys(option.metadata).length) delete option.metadata;
  };

  clearOldHide('innkeeper', 'dreamcap', 'knowsDreamcap');
  clearOldHide('innkeeper', 'buy', 'boughtStout');
  const oldMaraQuestion = 'Did Aldric ever come in here?';
  const maraQuestion = 'What was Aldric like on his last visit?';
  addTopic('innkeeper', { id: 'king-tab', text: maraQuestion, enabled: false,
    nextNodeId: 'answer-king-tab', metadata: { requiresFlag: 'boughtStout' } }, 'voice.innkeeper',
    'Same as every visit. He lost at cards with great dignity, paid everyone’s tab, and insisted my stout made him a better player.');
  const maraTopics = manifest.dialogs.innkeeper?.nodes.topics;
  const maraOption = maraTopics?.type === 'decision' ? maraTopics.options.find(option => option.id === 'king-tab') : undefined;
  if (maraOption?.text === oldMaraQuestion) maraOption.text = maraQuestion;
  const maraReply = manifest.dialogs.innkeeper?.nodes['answer-king-tab'];
  if (maraReply?.type === 'block' && maraReply.name === oldMaraQuestion) maraReply.name = maraQuestion;
  replaceText(assets, dialogOptionVoiceLineId('innkeeper', 'topics', 'king-tab'), oldMaraQuestion, maraQuestion);
  replaceText(assets, 'line.innkeeper.king-tab',
    'He used to sit where Orrin sits now and lose at cards with great dignity. He paid every tab, including the ones he did not owe.',
    'Same as every visit. He lost at cards with great dignity, paid everyone’s tab, and insisted my stout made him a better player.');

  gatedOption('miner', 'password', { hideAfterFlag: 'tookPickaxe' });
  const miner = manifest.dialogs.miner;
  const opening = miner?.nodes.opening;
  if (opening?.type === 'block') {
    const original = opening.lines.find(line => line.id === 'greeting');
    if (original) gate(original, { hideAfterFlag: 'chestOpen' });
    for (const [id, text, conditions] of [
      ['chest-open', 'I hear the runes finally had something to say. They do love an audience.', { requiresFlag: 'chestOpen', hideAfterFlag: 'tookPickaxe' }],
      ['pickaxe-taken', 'I see Goldroot let you borrow my best steel. It still knows its way home.', { requiresFlag: 'tookPickaxe' }],
    ] as const) {
      opening.lines.push(...(opening.lines.some(line => line.id === id) ? [] : [{ id, enabled: false,
        voiceAssetId: 'voice.miner', lineAssetId: `line.miner.${id}`, metadata: conditions }]));
      lineAsset(assets, `line.miner.${id}`, 'voice.miner', text, `Orrin · ${id}`);
    }
  }
  const goodbye = miner?.nodes.topics;
  if (goodbye?.type === 'decision') {
    const option = goodbye.options.find(candidate => candidate.id === 'goodbye');
    if (option?.text === 'I will return your pickaxe.') option.text = 'I should get back to the road.';
  }
  replaceText(assets, dialogOptionVoiceLineId('miner', 'topics', 'goodbye'),
    'I will return your pickaxe.', 'I should get back to the road.');
  replaceText(assets, 'line.miner.goodbye', 'Bring the king back first. The pickaxe can wait.',
    'Aye. Bring him home. We can argue about my pickaxe later.');
  const goodbyeReply = miner?.nodes['answer-goodbye'];
  if (goodbyeReply?.type === 'block' && goodbyeReply.name === 'I will return your pickaxe.') goodbyeReply.name = 'I should get back to the road.';
  addTopic('miner', { id: 'pickaxe', text: 'I found your pickaxe.', enabled: false,
    nextNodeId: 'answer-pickaxe', metadata: { requiresFlag: 'tookPickaxe' } }, 'voice.miner',
    'That old thing has had three handles and one name. Bring it back with Aldric; I will call us even.');

  addTopic('elder', { id: 'father', text: 'What was my father like?', enabled: false,
    nextNodeId: 'answer-father', metadata: { requiresFlag: 'askedElderWhy' } }, 'voice.elder',
    'He tried to mend the village clock and made it run backward for a week. He said the extra mornings were a gift.');

  replaceText(assets, 'line.chest-open.guess',
    'THE CHEST REMAINS UNIMPRESSED. Perhaps Orrin at the pub knows the words.',
    'THE MOUNTAIN KNOWS THE WORDS. IT ALSO KNOWS YOU SAID THE WRONG ONES.');
}

/** The static disabled state remains visible in the designer; live story flags enable each branch in play. */
export function forestDialogEnabled(manifest: DialogDesignerManifest, state: Pick<StoryState, 'flags'>,
  target: DialogElementTarget): boolean | undefined {
  const dialog = manifest.dialogs[target.dialogId];
  const node = 'nodeId' in target ? dialog?.nodes[target.nodeId] : undefined;
  const element = target.type === 'dialog' ? dialog : target.type === 'node' ? node
    : target.type === 'line' && node?.type === 'block' ? node.lines.find(line => line.id === target.lineId)
    : target.type === 'option' && node?.type === 'decision' ? node.options.find(option => option.id === target.optionId) : undefined;
  const requiresFlag = element?.metadata?.requiresFlag;
  const hideAfterFlag = element?.metadata?.hideAfterFlag;
  if (typeof requiresFlag !== 'string' && typeof hideAfterFlag !== 'string') return undefined;
  return (typeof requiresFlag !== 'string' || !!state.flags[requiresFlag]) &&
    (typeof hideAfterFlag !== 'string' || !state.flags[hideAfterFlag]);
}
