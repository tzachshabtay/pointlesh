# Animation sound cues

In the asset designer, open the linked animation and move the named tag to the frame
where its sound should begin. Keep one occurrence of each cue tag per clip. Frame
holds are respected, and selected previews use their own tags before promotion.
Removing a cue tag silences that animation cue.

| Animation | Tag | Sound |
| --- | --- | --- |
| Room doors · Close, cage door · Close | `shut` | Door shut / cage shut |
| Room doors · Open | `open` | Door opening |
| Grub · Drink | `slurp` | Soup slurp |
| Grub · Collapse | `fall` | Body landing |
| Orrin · Idle front | `slurp` | Beer sip |
| Borin · Pour back | `pour` | Stout pouring |
| Borin · Tie rope back | `tie` | Rope tying |
| Borin · Pickaxe back | `strike` | Lock breaking |
| Tool chest · Open | `glow` | Glowing chest opening |
| Journal quill · Write | `write` | Quill writing |

The cage is under Graphics → Objects → Doors. Its Close clip reuses the opening
sheet in reverse playback order, with independent frame timings and tags.

All seven room-door assets are used. The tavern's doors stay open, but their open
poses are still the rendered doorway graphics. Their close clips remain available
if the designer's always-open property is turned off.

Inventory pickup, coin payment, and mushroom mixing sounds are triggered by their
actions; those actions have no character animation frames to tag. Footsteps remain
linked to walking cadence.
