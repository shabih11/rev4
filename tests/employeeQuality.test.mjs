import {test} from 'node:test';
import assert from 'node:assert/strict';
import {employeeQualityPoints} from '../src/lib/employeeQuality.ts';

test('quality combines the existing two-point review credit and four-point conduct credit',()=>{
 const stats={positive:0.3,negative:2,complaints:0,safety:0};
 assert.equal(employeeQualityPoints(stats),6);
 assert.equal(stats.positive+employeeQualityPoints(stats),6.3);
 assert.deepEqual(stats,{positive:0.3,negative:2,complaints:0,safety:0});
 assert.equal(employeeQualityPoints({...stats,negative:1.5,complaints:1,safety:0.5}),4);
});
test('quality preserves the zero floor on conduct credit and remains within six points',()=>{
 assert.equal(employeeQualityPoints({positive:0,negative:0,complaints:4,safety:0}),0);
 assert.equal(employeeQualityPoints({positive:0,negative:2,complaints:3,safety:2}),2);
 assert.equal(employeeQualityPoints({positive:0,negative:2,complaints:0,safety:0}),6);
});
