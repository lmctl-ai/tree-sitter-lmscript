# tree-sitter-lmscript

Experimental Tree-sitter grammar for LMScript, maintained by the **lmctl-ai
lmscript team**. MIT, copyright Lattice Systems LLC. This is an analysis/editor
parser, not the language runtime or a replacement for its checker.

Covers statements, expressions, imports, packages, recover points, command
literals, strings/formatted fields, and queued data blocks. Generated
`src/parser.c` is committed. Consumers compile it with `src/scanner.c`.

## Build and test

Use Node 24+, a C compiler, and tree-sitter-cli **0.27.1**, installed privately:

```sh
npm install --prefix /tmp/lmscript-tree-sitter tree-sitter-cli@0.27.1
export TREE_SITTER=/tmp/lmscript-tree-sitter/node_modules/.bin/tree-sitter
npm test
```

The gate generates the parser, runs 39 Tree-sitter corpus cases and contract
checks, checks the conformance harness with failing controls, parses the public
corpus without ERROR/MISSING, and catches three production-copy mutants.
Actions runs these suites on Ubuntu/macOS and checks generated-file freshness.
There is no publishing or release workflow.

The mono and skills-scripts corpora are private. Their source contents are
**not** copied here or fetched with credentials by public CI. To scan all `.lms`
files recursively in local checkouts:

```sh
export MONO_ROOT=/path/to/lmctl-mono
export SKILLS_ROOT=/path/to/skills-scripts
node scripts/conformance.mjs --live
```

Required roots: mono `lmscript/examples`; skills-scripts `lms-driven`, `lms-lib`,
`lms-adhoc`, `quickrun`, `tests`. Missing roots fail; untracked files are parsed
also. `MONO-PIN` records the parser revision; `corpus-manifest.json` records hashes
of 119 locally checked files, not their contents. `WRITE_MANIFEST=path.json`
records a new scan. Public CI uses the independently authored corpus.

## Injection boundary

Both `_lmcode_` and the current `_dsl_` alias produce a `data_block_statement`
with `marker_expression/block_marker`, named **`lmcode_body`**, and `block_closer`.
Other formats use `data_body`. Empty blocks have no body node. Body byte ranges
exclude header/closer and include physical body text and line endings. Reparse
that range with tree-sitter-lmcode and rebase positions in the host; this repo
performs no injection. The scanner handles queued markers, matching closers,
CRLF and queued/dedented inner heredocs containing outer closer text.
Incremental scanner state is serialized and tested with edits.

## Current and planned syntax

The source contract is the mono lexer/parser and language reference at
`MONO-PIN`. The lmcode `spec/grammar.ebnf` was cross-checked; it describes the
**inner language**, not LMScript. At this pin `$return` lowering has landed in
`dsl.ts`, although the EBNF still labels it planned. Opaque bodies admit it;
`$return` is not an outer-language identifier.

`load_schema(cli="tool" install="github:org/tool@latest")`,
`load_schema(schema="host.json")` and `_lmcode_ HANDLE out=EXPR;` are explicitly
**planned syntax**, based on the accepted return/reverse-template design. They
are not runtime features at this pin. Returning a compiled descriptor versus a
process result is runtime semantics; reverse templates are ordinary calls.

See [DIVERGENCES.md](DIVERGENCES.md). The separately planned S3 differential
gate (500+ seeded documents against the real checker) is not implemented in S1.
Do not claim runtime equivalence or production readiness before it lands.

## Lmscript-owned lmcode body templates

`lmcode_body` stays an opaque node in the outer parser. `queries/injections.scm`
selects the companion `lmscript_lmcode` parser for that region, rather than teaching
the standalone lmcode grammar higher-level syntax. The companion inherits a
pinned ordinary lmcode grammar and adds the single-line formatted-string rules;
its `lmscript_lmcode_body` node records the owning context for analysis tools.
Standalone lmcode still rejects `f"..."`. Lmscript's compiler expands body templates
into ordinary source before invoking the inner compiler; no VM change is involved.

`npm test` generates/tests both parsers, verifies the pinned base/scanner, checks
formatting refusals, and proves removing the formatting branch breaks a real body.
The vendored base revision and digests are in `lmcode-body/vendor/UPSTREAM.json`;
the scanner differs only in its exported language-symbol prefix.
