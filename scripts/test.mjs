#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
const root=resolve(import.meta.dirname,'..'),cli=process.env.TREE_SITTER??'tree-sitter';
const library=process.env.TREE_SITTER_LIB??join(root,'.build/parser.so');mkdirSync(dirname(library),{recursive:true});
const env={...process.env,TREE_SITTER:cli,TREE_SITTER_LIB:library,XDG_CACHE_HOME:process.env.XDG_CACHE_HOME??join(root,'.build/cache')};
for(const [command,args]of [[cli,['generate']],[cli,['test']],[cli,['build','--output',library]],[process.execPath,['--test','test/contracts.mjs']],[process.execPath,['scripts/conformance-selftest.mjs']],[process.execPath,['scripts/conformance.mjs']],[process.execPath,['scripts/mutate.mjs']]]){
 const r=spawnSync(command,args,{cwd:root,env,stdio:'inherit'});if(r.error||r.status!==0){console.error(r.error??'gate exit '+r.status);process.exit(r.status||1);}
}
