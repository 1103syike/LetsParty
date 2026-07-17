import {
  ArcRotateCamera,
  Vector3,
} from '@babylonjs/core';

import type { RpsAnimalActor } from '@/minigames/rock-paper-scissors/rps-animal-actor';
import { tryMoveWithHitbox } from '@/minigames/rock-paper-scissors/rps-actor-collision';

const MOVE_SPEED = 5.2;
const RUN_SPEED = 8.4;

const FOLLOW_CAMERA = {
  radius: 9,
  beta: Math.PI / 2.55,
  lowerRadiusLimit: 6,
  upperRadiusLimit: 14,
  targetYOffset: 0.85,
} as const;

interface MoveKeys {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
  jump: boolean;
}

export class RpsPlayerControl {
  private readonly keys: MoveKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    jump: false,
  };

  private enabled = false;

  private readonly canvas: HTMLCanvasElement;

  private readonly camera: ArcRotateCamera;

  private getLocalActor: () => RpsAnimalActor | null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) {
      return;
    }

    this.applyKey(event.code, true);

    if (this.isMovementKey(event.code) || event.code === 'Space') {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!this.enabled) {
      return;
    }

    this.applyKey(event.code, false);
  };

  constructor(
    canvas: HTMLCanvasElement,
    camera: ArcRotateCamera,
    getLocalActor: () => RpsAnimalActor | null,
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.getLocalActor = getLocalActor;
  }

  enable(): void {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    this.camera.radius = FOLLOW_CAMERA.radius;
    this.camera.beta = FOLLOW_CAMERA.beta;
    this.camera.lowerRadiusLimit = FOLLOW_CAMERA.lowerRadiusLimit;
    this.camera.upperRadiusLimit = FOLLOW_CAMERA.upperRadiusLimit;
    this.camera.attachControl(this.canvas, true);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const actor = this.getLocalActor();

    if (actor) {
      actor.faceTowardWorldPoint(this.camera.position.x, this.camera.position.z);
      this.camera.setTarget(actor.getAimTarget());
    }
  }

  disable(): void {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;
    this.camera.detachControl();
    this.resetKeys();

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    this.disable();
  }

  update(deltaMs: number, allActors: RpsAnimalActor[]): void {
    if (!this.enabled) {
      return;
    }

    const actor = this.getLocalActor();

    if (!actor) {
      return;
    }

    this.camera.setTarget(actor.getAimTarget());

    if (this.keys.jump && !actor.isJumping()) {
      actor.playJump();
      this.keys.jump = false;
    }

    const moveX = Number(this.keys.right) - Number(this.keys.left);
    const moveZ = Number(this.keys.forward) - Number(this.keys.backward);

    if (moveX === 0 && moveZ === 0) {
      if (!actor.isJumping()) {
        actor.playRestPose();
      }

      return;
    }

    const direction = this.buildMoveDirection(moveX, moveZ);
    const speed = this.keys.run ? RUN_SPEED : MOVE_SPEED;
    const step = speed * (deltaMs / 1000);
    const nextX = actor.root.position.x + direction.x * step;
    const nextZ = actor.root.position.z + direction.z * step;
    const moved = tryMoveWithHitbox(actor, nextX, nextZ, allActors);

    actor.setPosition(moved.x, moved.z);
    actor.faceWorldDirection(direction.x, direction.z);

    if (this.keys.run) {
      actor.playRun();
    } else {
      actor.playWalk();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private buildMoveDirection(moveX: number, moveZ: number): Vector3 {
    const forward = this.camera.getForwardRay().direction;
    forward.y = 0;

    if (forward.lengthSquared() < 0.001) {
      forward.set(0, 0, 1);
    } else {
      forward.normalize();
    }

    const right = Vector3.Cross(Vector3.Up(), forward).normalize();
    const direction = forward
      .scale(moveZ)
      .add(right.scale(moveX));

    if (direction.lengthSquared() < 0.001) {
      return Vector3.Zero();
    }

    direction.normalize();

    return direction;
  }

  private applyKey(code: string, pressed: boolean): void {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = pressed;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = pressed;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = pressed;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = pressed;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.run = pressed;
        break;
      case 'Space':
        if (pressed) {
          this.keys.jump = true;
        }
        break;
      default:
        break;
    }
  }

  private isMovementKey(code: string): boolean {
    return (
      code === 'KeyW'
      || code === 'KeyA'
      || code === 'KeyS'
      || code === 'KeyD'
      || code === 'ArrowUp'
      || code === 'ArrowDown'
      || code === 'ArrowLeft'
      || code === 'ArrowRight'
    );
  }

  private resetKeys(): void {
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.left = false;
    this.keys.right = false;
    this.keys.run = false;
    this.keys.jump = false;
  }
}
