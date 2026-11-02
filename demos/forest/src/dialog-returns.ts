import type { DialogDesignerManifest } from '@dialog-designer/core';
import type { DialogCheckpoint } from '@pointlesh/core';

/** The password completes the chest puzzle, so it belongs at the end. */
export function prepareForestDialogs(manifest: DialogDesignerManifest): void {
  const topics = manifest.dialogs['chest-open']?.nodes.topics;
  if (topics?.type !== 'decision') return;
  const password = topics.options.find(option => option.id === 'open-chest');
  if (password) topics.options = [...topics.options.filter(option => option !== password), password];
}

/** Game policy: finish the entire reply tree, then return unless the final topic was chosen. */
export function dialogReturnNode(manifest: DialogDesignerManifest, checkpoint: DialogCheckpoint | null): string | undefined {
  if (!checkpoint) return;
  const topics = manifest.dialogs[checkpoint.dialogId]?.nodes.topics;
  if (topics?.type !== 'decision') return;
  const choice = checkpoint.commands.find(command => command.type === 'choose');
  if (choice?.type !== 'choose') return;
  if (topics.options.slice(0, -1).some(option => option.id === choice.optionId)) return topics.id;
}
