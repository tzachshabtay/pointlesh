# The King Under the Mountain — walkthrough

This guide contains the complete solution to the forest demo. Borin must rescue King Aldric from the orc camp, using conversation, supplies from home and a well-timed distraction.

## Controls

Click open ground to walk. Click a person or object to approach and interact. The **Nearby** buttons below the game perform the same interactions and are keyboard-accessible. **Show hotspots** reveals interactive shapes; Tab toggles it when the page itself has keyboard focus.

Click an inventory item to select it, then click a target to use it. Click a second inventory item to attempt a combination. Click the selected item again or **Put away** to clear the selection. Continue advances speech and cutscene text. **Map** (M), **Journal** (J), and **A little nudge?** provide navigation, collected clues and a context-sensitive hint. Sound is optional.

**Save** and **Load** provide three local browser slots. Save during a conversation, in a cutscene or partway through the puzzle; loading restores that checkpoint. Saves belong to this browser and site origin.

## The rescue

1. **Watch the introduction**, or choose **Skip introduction**. Elder Rowan explains that orcs took Aldric east. Talking to Rowan in the village supplies optional context.

2. **Go to Borin's cottage.** From Bramblehollow, choose **My cottage**. Collect the **Copper coin** on the workbench and the **Climbing rope** by the chest. Return to the village.

3. **Visit The Copper Tankard.** Talk to **Mara the innkeeper** and choose **How do I get past an orc guard?** She explains that a dreamcap mushroom mixed with honey stout makes a sleeping draught. Finish the conversation. Select the copper coin, then interact with Mara to buy **Honey stout**.

4. **Ask Orrin about the mine.** Talk to **Orrin the miner** in the pub and choose **The king needs us. How do I open the chest?** Remember his answer: **Stone remembers.** Finish the conversation and leave the pub.

5. **Collect the dreamcap.** Take the **Forest path** from the village. In the Whispering Wood, pick the violet **Dreamcap mushrooms** on the left. Borin will only collect one after learning about it from Mara. Select the dreamcap and then honey stout in the satchel; they combine into **Dreamcap stout**.

6. **Get the pickaxe.** Enter **Goldroot Mine** from the wood. Interact with the **Runed tool chest** and choose **Stone remembers.** The chest opens and supplies the **Goldroot pickaxe**. If that answer is unavailable, return to Orrin for the clue. Leave the mine and enter the orc camp from the forest.

7. **Put Grub to sleep.** Select **Dreamcap stout**, then use it on the **Stew cauldron** while Grub looks away. The guard status tells you when it is safe. Borin approaches before performing the action, so the guard's state at arrival matters. If Grub is watching, Borin refuses and keeps the brew; dismiss the response and try again. It is easier to approach the cauldron first, then wait for the next safe window. The cycle repeats without a failure limit.

8. **Secure the king's escape.** Once Grub is asleep, use the **Climbing rope** on **King Aldric's cage**. Borin will not break the lock until the king has a safe way down.

9. **Break the lock.** Use the **Goldroot pickaxe** on the cage. Continue through the rescue ending. Borin and Aldric return to Bramblehollow.

Inventory and dialogue puzzles can be prepared in different orders. Failed combinations and mistimed cauldron attempts do not consume the required items. The journal records the important clues, and the hint button points to the next unmet requirement.

## See the library features

Open **Designer** to inspect the current room. The native **Scenes** and **Prefabs** panels provide the existing Scene Designer controls; the **Adventure** panel exposes Pointlesh properties and custom behavior data. Close the scene editor to resume normal interaction.

| Feature | What to try |
| --- | --- |
| Walkable areas | Select the room's walkable prefab and move its vertices. Close the editor, then walk across the changed area. Borin needs a continuous route to an interaction's approach point. |
| Hotspots and approach | Move a hotspot's polygon, then tune its `approachX` and `approachY` properties. The click target and Borin's standing point are independent. |
| Movement linked to animation | Select the player character prefab. Compare linked movement with the property disabled; tune `walkStep`, `frameDurationMs`, `frameCount` and `speed`. |
| Perspective scale | Edit a scale area's shape and endpoint multipliers. Walk across the area to see sprite size and movement distance change. |
| Camera zoom | Edit a zoom area and its endpoint multipliers/smoothing. Walk into it to see the camera respond. |
| Walk-behind scenery | Edit a walk-behind polygon and baseline, then move Borin across the baseline. The masked background fragment changes its depth relative to his feet. |
| Extensible prefabs | Add a custom JSON property or behavior ID in Adventure. The manifest retains it; game code registers and dispatches behavior handlers. Unknown behavior IDs have no implementation until a client provides one. |
| Conversations | Open **Dialogs** to inspect the native dialogue trees and line assets. Changes update the demo's authored conversation runtime. |
| Asset references | Open **AI Assets** to inspect the catalog containing room atlases, characters and dialogue assets. Generated room backgrounds are documented in [art-prompts.md](art-prompts.md). |
| Save/load | Save before the guard puzzle, change rooms or consume an item, and load. Inventory, flags, journal, guard timer and presentation checkpoints are restored. |

Some properties intentionally remain hooks for game-specific behavior rather than automatic rules. For example, a client can use custom properties to add keys, quests, permissions or interaction verbs; the library does not interpret arbitrary JSON as executable code.

## Keep designer changes

In a local checkout, run `npm run dev:server` alongside `npm run dev`. AI Assets, Scene Designer and Dialog Designer listen on ports 4287, 4288 and 4289. Use the relevant designer's promotion action to persist its authoring document, or export the scene JSON from Adventure. Hosted/static previews can edit and export, but project-file promotion requires the local authoring service.

Designer manifests are authored content and are separate from saved-game slots. Saved games retain runtime progress; they do not automatically preserve every in-memory editor change. Keep stable content IDs and provide migrations when changing content in ways that invalidate existing saves.

The saved authoring documents live in `demos/forest/public/authoring/`. The demo fetches them at startup, and Vite includes them unchanged in production builds. `demos/forest/src/content.ts` is the seed definition; run the explicit `seed-authoring.ts --reset` script only when you intend to discard promoted edits and restore that seed.
