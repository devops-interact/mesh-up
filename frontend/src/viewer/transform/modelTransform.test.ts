import { describe, expect, it } from 'vitest';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import {
  applyQuarterTurn,
  centerPivotOnBounds,
  hierarchyWorldCenter,
  importedHierarchyRoot,
  resolveTransformRoot,
} from './modelTransform';

describe('modelTransform', () => {
  it('walks to the imported hierarchy root', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = MeshBuilder.CreateBox('root', { size: 1 }, scene);
    const child = MeshBuilder.CreateBox('child', { size: 1 }, scene);
    child.parent = root;

    expect(importedHierarchyRoot(child)).toBe(root);
    expect(resolveTransformRoot(child)).toBe(root);

    scene.dispose();
    engine.dispose();
  });

  it('turns a quarter around the model center and returns after four steps', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const root = new TransformNode('model', scene);
    const box = MeshBuilder.CreateBox('box', { size: 2 }, scene);
    box.position.set(4, 0, 0);
    box.parent = root;

    centerPivotOnBounds(root, [box]);
    const before = hierarchyWorldCenter([box]);
    expect(before).not.toBeNull();

    applyQuarterTurn(root, 'y');
    const after = hierarchyWorldCenter([box]);
    expect(after).not.toBeNull();
    expect(Vector3.Distance(before!, after!)).toBeLessThan(0.05);

    applyQuarterTurn(root, 'y');
    applyQuarterTurn(root, 'y');
    applyQuarterTurn(root, 'y');
    const q = root.rotationQuaternion;
    expect(q).toBeTruthy();
    const angle = 2 * Math.acos(Math.min(1, Math.abs(q!.w)));
    expect(angle).toBeLessThan(1e-4);

    scene.dispose();
    engine.dispose();
  });
});
