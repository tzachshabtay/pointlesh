import { assertJSON, cloneJSON, type JSONValue } from './types.js';

export interface CutsceneStep {
  id: string;
  speaker?: string;
  text?: string;
  /** Omit for player-advanced steps. */
  durationMs?: number;
  payload?: JSONValue;
}
export interface CutsceneDefinition { id: string; version: number; steps: CutsceneStep[] }
export interface CutsceneCheckpoint { cutsceneId: string; version: number; stepIndex: number; elapsedMs: number }
export interface CutsceneRunnerOptions {
  /** Apply each step's final effects here; invoked once for both watched and skipped steps. */
  onCompleteStep?: (step: CutsceneStep, event: { skipped: boolean }) => void;
}

/** Player-advanced or timed cutscenes. JSON checkpoints restore presentation without replaying effects. */
export class CutsceneRunner {
  private readonly sourceDefinition: CutsceneDefinition;
  private checkpoint: CutsceneCheckpoint;
  private completing = false;

  constructor(definition: CutsceneDefinition, private readonly options: CutsceneRunnerOptions = {}) {
    assertJSON(definition);
    if (!definition.id || !Number.isSafeInteger(definition.version) || definition.version < 1 || !Array.isArray(definition.steps)) throw new Error('Invalid cutscene definition');
    if (new Set(definition.steps.map(step => step.id)).size !== definition.steps.length) throw new Error('Cutscene step IDs must be unique');
    for (const step of definition.steps) {
      if (!step.id || (step.durationMs !== undefined && (!Number.isFinite(step.durationMs) || step.durationMs <= 0))) throw new Error('Cutscene steps need IDs and positive optional durations');
    }
    this.sourceDefinition = cloneJSON(definition);
    this.checkpoint = { cutsceneId: definition.id, version: definition.version, stepIndex: 0, elapsedMs: 0 };
  }

  get definition(): CutsceneDefinition { return cloneJSON(this.sourceDefinition); }
  get completed(): boolean { return this.checkpoint.stepIndex === this.sourceDefinition.steps.length; }
  current(): CutsceneStep | null { const step = this.sourceDefinition.steps[this.checkpoint.stepIndex]; return step ? cloneJSON(step) : null; }

  advance(): CutsceneStep | null {
    this.completeStep(false);
    return this.current();
  }

  tick(dtMs: number): CutsceneStep | null {
    if (!Number.isFinite(dtMs) || dtMs < 0) throw new Error('Cutscene tick needs finite nonnegative milliseconds');
    while (!this.completed && dtMs > 0) {
      const step = this.sourceDefinition.steps[this.checkpoint.stepIndex]!;
      if (step.durationMs === undefined) break;
      const remaining = step.durationMs - this.checkpoint.elapsedMs;
      if (dtMs < remaining) { this.checkpoint.elapsedMs += dtMs; break; }
      dtMs -= remaining;
      this.completeStep(false);
    }
    return this.current();
  }

  /** Complete remaining steps in order, applying the same final effects as normal playback. */
  skip(): void { while (!this.completed) this.completeStep(true); }

  snapshot(): CutsceneCheckpoint { return { ...this.checkpoint }; }

  restore(checkpoint: CutsceneCheckpoint): CutsceneStep | null {
    if (this.completing) throw new Error('Cannot restore during a cutscene completion callback');
    assertJSON(checkpoint);
    if (!checkpoint || checkpoint.cutsceneId !== this.sourceDefinition.id || checkpoint.version !== this.sourceDefinition.version ||
      !Number.isInteger(checkpoint.stepIndex) || checkpoint.stepIndex < 0 || checkpoint.stepIndex > this.sourceDefinition.steps.length ||
      !Number.isFinite(checkpoint.elapsedMs) || checkpoint.elapsedMs < 0) throw new Error('Invalid or incompatible cutscene checkpoint');
    const step = this.sourceDefinition.steps[checkpoint.stepIndex];
    if ((step?.durationMs === undefined && checkpoint.elapsedMs !== 0) || (step?.durationMs !== undefined && checkpoint.elapsedMs >= step.durationMs)) throw new Error('Cutscene elapsed time is outside the current step');
    this.checkpoint = cloneJSON(checkpoint);
    return this.current();
  }

  private completeStep(skipped: boolean): void {
    if (this.completing) throw new Error('Cutscene completion callbacks may not advance the runner');
    if (this.completed) return;
    const step = this.sourceDefinition.steps[this.checkpoint.stepIndex]!;
    this.completing = true;
    try {
      this.options.onCompleteStep?.(cloneJSON(step), { skipped });
      this.checkpoint.stepIndex++;
      this.checkpoint.elapsedMs = 0;
    } finally { this.completing = false; }
  }
}
