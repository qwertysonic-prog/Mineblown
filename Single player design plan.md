Single Player Mode — AI Opponent
Context
Phases 1-3 are complete. The user wants to add a single-player mode (under the existing "Single Player" menu option) where the computer controls Player 1 (blue, top-left) and the human plays as Player 2 (red, bottom-right, arrow keys).

Implementation
1. State Variables (game.js, near line 351)
singlePlayer = false — toggles AI on/off
aiLastTick = 0 — throttle AI decisions to every ~200ms
aiTarget = null — {x,y} tile the AI is walking toward
aiAction = null — 'reveal' or 'flag' to perform at target
aiMineMemory = [] — tiles deduced as mines via adjacency logic
aiSafeMemory = [] — tiles deduced as safe
aiLastAnalysis = 0 — throttle board analysis to every ~1.5s
2. New Functions (~180 lines, game.js)
startSinglePlayer() — sets singlePlayer = true, resets AI state, calls startGame()

updateAI() — main AI brain, called from game loop before processMovementInput():

Skip if stunned or game not running
Throttle to 200ms ticks (slightly slower than 150ms move cooldown)
Run aiAnalyzeBoard() every 1.5s for mine deduction
If at target → perform action (reveal/flag), pick new target
If no target or stale → aiPickTarget()
Move one step toward target (greedy, prefer axis with greater distance)
Consider attacks independently
aiAnalyzeBoard() — standard Minesweeper single-cell deduction:

Scans revealed numbered tiles, counts hidden/flagged neighbors
If remaining mines = hidden neighbors → all are mines (add to aiMineMemory)
If remaining mines = 0 → all hidden neighbors safe (add to aiSafeMemory)
Never peeks at tile.mine directly — plays fair like a human
aiPickTarget() — priority-based target selection:

Known mines to flag (closest from aiMineMemory)
Known safe tiles to reveal (closest from aiSafeMemory)
Neutral revealed tiles to reclaim (owner=0)
Frontier tiles (hidden, adjacent to revealed) — scored by proximity to AI vs opponent
Any hidden tile (exploration fallback)
aiMoveToward(target) — greedy single-step movement:

Math.sign() for dx/dy, try primary axis first, sidestep if blocked
Uses existing tryMove() — respects cooldowns, collision, bounds
aiPerformAction() — when AI reaches target, call flagTile() or revealTile()

aiConsiderAttack() — independent attack evaluation:

Skip if canAttack() fails or opponent territory < 8 tiles
40% chance to skip each tick (irregular timing)
Precision if opponent nearby (≤6 tiles) and territory ≥15
Random if ≥2 mines stockpiled
manhattanDist(a, b) — utility

3. Integration Points
Game loop (line ~1297): Add if (singlePlayer) updateAI(); before processMovementInput()

Skip P1 keyboard input — wrap P1 actions in keydown handler and processMovementInput() WASD block with if (!singlePlayer)

returnToMenu(): Add singlePlayer = false; to reset

drawGameOverOverlay(): Show "AI" instead of "Player 1" when singlePlayer

updateUI(): Change P1 label to "AI" when singlePlayer

Bottom bar: Hide P1 controls hint in single player, show "You (P2)" hint

4. HTML Changes (index.html)
Replace #menu-single-player "Coming Soon" content with:

Description paragraph ("Play against the computer! You are Player 2...")
"Start Game" button calling startSinglePlayer()
Keep "Back" button
5. Humanization (makes AI beatable)
200ms tick interval (slower than human max of 150ms)
15% chance of 100-300ms hesitation pause after actions
8% chance of picking random frontier tile instead of optimal
Only basic single-cell mine deduction (misses complex patterns)
Hits mines naturally (gets stunned/teleported)
Attack throttling (40% skip, territory thresholds)
No power-up seeking (collects only incidentally on reveal)
Files to Modify
game.js — all AI logic + integration points
index.html — single-player menu panel
Verification
Start single-player → AI moves from top-left, reveals tiles, claims territory
WASD/E/Q/1/2 keys do nothing; arrows/./9/0 work for human P2
AI flags deduced mines, attacks when it has stockpiled mines
AI hits mines occasionally, gets stunned and teleported
Game over shows "AI" vs "Player 2" in overlay
Return to menu → start 2P game → works normally (no AI)