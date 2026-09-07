import { DialogRuntime, targetKey, type DialogDesignerManifest, type DialogElementTarget, type DialogRuntimeOptions, type DialogTurn } from '@dialog-designer/core';
import type { AiAssetManifest } from '@ai-game-assets/core';
import { assertJSON } from './types.js';

export type DialogCommand = { type: 'advance' } | { type: 'choose'; optionId: string };
export type DialogEnablementCheck = { target: string; value: boolean | null };
export type DialogCheckpoint = {
  dialogId: string;
  commands: DialogCommand[];
  /** Ordered external enablement results for start, followed by each recorded command. null means no override. */
  enablement?: DialogEnablementCheck[][];
};
type Evaluation = { mode: 'record'; checks: DialogEnablementCheck[] } | { mode: 'replay'; checks: DialogEnablementCheck[]; consumed: number };

/** Restorable conversations. Subscribe to this wrapper, not the replay runtime, for game effects. */
export class AdventureDialog {
  private runtime: DialogRuntime;
  private checkpoint?: DialogCheckpoint;
  private listeners = new Set<(turn: DialogTurn) => void>();
  private evaluation?: Evaluation;
  constructor(private manifest: DialogDesignerManifest, private assets: AiAssetManifest, private options: DialogRuntimeOptions = {}) {
    this.manifest = structuredClone(manifest);
    this.assets = structuredClone(assets);
    this.options = { ...options };
    this.runtime = this.createRuntime();
  }
  onTurn(listener: (turn: DialogTurn) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  current(): DialogTurn | undefined { return this.runtime.current(); }
  start(dialogId: string): DialogTurn {
    const candidate = this.createRuntime();
    const operation = this.evaluateOperation(() => candidate.start(dialogId));
    this.runtime = candidate;
    this.checkpoint = { dialogId, commands: [], enablement: [operation.checks] };
    return this.emit(operation.turn);
  }
  advance(): DialogTurn {
    if (this.runtime.current()?.type !== 'line') throw new Error('Only a dialog line can be advanced');
    const operation = this.evaluateOperation(() => this.runtime.advance());
    this.checkpoint?.commands.push({ type: 'advance' });
    this.checkpoint?.enablement?.push(operation.checks);
    return this.emit(operation.turn);
  }
  choose(optionId: string): DialogTurn {
    if (this.runtime.current()?.type !== 'decision') throw new Error('Only a dialog decision accepts a choice');
    const operation = this.evaluateOperation(() => this.runtime.choose(optionId));
    this.checkpoint?.commands.push({ type: 'choose', optionId });
    this.checkpoint?.enablement?.push(operation.checks);
    return this.emit(operation.turn);
  }
  snapshot(): DialogCheckpoint | null { return this.checkpoint ? structuredClone(this.checkpoint) : null; }
  /** Replay into a candidate before replacing the active conversation; emits no gameplay effects. */
  restore(checkpoint: DialogCheckpoint | null): DialogTurn | undefined {
    const candidate = this.createRuntime();
    let restored: DialogCheckpoint | undefined;
    if (checkpoint !== null) {
      assertJSON(checkpoint);
      if (!checkpoint || typeof checkpoint !== 'object' || typeof checkpoint.dialogId !== 'string' || !Array.isArray(checkpoint.commands) || checkpoint.commands.length > 10000) throw new Error('Invalid dialog checkpoint');
      if (checkpoint.enablement !== undefined) this.validateHistory(checkpoint.enablement, checkpoint.commands.length + 1);
      const enablement = [this.evaluateOperation(() => candidate.start(checkpoint.dialogId), checkpoint.enablement?.[0]).checks];
      for (let index = 0; index < checkpoint.commands.length; index++) {
        const command = checkpoint.commands[index];
        if (!command || typeof command !== 'object') throw new Error('Invalid dialog checkpoint command');
        const operation = () => {
          if (command.type === 'advance' && candidate.current()?.type === 'line') return candidate.advance();
          if (command.type === 'choose' && typeof command.optionId === 'string' && candidate.current()?.type === 'decision') return candidate.choose(command.optionId);
          throw new Error('Dialog checkpoint no longer matches the authored conversation');
        };
        enablement.push(this.evaluateOperation(operation, checkpoint.enablement?.[index + 1]).checks);
      }
      restored = { dialogId: checkpoint.dialogId, commands: structuredClone(checkpoint.commands), enablement };
    }
    this.runtime = candidate;
    this.checkpoint = restored;
    return candidate.current();
  }
  setManifest(manifest: DialogDesignerManifest, assets: AiAssetManifest = this.assets): void {
    const candidate = this.createRuntime(manifest, assets);
    this.manifest = structuredClone(manifest);
    this.assets = structuredClone(assets);
    this.runtime = candidate;
    this.checkpoint = undefined;
  }
  private createRuntime(manifest = this.manifest, assets = this.assets): DialogRuntime {
    return new DialogRuntime(manifest, assets, { ...this.options, isEnabled: target => this.evaluateEnabled(target) });
  }
  private evaluateEnabled(target: DialogElementTarget): boolean | undefined {
    const key = targetKey(target), evaluation = this.evaluation;
    if (evaluation?.mode === 'replay') {
      const check = evaluation.checks[evaluation.consumed++];
      if (!check || check.target !== key) throw new Error('Dialog enablement history no longer matches the authored conversation');
      return check.value === null ? undefined : check.value;
    }
    const value = this.options.isEnabled?.(target);
    if (value !== undefined && typeof value !== 'boolean') throw new Error('Dialog isEnabled must return boolean or undefined');
    if (evaluation?.mode === 'record') evaluation.checks.push({ target: key, value: value ?? null });
    return value;
  }
  private evaluateOperation(operation: () => DialogTurn, replay?: DialogEnablementCheck[]): { turn: DialogTurn; checks: DialogEnablementCheck[] } {
    if (this.evaluation) throw new Error('Dialog enablement predicates may not issue dialog commands');
    const evaluation: Evaluation = replay ? { mode: 'replay', checks: replay, consumed: 0 } : { mode: 'record', checks: [] };
    this.evaluation = evaluation;
    try {
      const turn = operation();
      if (evaluation.mode === 'replay' && evaluation.consumed !== evaluation.checks.length) throw new Error('Dialog enablement history contains unconsumed checks');
      return { turn, checks: structuredClone(evaluation.checks) };
    } finally { this.evaluation = undefined; }
  }
  private validateHistory(history: DialogEnablementCheck[][], operations: number): void {
    if (!Array.isArray(history) || history.length !== operations) throw new Error('Invalid dialog enablement history length');
    let count = 0;
    for (const checks of history) {
      if (!Array.isArray(checks)) throw new Error('Invalid dialog enablement history');
      count += checks.length;
      if (count > 1000000) throw new Error('Dialog enablement history is too large');
      for (const check of checks) {
        if (!check || typeof check !== 'object' || typeof check.target !== 'string' || !check.target ||
          (check.value !== null && typeof check.value !== 'boolean')) throw new Error('Invalid dialog enablement check');
      }
    }
  }
  private emit(turn: DialogTurn): DialogTurn {
    for (const listener of this.listeners) listener(structuredClone(turn));
    return turn;
  }
}
