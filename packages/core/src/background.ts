import type { SceneDefinition } from '@scene-designer/core';

/** A scene's authored backdrop. Visibility and locking affect the designer only. */
export type PointleshSceneBackground = {
  assetId: string;
  visible: boolean;
  locked: boolean;
};

export type PointleshSceneWithBackground = SceneDefinition & { pointleshBackground?: PointleshSceneBackground };

export function sceneBackground(scene: SceneDefinition): PointleshSceneBackground | undefined {
  return (scene as PointleshSceneWithBackground).pointleshBackground;
}
