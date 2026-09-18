import type { MoveFacts } from "../game/analysis.ts";
import type { Dir, GameState } from "../game/engine.ts";

export const LEGEND =
  "H = snake head, o = snake body, T = snake tail, F = food, . = empty. " +
  "Row 0 is the top row, column 0 is the leftmost column. Leaving the grid hits a wall.";

export function renderBoard(state: GameState): string[] {
  const grid = Array.from({ length: state.rows }, () => Array<string>(state.cols).fill("."));
  if (state.food) grid[state.food.r][state.food.c] = "F";
  state.snake.forEach((p, i) => {
    grid[p.r][p.c] = i === 0 ? "H" : i === state.snake.length - 1 ? "T" : "o";
  });
  return grid.map((row) => row.join(""));
}

const TURN_LABEL = {
  straight: "直行",
  "left turn": "左转",
  "right turn": "右转",
} as const;

export function describeMove(f: MoveFacts): string {
  const parts = [
    `${TURN_LABEL[f.turn]}，头移到第 ${f.target.r} 行第 ${f.target.c} 列`,
    f.eats ? "现在吃到食物" : `走完后距食物还有 ${f.foodDistance ?? "?"} 步`,
    `${f.freeTotal} 个空格中仍有 ${f.reachable} 个可达`,
  ];
  if (f.deadEnd) parts.push("死胡同：空间小于蛇长，且追不上自己的尾巴");
  else if (f.canReachTail) parts.push("还能顺着尾巴绕出去");
  return parts.join("；");
}

const RULES =
  "You are playing the game Snake. Choose the direction the snake's head moves on the next step. " +
  "Every listed direction is safe for this single step; the facts next to each direction were computed by code and are exact. " +
  "A move marked DEAD END almost always loses the game a few steps later. " +
  "The snake grows by one when it eats the food, and the game ends when the head hits a wall or its own body.";

export interface LlmRequest {
  state: {
    board: string[];
    legend: string;
    head: { row: number; col: number };
    food: { row: number; col: number } | null;
    heading: Dir;
    snakeLength: number;
    gridSize: { rows: number; cols: number };
    foodIsAdjacent: boolean;
  };
  instructions: string;
  criteria: Partial<Record<Dir, string>>;
}

export function buildRequest(game: GameState, facts: MoveFacts[], strategy: string): LlmRequest {
  const head = game.snake[0];
  const criteria: Partial<Record<Dir, string>> = {};
  for (const f of facts) criteria[f.dir] = describeMove(f);
  return {
    state: {
      board: renderBoard(game),
      legend: LEGEND,
      head: { row: head.r, col: head.c },
      food: game.food ? { row: game.food.r, col: game.food.c } : null,
      heading: game.heading,
      snakeLength: game.snake.length,
      gridSize: { rows: game.rows, cols: game.cols },
      foodIsAdjacent: facts.some((f) => f.eats),
    },
    instructions: `${RULES} Player strategy: ${strategy.trim() || "活下去并吃食物。"}`,
    criteria,
  };
}

export function toChatMessages(request: LlmRequest): { role: "system" | "user"; content: string }[] {
  const legal = Object.keys(request.criteria);
  const facts = legal.map((dir) => `- ${dir}: ${request.criteria[dir as Dir]}`).join("\n");
  const s = request.state;
  const user = [
    `Board (${s.gridSize.rows}x${s.gridSize.cols}):`,
    ...s.board,
    "",
    s.legend,
    `Head: row ${s.head.row} col ${s.head.col}`,
    `Food: ${s.food ? `row ${s.food.row} col ${s.food.col}` : "none"}`,
    `Heading: ${s.heading}`,
    `Snake length: ${s.snakeLength}`,
    `Food is adjacent: ${s.foodIsAdjacent}`,
    "",
    "Every listed direction is safe for this single step. Facts were computed by code and are exact:",
    facts,
    "",
    `Reply with JSON only, no markdown: {"choice":"<dir>"}`,
    `choice MUST be one of: ${legal.join(", ")}`,
  ].join("\n");
  return [
    { role: "system", content: request.instructions },
    { role: "user", content: user },
  ];
}

export const PRESETS: Record<string, string> = {
  求稳:
    "先活下来。优先选可达空格最多的方向，绝不进死胡同，只有不压缩活动空间时才去吃食物。不要犯错。",
  贪吃: "尽快吃到食物。只要不是死胡同，就缩短与食物的距离。",
  混乱: "别按常理走。乱逛、绕远路、贴墙。多数时候不理食物，但不要死。",
};
