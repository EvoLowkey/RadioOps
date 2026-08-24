import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('professional UI includes operations header, activity panel, radio drawer, and quick actions',()=>{
  for(const id of ['systemTime','fleetHealth','recentActivity','radioDrawer','quickCheckout','quickReturn']){
    assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
  }
});
