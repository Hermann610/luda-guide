import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript } from '../src/lib/transcript.ts';

test('selects final score rather than score metadata, retaining decimal credits', () => {
  const result = parseTranscript([['成绩单'], ['课程名称', '学分', '成绩性质', '总评成绩'], ['数学', '1.5', '必修', 88]]);
  assert.deepEqual(result.courses, [{ name: '数学', credit: 1.5, score: 88 }]);
});
test('does not silently clamp scores or parse partial numbers', () => {
  const result = parseTranscript([['课程', '学分', '成绩'], ['超出', 2, 110], ['混杂', 2, '85abc'], ['负学分', -2, 85], ['空分', 2, ''], ['通过课', 1, 'P'], ['挂科', 2, 0]]);
  assert.deepEqual(result.courses, [{ name: '挂科', credit: 2, score: 0 }]);
  assert.equal(result.issues.length, 5);
  assert.match(result.issues[0], /第 2 行/);
});
test('reports grade estimation and refuses incomplete headers', () => {
  assert.equal(parseTranscript([['课程名称', '学分', '成绩'], ['英语', 2, '优秀']]).gradeCount, 1);
  assert.throws(() => parseTranscript([['课程名称', '学分', '成绩性质'], ['英语', 2, '必修']]));
});
