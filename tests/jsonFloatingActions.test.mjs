import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreFloatingActionsPosition, getDockedPosition, getReleasedPosition, getExpandedPosition } from '../src/components/utils/floatingActionsPosition.ts';

test('position restoration tolerates missing, invalid and old preferences', () => {
    for (const value of [null, '', '{bad', '{}', 'null', '{"side":"top","ratio":0.4}', '{"side":"left","ratio":"0.4"}']) {
        assert.deepEqual(restoreFloatingActionsPosition(value), { side: 'right', ratio: 0.6 });
    }
    assert.deepEqual(restoreFloatingActionsPosition('{"side":"left","ratio":2}'), { side: 'left', ratio: 1 });
    assert.deepEqual(restoreFloatingActionsPosition('{"side":"right","ratio":-1}'), { side: 'right', ratio: 0 });
});

test('a released position snaps to its nearest edge and survives resized viewports', () => {
    const position = getReleasedPosition(180, 320, 1200, 800, 140, 40);
    assert.equal(position.side, 'left');
    assert.deepEqual(getDockedPosition(position, 1200, 800, 140, 40), { x: 10, y: 320 });
    const resized = getDockedPosition(position, 940, 400, 180, 40);
    assert.equal(resized.x, 10);
    assert.ok(resized.y >= 5 && resized.y + 40 <= 395);
    const right = getReleasedPosition(950, 900, 1200, 800, 140, 40);
    assert.deepEqual(right, { side: 'right', ratio: 1 });
    assert.deepEqual(getDockedPosition(right, 940, 400, 180, 40), { x: 750, y: 355 });
});

test('dragging beyond viewport bounds never persists an offscreen position', () => {
    assert.deepEqual(getReleasedPosition(-100, -500, 1000, 500, 140, 40), { side: 'left', ratio: 0 });
    assert.deepEqual(getReleasedPosition(2000, 900, 1000, 500, 140, 40), { side: 'right', ratio: 1 });
    assert.deepEqual(getDockedPosition({ side: 'right', ratio: 1 }, 100, 30, 140, 40), { x: 10, y: 5 });
});

test('expanding stays attached to the same edge and clamps at the top and bottom', () => {
    const rightAnchor = getDockedPosition({ side: 'right', ratio: 1 }, 1000, 500, 40, 40);
    const rightPanel = getExpandedPosition(rightAnchor, 'right', 500, 40, 280, 300);
    assert.deepEqual(rightPanel, { x: 710, y: 195 });
    assert.equal(rightPanel.x + 280, rightAnchor.x + 40);
    assert.equal(rightPanel.y + 300, 495);
    const leftAnchor = getDockedPosition({ side: 'left', ratio: 0 }, 1000, 500, 40, 40);
    assert.deepEqual(getExpandedPosition(leftAnchor, 'left', 500, 40, 280, 300), { x: 10, y: 5 });
    assert.deepEqual(getDockedPosition({ side: 'right', ratio: 1 }, 1000, 500, 40, 40), rightAnchor);
});

test('the icon can align with the settings button above the old eight-pixel boundary', () => {
    const released = getReleasedPosition(10, 5, 1280, 720, 32, 32);
    assert.deepEqual(getDockedPosition(released, 1280, 720, 32, 32), { x: 10, y: 5 });
    const fractional = getReleasedPosition(10, 4.8, 1280, 720, 32, 32);
    assert.deepEqual(getDockedPosition(fractional, 1280, 720, 32, 32), { x: 10, y: 5 });
    assert.deepEqual(getDockedPosition({ side: 'left', ratio: 0 }, 1280, 720, 32, 32), { x: 10, y: 5 });
});

test('top and bottom share one margin, and left and right share another', () => {
    for (const [x, y, expected] of [
        [-100, -100, { x: 10, y: 5 }],
        [2000, -100, { x: 1238, y: 5 }],
        [-100, 2000, { x: 10, y: 683 }],
        [2000, 2000, { x: 1238, y: 683 }],
    ]) {
        const released = getReleasedPosition(x, y, 1280, 720, 32, 32);
        assert.deepEqual(getDockedPosition(released, 1280, 720, 32, 32), expected);
    }
});
