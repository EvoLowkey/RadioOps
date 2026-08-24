import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('manager dashboard includes operations overview filters, priority groups, and recent operational activity',()=>{
  for(const id of ['operationsOverview','opsSearch','opsFilter','opsDepartment','opsSummary','opsCheckedOut','opsOverdue','opsUnavailable','opsActivity']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/Currently Checked Out/);
  assert.match(html,/Overdue \/ Unreturned/);
  assert.match(html,/Unavailable Radios/);
  assert.match(app,/renderOperationsOverview/);
  assert.match(app,/getManagerOperationsOverview/);
  assert.match(app,/getOperationalActivity/);
});

test('operations overview exposes manager quick actions and responsive styles',()=>{
  assert.match(app,/data-ops-action/);
  assert.match(app,/opsSearch/);
  assert.match(app,/opsDepartment/);
  assert.match(css,/\.operations-overview/);
  assert.match(css,/\.ops-grid/);
  assert.match(css,/@media[^}]*max-width/s);
});
