import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/lib/polygonScenery.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {sceneryOffset,goldBetweenSlides,polygonFill,makeSceneryMesh}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('panorama moves continuously across slide boundaries and extends beyond last viewport',()=>{
 assert.equal(sceneryOffset(1)-sceneryOffset(.5),210);
 assert.ok(Math.abs(sceneryOffset(1.0001)-sceneryOffset(.9999))<.1);
 const mesh=makeSceneryMesh(20);
 assert.deepEqual(mesh,makeSceneryMesh(20));
 assert.ok(Math.max(...mesh.flatMap(cell=>cell.points.split(' ').map(point=>Number(point.split(',')[0]))))>sceneryOffset(19)+1350);
});
test('gold blends with slide position and each polygon receives one solid color',()=>{
 assert.equal(goldBetweenSlides(.25,[false,true,false]),.25);
 assert.equal(goldBetweenSlides(1.5,[false,true,false]),.5);
 assert.equal(goldBetweenSlides(-1,[true,false]),1);
 assert.equal(goldBetweenSlides(20,[false,true]),1);
 const center=polygonFill(1,675,525,0,1), edge=polygonFill(1,0,0,0,1);
 assert.notEqual(center,edge);
 assert.match(center,/^rgb\(\d+,\d+,\d+\)$/);
 assert.equal(edge,polygonFill(1,0,0,0,0));
 assert.equal(polygonFill(1,1095,525,420,1),center);
});
