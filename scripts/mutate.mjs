#!/usr/bin/env node
// Production grammar copies: compiler/linker failures are harness failures,
// never a caught parsing mutant. No shared parser cache is used.
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),cli=process.env.TREE_SITTER??'tree-sitter';
const temp=mkdtempSync(join(tmpdir(),'lms-mutants-'));
function tool(args){const r=spawnSync(cli,args,{cwd:temp,encoding:'utf8',maxBuffer:Infinity});assert.ifError(r.error);return r;}
function build(){for(const args of [['generate'],['build','--output',join(temp,'.build/parser.so')]]){const r=tool(args);assert.equal(r.status,0,r.stdout+r.stderr);}}
function parsePath(path){return tool(['parse','--xml','--no-ranges','-l',join(temp,'.build/parser.so'),'--lang-name','lmscript',path]);}
function parse(name){return parsePath(join(temp,'test/fixtures',name+'.lms'));}
const liveBlocks=[];
try{
 cpSync(root,temp,{recursive:true,filter:p=>!p.split('/').some(v=>['.git','.build','node_modules'].includes(v))});mkdirSync(join(temp,'.build'),{recursive:true});
 build();for(const name of ['system_results','csv','json','lmcode']){const r=parse(name);assert.equal(r.status,0,r.stdout+r.stderr);}console.log('PASS baseline');
 if(process.env.MONO_ROOT){const dir=join(process.env.MONO_ROOT,'lmscript/examples');for(const f of readdirSync(dir).filter(f=>f.endsWith('.lms'))){const path=join(dir,f),r=parsePath(path);assert.equal(r.status,0,r.stdout+r.stderr);if(/<data_block_statement[\s>]/.test(r.stdout))liveBlocks.push(path);}}
 const grammar=join(temp,'grammar.js'),original=readFileSync(grammar,'utf8'),exclusion='()|&<>*?\\[\\]`';assert.ok(original.includes(exclusion));
 writeFileSync(grammar,original.replaceAll(exclusion,''));build();let r=parse('system_results');assert.ok([0,1].includes(r.status),r.stdout+r.stderr);assert.match(r.stdout,/<(?:ERROR|MISSING)[\s/>]/);console.log('CAUGHT command word exclusions removed');if(process.env.MONO_ROOT){r=parsePath(join(process.env.MONO_ROOT,'lmscript/examples/system_results.lms'));assert.match(r.stdout,/<(?:ERROR|MISSING)[\s/>]/);console.log('CAUGHT actual mono examples/system_results.lms');}writeFileSync(grammar,original);
 const scanner=join(temp,'src/scanner.c'),source=readFileSync(scanner,'utf8');assert.ok(source.includes('if(!s->count)return false;'));
 writeFileSync(scanner,source.replace('if(!s->count)return false;','return false;'));build();for(const name of ['csv','json','lmcode']){r=parse(name);assert.ok([0,1].includes(r.status),r.stdout+r.stderr);assert.match(r.stdout,/<(?:ERROR|MISSING)[\s/>]/);}console.log('CAUGHT block scanner disabled: 3/3 block fixtures fail');for(const path of liveBlocks){r=parsePath(path);assert.match(r.stdout,/<(?:ERROR|MISSING)[\s/>]/);}if(liveBlocks.length)console.log('CAUGHT block scanner disabled: '+liveBlocks.length+'/'+liveBlocks.length+' actual mono block examples fail');
 writeFileSync(scanner,source.replace('s->queue[0]>=6?LMCODE_BODY:DATA_BODY','DATA_BODY'));build();r=parse('lmcode');assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stdout,/<lmcode_body[\s>]/);console.log('CAUGHT injection node erased');
}finally{rmSync(temp,{recursive:true,force:true});}
