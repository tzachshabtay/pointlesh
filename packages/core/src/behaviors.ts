import { assertJSON, type JSONObject, type JSONValue } from './types.js';

/** Only these IDs/properties go into prefab documents and saves; executable callbacks stay in code. */
export interface BehaviorBinding { id: string; properties?: JSONObject }
export interface BehaviorEvent { type: string; payload?: JSONValue }
export interface BehaviorDefinition<TContext> {
  /** Optional property validation used before dispatch. */
  validate?: (properties: JSONObject) => void;
  handle: (context: TContext, event: BehaviorEvent, properties: JSONObject) => void | Promise<void>;
}

/** A small, typed integration seam for client-specific behavior, not a scripting language. */
export class BehaviorRegistry<TContext = unknown> {
  private readonly definitions = new Map<string, BehaviorDefinition<TContext>>();

  register(id: string, definition: BehaviorDefinition<TContext>): this {
    if (!id.trim() || this.definitions.has(id)) throw new Error(`Behavior ID is empty or already registered: ${id}`);
    if (typeof definition.handle !== 'function') throw new Error('Behavior must define a handler');
    this.definitions.set(id, definition);
    return this;
  }

  has(id: string): boolean { return this.definitions.has(id); }
  unregister(id: string): boolean { return this.definitions.delete(id); }
  ids(): string[] { return [...this.definitions.keys()]; }

  validate(bindings: readonly (string | BehaviorBinding)[]): void {
    for (const binding of bindings) {
      const id = typeof binding === 'string' ? binding : binding.id;
      const definition = this.definitions.get(id);
      if (!definition) throw new Error(`Unknown behavior: ${id}`);
      const properties = typeof binding === 'string' ? {} : binding.properties ?? {};
      assertJSON(properties);
      definition.validate?.(properties);
    }
  }

  /** Validate every binding before running any handler; order is the declared prefab order. */
  async dispatch(bindings: readonly (string | BehaviorBinding)[], event: BehaviorEvent, context: TContext): Promise<void> {
    if (!event.type) throw new Error('Behavior event needs a type');
    if (event.payload !== undefined) assertJSON(event.payload);
    this.validate(bindings);
    for (const binding of bindings) {
      const id = typeof binding === 'string' ? binding : binding.id;
      await this.definitions.get(id)!.handle(context, event, typeof binding === 'string' ? {} : binding.properties ?? {});
    }
  }
}
