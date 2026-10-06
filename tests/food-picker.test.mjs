import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFood } from '../src/lib/food-picker.ts';
import { foodPool } from '../src/data/guide.ts';

test('reroll never repeats previous food when alternatives exist', () => {
  for (const previous of foodPool) {
    assert.notEqual(pickFood(foodPool, previous, () => 0), previous);
    assert.notEqual(pickFood(foodPool, previous, () => 0.999), previous);
  }
});
test('empty and single option pools are safe', () => {
  assert.equal(pickFood([]), null);
  assert.equal(pickFood(['only'], 'only'), 'only');
});
test('every sample stays within the chosen campus', () => {
  for (const campus of ['中关村', '通州']) {
    const pool = foodPool.filter(food => food.campus === campus);
    for (let i = 0; i < 100; i++) assert.equal(pickFood(pool)?.campus, campus);
  }
});
