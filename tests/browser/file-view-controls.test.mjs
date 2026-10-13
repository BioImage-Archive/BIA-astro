import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../../src/components/FileListTable.astro',import.meta.url),'utf8');
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const javascript = ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function controls() {
  class Element {}
  class HTMLElement extends Element {blur(){} }
  class HTMLIFrameElement extends HTMLElement {}
  const buttons=['table','tree'].map(view=>Object.assign(new HTMLElement(),{dataset:{view},pressed:view==='table'?'true':'false',setAttribute(name,value){assert.equal(name,'aria-pressed');this.pressed=value;}}));
  const frames=['table','tree'].map(view=>{
   const classes=new Set(view==='table'?['is-active']:[]);
   return Object.assign(new HTMLIFrameElement(),{src:'',dataset:{src:`https://example.org/${view}`},classes,classList:{toggle(name,active){active?classes.add(name):classes.delete(name);}}});
  });
  let click;
  vm.runInNewContext(javascript,{Element,HTMLElement,HTMLIFrameElement,window:{addEventListener(){}},document:{
   querySelector:()=>new HTMLElement(),
   querySelectorAll(selector){if(selector==='.file-list-viewer')return frames;assert.equal(selector,'.file-list-view-button');return buttons;},
   getElementById(id){return frames[['file-list-table-viewer','file-list-tree-viewer'].indexOf(id)];},
   addEventListener(event,handler){assert.equal(event,'click');click=handler;}
  }});
  function select(view) {
   const target=Object.assign(new HTMLElement(),{closest(selector){assert.equal(selector,'.file-list-view-button');return buttons.find(button=>button.dataset.view===view);}});
   let prevented=false;click({target,preventDefault(){prevented=true;}});return prevented;
  }
  return {buttons,frames,select};
}
test('file views switch the actual iframe and preserve matching pressed state',()=>{
  const {buttons,frames,select}=controls();
  assert(select('tree'));assert.deepEqual(buttons.map(button=>button.pressed),['false','true']);assert.deepEqual(frames.map(frame=>frame.classes.has('is-active')),[false,true]);
  assert.deepEqual(frames.map(frame=>frame.src),['https://example.org/table','https://example.org/tree']);
  assert(select('table'));assert.deepEqual(buttons.map(button=>button.pressed),['true','false']);assert.deepEqual(frames.map(frame=>frame.classes.has('is-active')),[true,false]);
});
test('unrelated clicks leave the existing file view state untouched',()=>{
  const {buttons,frames,select}=controls();assert.equal(select('unrelated'),false);assert.deepEqual(buttons.map(button=>button.pressed),['true','false']);assert(frames.every(frame=>frame.src===''));
});
