import type { RpsAnimalActor } from '@/minigames/rock-paper-scissors/rps-animal-actor';
import { findSpawnPosition, overlapsOtherActors, tryMoveWithHitbox } from '@/minigames/rock-paper-scissors/rps-actor-collision';
import {
  RPS_STAGE_HALF,
  clampToStage,
} from '@/minigames/rock-paper-scissors/rps-scene-environment';

const ARENA_RADIUS = RPS_STAGE_HALF - 1;
const MOVE_SPEED = 3.2;
const RUN_SPEED = 5.4;

interface RoamState {
  targetX: number;
  targetZ: number;
  speed: number;
  nextDecisionAt: number;
  isJumping: boolean;
}

function randomInArena(): { x: number; z: number } {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * ARENA_RADIUS;

  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  };
}

export class RpsChaosRoam {
  private readonly states = new Map<RpsAnimalActor, RoamState>();

  private focusStartPositions = new Map<RpsAnimalActor, { x: number; z: number }>();

  reset(actors: RpsAnimalActor[], controlledActor: RpsAnimalActor | null = null): void {
    this.states.clear();

    if (controlledActor) {
      const center = clampToStage(0, 0);
      const spawn = overlapsOtherActors(center.x, center.z, controlledActor, actors)
        ? findSpawnPosition(controlledActor, actors, randomInArena)
        : center;

      controlledActor.setPosition(spawn.x, spawn.z);
      controlledActor.playRestPose();
    }

    for (const actor of actors) {
      if (actor === controlledActor) {
        continue;
      }

      const spawn = findSpawnPosition(actor, actors, randomInArena);
      const target = findSpawnPosition(actor, actors, randomInArena);

      this.states.set(actor, {
        targetX: target.x,
        targetZ: target.z,
        speed: MOVE_SPEED,
        nextDecisionAt: performance.now() + 400 + Math.random() * 800,
        isJumping: false,
      });

      actor.setPosition(spawn.x, spawn.z);
      actor.faceTowardCenter();
      actor.playRestPose();
    }
  }

  update(
    actors: RpsAnimalActor[],
    deltaMs: number,
    controlledActor: RpsAnimalActor | null = null,
  ): void {
    const now = performance.now();
    const deltaSec = deltaMs / 1000;

    for (const actor of actors) {
      if (actor === controlledActor) {
        continue;
      }

      let state = this.states.get(actor);

      if (!state) {
        const target = findSpawnPosition(actor, actors, randomInArena);
        state = {
          targetX: target.x,
          targetZ: target.z,
          speed: MOVE_SPEED,
          nextDecisionAt: now + 600,
          isJumping: false,
        };
        this.states.set(actor, state);
      }

      if (now >= state.nextDecisionAt) {
        this.pickNextAction(actor, actors, state, now);
      }

      const position = actor.root.position;
      const dx = state.targetX - position.x;
      const dz = state.targetZ - position.z;
      const distance = Math.hypot(dx, dz);

      if (distance > 0.08) {
        const step = Math.min(distance, state.speed * deltaSec);
        const nx = dx / distance;
        const nz = dz / distance;
        const moved = tryMoveWithHitbox(
          actor,
          position.x + nx * step,
          position.z + nz * step,
          actors,
        );

        actor.setPosition(moved.x, moved.z);
        actor.faceWorldDirection(nx, nz);

        if (!state.isJumping) {
          if (state.speed >= RUN_SPEED - 0.1) {
            actor.playRun();
          } else {
            actor.playWalk();
          }
        }
      } else if (!state.isJumping) {
        actor.playRestPose();
      }
    }
  }

  snapToFocus(actors: RpsAnimalActor[]): void {
    this.focusStartPositions.clear();

    actors.forEach((actor, slotIndex) => {
      const target = FOCUS_PANEL_POSITIONS[slotIndex] ?? FOCUS_PANEL_POSITIONS[0];

      this.focusStartPositions.set(actor, { x: target.x, z: target.z });
      actor.setPosition(target.x, target.z);
      actor.holdStandingPose();
    });
  }

  lerpToFocus(actor: RpsAnimalActor, slotIndex: number, progress: number): void {
    const start = this.focusStartPositions.get(actor) ?? {
      x: actor.root.position.x,
      z: actor.root.position.z,
    };
    const target = FOCUS_PANEL_POSITIONS[slotIndex] ?? FOCUS_PANEL_POSITIONS[0];
    const eased = 1 - (1 - progress) ** 3;

    actor.setPosition(
      start.x + (target.x - start.x) * eased,
      start.z + (target.z - start.z) * eased,
    );
    actor.faceTowardCenter();
  }

  private pickNextAction(
    actor: RpsAnimalActor,
    actors: RpsAnimalActor[],
    state: RoamState,
    now: number,
  ): void {
    const target = findSpawnPosition(actor, actors, randomInArena);
    state.targetX = target.x;
    state.targetZ = target.z;
    state.speed = Math.random() > 0.45 ? RUN_SPEED : MOVE_SPEED;
    state.nextDecisionAt = now + 500 + Math.random() * 1200;

    if (Math.random() < 0.22) {
      state.isJumping = true;
      state.nextDecisionAt = now + 900;
      actor.playJump(() => {
        state.isJumping = false;
      });
    }
  }
}

export const FOCUS_PANEL_POSITIONS = [
  { x: -3.8, z: -3.8 },
  { x: 3.8, z: -3.8 },
  { x: -3.8, z: 3.8 },
  { x: 3.8, z: 3.8 },
] as const;
