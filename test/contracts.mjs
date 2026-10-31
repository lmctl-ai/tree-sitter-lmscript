import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const cli=process.env.TREE_SITTER??'tree-sitter';
const library=process.env.TREE_SITTER_LIB??join(root,'.build/parser.so');
function parse(source,edits=[]){const dir=mkdtempSync(join(tmpdir(),'lms-grammar-'));try{const file=join(dir,'input.lms');writeFileSync(file,source);const r=spawnSync(cli,['parse','--xml','--no-ranges','-l',library,'--lang-name','lmscript',file,...(edits.length?['--edits',...edits]:[])],{encoding:'utf8'});assert.ifError(r.error);return r;}finally{rmSync(dir,{recursive:true,force:true});}}
const valid=[
 ['system call','result = system(["echo", "ok"], {check:true});'],
 ['command joins','result = system printf "hello ${name}" \\\n world;'],
 ['lmcode body','p = _lmcode_ schema="host.json";\n$return.x = 1;\nend _lmcode_\n'],
 ['legacy body','p = _dsl_ schema="host.json";\nlet x = 1;\nend _dsl_\n'],
 ['queued bodies','x = merge(_csv_, _json_);\na,b\n1,2\nend _csv_\n{"v":1}\nend _json_\n'],
 ['heredoc protects closer','p = _lmcode_ schema="host.json";\nlet x = <<TEXT;\nend _lmcode_\nTEXT\nend _lmcode_\n'],
 ['raw braces','s = r"""{foo} {{ }} \\n""";'],
 ['formatted triple','s = f"""hello {name} {{ok}}""";'],
 ['planned load schema','s = load_schema(cli="tool" install="github:org/tool@latest");'],
 ['planned handle block','x = _lmcode_ s out=ARGV[0] + ".dslb";\n$return = 1;\nend _lmcode_\n'],
];
for(const [name,source]of valid)test(name,()=>{const r=parse(source);assert.equal(r.status,0,r.stdout+r.stderr);if(name.includes('body')||name.includes('handle block')||name.includes('protects closer'))assert.match(r.stdout,/<lmcode_body[ >]/);if(name==='formatted triple')assert.match(r.stdout,/<fstring_field[ >]/);});
for(const [name,source]of [
 ['missing semicolon','x = 1'],['missing brace','if (true) { x = 1;'],['unterminated string','x = "oops;'],['unterminated field','x = f"{name";'],['stray closer','end _csv_'],['mismatched closer','x = _csv_;\na,b\nend _json_\n'],['unterminated block','x = _json_;\n{}\n'],['pipe command','system echo hi | cat;'],['glob command','system echo *.txt;'],['tilde command','system echo ~/file;'],
])test('reject '+name,()=>{const r=parse(source);assert.notEqual(r.status,0,r.stdout);assert.match(r.stdout,/ERROR|MISSING/);});

test('incremental marker edit retains injected body',()=>{
 const source='x = _csv_;\na,b\nend _csv_\n';
 const r=parse(source,['0,4 5 _lmcode_','2,4 5 _lmcode_']);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/<lmcode_body[ >]/);
});
test('CRLF body boundaries',()=>{const r=parse('x = _lmcode_ schema="s";\r\n$return = 1;\r\nend _lmcode_\r\n');assert.equal(r.status,0,r.stdout);assert.match(r.stdout,/<lmcode_body[ >]/);});
test('raw triple backslash does not escape delimiter',()=>{const r=parse('x = r"""ending\\""";');assert.equal(r.status,0,r.stdout);});
test('backslash does not hide formatted field',()=>{for(const prefix of ['f','rf']){const r=parse('x = '+prefix+'"a\\{name}";');assert.equal(r.status,0,r.stdout);assert.match(r.stdout,/<fstring_field[ >]/);}});
test('mismatched closer before matching closer refuses',()=>{const r=parse('x = _csv_;\na,b\nend _json_\nend _csv_\n');assert.notEqual(r.status,0,r.stdout);});
test('multiline splice string protects outer closer',()=>{const r=parse('x = _json_;\n${"""\nend _json_\n"""}\nend _json_\n');assert.equal(r.status,0,r.stdout);});
for(const source of ['system echo "$HOME";','system echo "`date`";'])test('quoted shell expansion refused '+source,()=>{assert.notEqual(parse(source).status,0);});
test('empty and singleton tuples match the hand parser',()=>{const r=parse('x = (); y = (1,); z = (1,2,);');assert.equal(r.status,0,r.stdout);});
