import {test}from'node:test';import assert from'node:assert/strict';import{readFileSync,mkdtempSync,writeFileSync,rmSync,cpSync}from'node:fs';import{join,resolve}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
const root=resolve(import.meta.dirname,'..'),body=join(root,'lmcode-body'),cli=process.env.TREE_SITTER??'tree-sitter';
const parse=(dir,file)=>spawnSync(cli,['parse','--grammar-path',dir,file],{cwd:root,encoding:'utf8',maxBuffer:Infinity});
test('body companion owns formatting and injection uses that layer',()=>{
 assert.match(readFileSync(join(root,'queries/injections.scm'),'utf8'),/injection.language "lmscript_lmcode"/);const dir=mkdtempSync(join(tmpdir(),'body-layer-'));
 try{const file=join(dir,'program.lmcode');writeFileSync(file,'let n=7; let s=f"value={n}";');const r=parse(body,file);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/lmscript_lmcode_body/);assert.match(r.stdout,/formatted_string/);}
 finally{rmSync(dir,{recursive:true,force:true});}
});
test('body grammar preserves strict formatting refusals',()=>{
 for(const name of ['empty-field','format-spec','invalid-escape','nested','single-brace','unclosed-field']){const r=parse(body,join(body,'test/negative/formatted-string-'+name+'.lmcode'));assert.notEqual(r.status,0,r.stdout);assert.match(r.stdout,/ERROR|MISSING/);}
});
test('base and scanner are the pinned ordinary grammar with only scanner symbol renaming',()=>{
 const pin=JSON.parse(readFileSync(join(body,'vendor/UPSTREAM.json'),'utf8'));assert.equal(createHash('sha256').update(readFileSync(join(body,'vendor/lmcode-grammar.js'))).digest('hex'),pin.grammar_sha256);const scanner=readFileSync(join(body,'src/scanner.c'),'utf8').replaceAll('tree_sitter_lmscript_lmcode_external_scanner_','tree_sitter_lmcode_external_scanner_');assert.equal(createHash('sha256').update(scanner).digest('hex'),pin.scanner_sha256);
});
test('removing the production formatting branch breaks a real body fixture',()=>{
 const dir=mkdtempSync(join(tmpdir(),'body-layer-mutant-'));
 try{cpSync(body,dir,{recursive:true});const file=join(dir,'grammar.js');const source=readFileSync(file,'utf8');const from='choice(original,$.formatted_string)';assert.equal(source.split(from).length,2);writeFileSync(file,source.replace(from,'original'));const gen=spawnSync(cli,['generate'],{cwd:dir,encoding:'utf8',maxBuffer:Infinity});assert.equal(gen.status,0,gen.stderr);const input=join(dir,'control.lmcode');writeFileSync(input,'let s=f"value={1}";');const r=parse(dir,input);assert.notEqual(r.status,0,r.stdout);assert.match(r.stdout,/ERROR|MISSING/);}
 finally{rmSync(dir,{recursive:true,force:true});}
});
