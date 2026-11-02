import { dialogOptionVoiceLineId, type DialogDesignerManifest } from '@dialog-designer/core';
import type { AiAssetDefinition } from '@ai-game-assets/core';

/** Auditioned takes are playable too, provided they match the current choice. */
export function optionRecordingMatches(asset: AiAssetDefinition | undefined, text: string, voiceId: string): boolean {
  const version = asset?.versions[asset.activeVersion];
  const recorded = version?.voiceSettings ?? asset?.voiceSettings;
  return !!version?.file && recorded?.text === text && recorded.voiceAssetId === voiceId;
}

/** Initial game defaults only: explicit designer choices always win. */
export function prepareForestDialogs(manifest: DialogDesignerManifest): void {
  for (const dialog of Object.values(manifest.dialogs)) for (const node of Object.values(dialog.nodes)) {
    if (node.type !== 'decision') continue;
    for (const [index, option] of node.options.entries()) {
      option.exitDialog ??= dialog.id.startsWith('chest-') || index === node.options.length - 1;
      option.spokenByCharacter ??= true;
      option.voiceAssetId ??= 'voice.borin';
      if (option.spokenByCharacter) option.lineAssetId ??= dialogOptionVoiceLineId(dialog.id, node.id, option.id);
    }
  }
}
