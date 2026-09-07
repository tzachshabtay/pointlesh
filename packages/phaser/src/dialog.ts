import type { AiAssetManifest } from "@ai-game-assets/core";
import { dialogAudioKey } from "@dialog-designer/phaser";
import type { DialogLineTurn } from "@dialog-designer/core";
import type { AdventureDialog, CharacterController } from "@pointlesh/core";
import type Phaser from "phaser";

export type PhaserAdventureDialogOptions = {
  /** Map native dialog voice asset ids to Pointlesh actors, or resolve them in speaker(). */
  speakers?: Record<string, CharacterController>;
  speaker?: (turn: DialogLineTurn) => CharacterController | undefined;
  /** Supply the manifest to honor ai-assets target variants for audio keys. */
  aiAssets?: AiAssetManifest;
  targetId?: string;
  audio?: boolean;
  /** Default true: a line stays in speaking state until the game advances the dialog. */
  waitForAdvance?: boolean;
  durationMs?: (turn: DialogLineTurn) => number;
};

/** Connect native dialog turns to Pointlesh speech state and optional generated voice audio. */
export class PhaserAdventureDialog {
  private readonly unsubscribe: () => void;
  private actor?: CharacterController;
  private sound?: Phaser.Sound.BaseSound;
  private destroyed = false;
  constructor(readonly scene: Phaser.Scene, readonly dialog: AdventureDialog, readonly options: PhaserAdventureDialogOptions = {}) {
    this.unsubscribe = dialog.onTurn(turn => this.sync(turn));
    scene.events.once("shutdown", this.destroy, this);
  }

  /** Also call after restoring a saved dialog; restoration deliberately emits no game events. */
  sync(turn = this.dialog.current()): void {
    if (this.destroyed) return;
    this.clear();
    if (turn?.type !== "line") return;
    this.actor = this.options.speaker?.(turn) ?? this.options.speakers?.[turn.line.voiceAssetId];
    const duration = this.options.durationMs?.(turn) ?? (this.options.waitForAdvance !== false ? Number.MAX_SAFE_INTEGER : Math.max(1400, turn.resolved.text.length * 45));
    void this.actor?.say(turn.resolved.text, duration);
    const key = dialogAudioKey(turn.line.lineAssetId, this.options.aiAssets ? { aiAssets: this.options.aiAssets, targetId: this.options.targetId } : undefined);
    if (this.options.audio !== false && turn.resolved.audio && this.scene.cache.audio.exists(key)) {
      this.sound = this.scene.sound.add(key);
      this.sound.play();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.scene.events.off("shutdown", this.destroy, this);
    this.clear();
  }
  private clear(): void {
    this.actor?.finishSpeech();
    this.actor = undefined;
    this.sound?.stop();
    this.sound?.destroy();
    this.sound = undefined;
  }
}

export { PhaserDialogRuntime, installPhaserDialogDesigner, loadDialogAudioAssets, dialogAudioKey } from "@dialog-designer/phaser";
