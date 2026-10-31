#!/usr/bin/env node
// Public CI uses independently authored corpus cases. --live checks all source
// files in the two private checkouts without publishing their contents.
import {readdirSync,readFileSync,existsSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export function goodParse(r){return !r.error&&r.status===0&&/<source_file(?:\s|\/?>)/.test(r.stdout??'')&&!/<(?:ERROR|MISSING)(?:\s|\/?>)/.test(r.stdout??'');}
export function corpusCases(text){return [...text.matchAll(/^={10,}\r?\n([^\n]+)\r?\n={10,}\r?\n([\s\S]*?)\r?\n---\r?\n/gm)].map(m=>({name:m[1],source:m[2]}));}
const root=resolve(import.meta.dirname,'..');
const cli=process.env.TREE_SITTER??'tree-sitter';
const live=process.argv.includes('--live');
const files=[];let scratch;let sources;let bases=[];
function visit(dir){if(!existsSync(dir))throw Error('required corpus root missing: '+dir);for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())visit(p);else if(e.isFile()&&p.endsWith('.lms'))files.push(p);}}
if(live){const mono=resolve(process.env.MONO_ROOT??'/home/mma/repos/lmctl-mono-v6entries'),skills=resolve(process.env.SKILLS_ROOT??'/home/mma/repos/skills-scripts');if(!existsSync(join(mono,'lmscript/examples')))throw Error('required corpus root missing: '+join(mono,'lmscript/examples'));bases=[['mono',mono],['skills_scripts',skills]];sources=Object.fromEntries(bases.map(([name,path])=>{const r=spawnSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'});if(r.status!==0)throw Error('source git revision unavailable: '+path);return [name,{commit:r.stdout.trim()}];}));visit(join(mono,'lmscript/examples'));for(const name of ['lms-driven','lms-lib','lms-adhoc','quickrun','tests'])visit(join(skills,name));}
else{scratch=mkdtempSync(join(tmpdir(),'lms-public-corpus-'));const cases=corpusCases(readFileSync(join(root,'test/corpus/language.txt'),'utf8'));if(cases.length<20)throw Error('expected at least 20 corpus cases');for(const [i,c]of cases.entries()){const path=join(scratch,i+'.lms');writeFileSync(path,c.source);files.push(path);}}
try{
 if(!files.length)throw Error('empty corpus');files.sort();
 const library=process.env.TREE_SITTER_LIB??join(root,'.build/parser.so');
 if(!process.env.TREE_SITTER_LIB){mkdirSync(dirname(library),{recursive:true});for(const args of [['generate'],['build','--output',library]]){const r=spawnSync(cli,args,{cwd:root,encoding:'utf8'});if(r.error||r.status!==0)throw Error(r.error?.message||r.stderr||'grammar build failed');}}
 const failures=[];for(const file of files){const r=spawnSync(cli,['parse','--xml','--no-ranges','-l',library,'--lang-name','lmscript',file],{encoding:'utf8',maxBuffer:Infinity});if(!goodParse(r))failures.push(file+': '+(r.error?.message||r.stdout||r.stderr||'no parse tree'));}
 if(process.env.WRITE_MANIFEST){const manifest={mode:live?'live (private source text not included)':'public corpus',sources,files:files.map(file=>({...((live)?(()=>{const [source,base]=bases.find(([,base])=>file.startsWith(base+'/'));return {source,path:relative(base,file)};})():{path:relative(scratch,file)}),sha256:createHash('sha256').update(readFileSync(file)).digest('hex')}))};writeFileSync(resolve(process.env.WRITE_MANIFEST),JSON.stringify(manifest,null,2)+'\n');}
 console.log('Parsed '+files.length+' .lms documents ('+(live?'live checkouts':'public corpus')+')');
 if(failures.length){for(const failure of failures)console.error('FAIL '+failure);process.exitCode=1;}else console.log('PASS zero ERROR/MISSING nodes');
}finally{if(scratch)rmSync(scratch,{recursive:true,force:true});}
