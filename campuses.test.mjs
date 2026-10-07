import test from 'node:test';
import assert from 'node:assert/strict';
import {UC_CAMPUSES,campusById,effectiveCampusId,campusHasLiveMenus,campusDataRoot} from './campuses.mjs';

test('UCPlate registers all ten UC campuses with unique ids',()=>{
  assert.equal(UC_CAMPUSES.length,10);
  assert.equal(new Set(UC_CAMPUSES.map(campus=>campus.id)).size,10);
  for(const campus of UC_CAMPUSES){
    assert.ok(campus.name);
    assert.ok(campus.adapter);
    assert.ok(campus.dataRoot);
  }
});

test('existing pre-campus profiles migrate to UCSC',()=>{
  assert.equal(effectiveCampusId({onboardingComplete:true}),'ucsc');
  assert.equal(effectiveCampusId({onboardingComplete:true,campusId:'ucsd'}),'ucsd');
});

test('only validated campus adapters are marked live',()=>{
  assert.equal(campusHasLiveMenus('ucsc'),true);
  assert.equal(campusHasLiveMenus('ucsd'),false);
  assert.equal(campusDataRoot('ucsc'),'./data');
  assert.equal(campusById('ucla').name,'UCLA');
});
