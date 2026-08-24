import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('mobile header exposes an accessible profile menu with sign out',()=>{
  for(const id of ['mobileProfileBtn','mobileProfileMenu','mobileProfileName','mobileProfileRole','mobileSignOutBtn']){
    assert.match(html,new RegExp(`id=["']${id}["']`),`missing ${id}`);
  }
  assert.match(html,/id=["']mobileProfileBtn["'][^>]*aria-expanded=["']false["']/s);
  assert.match(html,/id=["']mobileProfileMenu["'][^>]*hidden/s);
});

test('mobile profile menu is mobile-only and touch friendly',()=>{
  assert.match(css,/\.mobile-profile-menu-wrap\{[^}]*display:none[^}]*\}/s);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.mobile-profile-menu-wrap\{[^}]*display:block[^}]*\}/s);
  assert.match(css,/\.mobile-signout-btn\{[^}]*min-height:44px[^}]*\}/s);
});

test('mobile menu is wired to identity and sign out behavior',()=>{
  assert.match(app,/mobileProfileName/);
  assert.match(app,/mobileProfileRole/);
  assert.match(app,/mobileProfileBtn/);
  assert.match(app,/mobileSignOutBtn/);
  assert.match(app,/addEventListener\(['"]click['"],signOut\)/);
});

test('mobile account control stays visible on very narrow phones',()=>{
  assert.match(css,/@media\(max-width:460px\)[\s\S]*\.topbar-meta\{[^}]*display:flex[^}]*\}/s);
  assert.match(css,/\.mobile-profile-menu\{[^}]*z-index:(?:[6-9]\d|[1-9]\d{2,})[^}]*\}/s);
});
