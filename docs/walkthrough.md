# The King Under the Mountain — walkthrough

This guide contains the complete solution to the forest demo. Borin must rescue King Aldric from the orc camp, using conversation, supplies from home and a well-timed distraction.

## Controls

Click anywhere to walk to the closest reachable ground, or hold the arrow keys to walk directly. Diagonal input keeps the same speed; walkable boundaries stop your movement. Click a person or object to approach and interact. The **Nearby** buttons below the game perform the same interactions and are keyboard-accessible. **Show hotspots** reveals interactive shapes; Tab toggles it when the page itself has keyboard focus.

Click an inventory item to select it, then click a target to use it. Click a second inventory item to attempt a combination. Click the selected item again or **Put away** to clear the selection. Continue advances speech. The intro and ending are animated sequences that play automatically; **Next scene** advances the current shot, and **Skip** finishes the sequence. **Map** (M), **Journal** (J), and **A little nudge?** provide navigation, collected clues and a context-sensitive hint. Sound is optional.

**Save** and **Load** provide three local browser slots. Save during a conversation, in a cutscene or partway through the puzzle; loading restores that checkpoint, including animation timing and character positions within a cutscene. Saves belong to this browser and site origin.

## The rescue

1. **Watch the introduction**, or choose **Skip introduction**. Orcs ambush Aldric, march him through the forest and imprison him in their eastern camp; Borin sets out to rescue him. Talking to Rowan in the village supplies optional context.

2. **Go to Borin's cottage.** From Bramblehollow, choose **My cottage**. Collect the **Copper coin** on the workbench and the **Climbing rope** by the chest. Return to the village.

3. **Visit The Copper Tankard.** Talk to **Mara the innkeeper** and choose **How do I get past an orc guard?** She explains that a dreamcap mushroom mixed with honey stout makes a sleeping draught. Finish the conversation. Select the copper coin, then interact with Mara to buy **Honey stout**.

4. **Ask Orrin about the mine.** Talk to **Orrin the miner** in the pub and choose **The king needs us. How do I open the chest?** Remember his answer: **Stone remembers.** Finish the conversation and leave the pub.

5. **Collect the dreamcap.** Take the **Forest path** from the village. In the Whispering Wood, pick the violet **Dreamcap mushrooms** on the left. Borin will only collect one after learning about it from Mara. Select the dreamcap and then honey stout in the satchel; they combine into **Dreamcap stout**.

6. **Get the pickaxe.** Enter **Goldroot Mine** from the wood. Interact with the **Runed tool chest** and choose **Stone remembers.** The chest opens and supplies the **Goldroot pickaxe**. If that answer is unavailable, return to Orrin for the clue. Leave the mine and enter the orc camp from the forest.

7. **Put Grub to sleep.** Select **Dreamcap stout**, then use it on the **Stew cauldron** while Grub looks away. The guard status tells you when it is safe. Borin approaches before performing the action, so the guard's state at arrival matters. If Grub is watching, Borin refuses and keeps the brew; dismiss the response and try again. It is easier to approach the cauldron first, then wait for the next safe window. The cycle repeats without a failure limit.

8. **Secure the king's escape.** Once Grub is asleep, use the **Climbing rope** on **King Aldric's cage**. Borin will not break the lock until the king has a safe way down.

9. **Break the lock.** Use the **Goldroot pickaxe** on the cage. Watch Borin break the lock, help Aldric down the rope and escape through the forest to a village reunion. Borin and Aldric return to Bramblehollow.

Inventory and dialogue puzzles can be prepared in different orders. Failed combinations and mistimed cauldron attempts do not consume the required items. The journal records the important clues, and the hint button points to the next unmet requirement.

## See the library features

Open **Designer** to inspect the current room, or visit [the direct designer preview](http://127.0.0.1:5186/?designer=1) to begin in the village editor. Select an area in **Adventure** and use **Edit shape** to open its native vector handles. Drag vertices, double-click an edge to insert a vertex, press Delete to remove the selected vertex, and drag an edge to curve it. The native **Scenes** and **Prefabs** panels provide the existing Scene Designer controls; the **Adventure** panel exposes Pointlesh properties and custom behavior data. Close the scene editor to resume normal interaction.

| Feature | What to try |
| --- | --- |
| Walkable areas | Select **Walkable ground & perspective**, keep **Walkable** enabled, and move its vertices. Close the editor, then walk across the changed area. Borin needs a continuous route to an interaction's approach point. |
| Hotspots and approach | Move a hotspot's polygon, then tune its `approachX` and `approachY` properties. The click target and Borin's standing point are independent. |
| Directional character animations | Select Borin in Adventure. Choose **Idle**, **Walk**, or **Speak**, then assign front/back/left/right asset and animation slots. Use **Flip** to mirror an assignment, or enable eight directions to configure diagonal slots. **Use prefab** restores an inherited slot. |
| Movement linked to animation | Compare linked movement with the property disabled; tune pixels per animation frame and walking speed. Assigned clips use their actual AI Assets frames and timing. Legacy frame count/duration fields appear only when no animations are assigned. |
| Perspective scale | On the same ground area, enable **Character scale** and edit its axis and endpoint multipliers. Walk across the area to see sprite size and movement distance change. |
| Camera zoom | Enable **Camera zoom** on the ground area and edit its axis, endpoint multipliers and camera response. Walk into it to see the camera respond. |
| Walk-behind scenery | Select the foreground Area, enable **Walk-behind**, and edit its polygon and baseline, then move Borin across the baseline. The masked background fragment changes its depth relative to his feet. |
| Extensible prefabs | Add a custom JSON property or behavior ID in Adventure. The manifest retains it; game code registers and dispatches behavior handlers. Unknown behavior IDs have no implementation until a client provides one. |
| Conversations | Open **Dialogs** to inspect the native dialogue trees and line assets. Changes update the demo's authored conversation runtime. |
| Asset references | Open **AI Assets**, then **Graphics → Character Borin**. Its **Animation** dropdown contains real idle, walk and speak sequences for front, back and left views (right mirrors left). Preview or edit a sequence and see the bound character update. The catalog also contains room atlases and dialogue assets. Generated room backgrounds are documented in [art-prompts.md](art-prompts.md). |
| Animated cutscenes | Save midway through the kidnapping, let the action advance and load. The cast resumes at the saved pose and time. Next scene, automatic playback and skipping all return control to the game. |
| Save/load | Save before the guard puzzle, change rooms or consume an item, and load. Inventory, flags, journal, guard timer and presentation checkpoints are restored. |

Some properties intentionally remain hooks for game-specific behavior rather than automatic rules. For example, a client can use custom properties to add keys, quests, permissions or interaction verbs; the library does not interpret arbitrary JSON as executable code.

## Keep designer changes

In a local checkout, run `npm run dev:server` alongside `npm run dev`. AI Assets, Scene Designer and Dialog Designer listen on ports 4287, 4288 and 4289. Use the relevant designer's promotion action to persist its authoring document, or export the scene JSON from Adventure. Hosted/static previews can edit and export, but project-file promotion requires the local authoring service.

Designer manifests are authored content and are separate from saved-game slots. Saved games retain runtime progress; they do not automatically preserve every in-memory editor change. Keep stable content IDs and provide migrations when changing content in ways that invalidate existing saves.

The saved authoring documents live in `demos/forest/public/authoring/`. The demo fetches them at startup, and Vite includes them unchanged in production builds. `demos/forest/src/content.ts` is the seed definition; run the explicit `seed-authoring.ts --reset` script only when you intend to discard promoted edits and restore that seed.
