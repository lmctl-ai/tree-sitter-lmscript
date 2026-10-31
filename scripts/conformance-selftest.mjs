#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'lms-harness-')),gate=resolve(import.meta.dirname,'conformance.mjs');
try {
 for(const [name,xml,code,want] of [['valid','<source_file></source_file>',0,0],['error','<source_file><ERROR/></source_file>',0,1],['missing','<source_file><MISSING type=";"/></source_file>',0,1],['process','<source_file/>',7,1],['empty','',0,1]]){
  const cli=join(dir,name);writeFileSync(cli,'#!/bin/sh\nprintf \'%s\\n\' '+JSON.stringify(xml)+'\nexit '+code+'\n');chmodSync(cli,0o755);
  const r=spawnSync(process.execPath,[gate],{env:{...process.env,TREE_SITTER:cli,TREE_SITTER_LIB:'unused'},encoding:'utf8'});
  assert.equal(r.status,want,r.stdout+r.stderr);if(want===1)assert.match(r.stdout,/Parsed/,'control must reach parser validation');console.log('PASS '+name+' harness control');
 }
 const r=spawnSync(process.execPath,[gate,'--live'],{env:{...process.env,MONO_ROOT:join(dir,'absent')},encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/required corpus root missing/);console.log('PASS missing-root control');
}finally{rmSync(dir,{recursive:true,force:true});}
