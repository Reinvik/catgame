
export type Position = {
  x: number;
  y: number;
};

export enum EnemyType {
  WORKER = 'WORKER',
  PALLET_JACK = 'PALLET_JACK',
}

export enum EnemyState {
  PATROLLING,
  CHASING,
}

export type Enemy = {
  id: number;
  position: Position;
  type: EnemyType;
  patrolTarget?: Position;
  speed: number;
  moveCounter: number;
  state: EnemyState;
};

export enum GameState {
  NOT_STARTED = 'NOT_STARTED',
  PLAYING = 'PLAYING',
  LEVEL_COMPLETE = 'LEVEL_COMPLETE',
  GAME_OVER = 'GAME_OVER',
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export type FoodItem = {
    id: number;
    position: Position;
    emoji: string;
}

export type Rack = Position;