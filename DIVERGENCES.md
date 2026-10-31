# Analysis-parser boundaries

Classes for the later S3 differential allowlist; differential testing has not
run yet. A clean tree never authorizes execution.

| Input class | Grammar versus checker | Reason |
| --- | --- | --- |
| Planned load_schema clauses and block handle/out expression | Grammar accepts; pinned runtime lacks the descriptor intrinsic | Upcoming accepted syntax, marked planned in README |
| Undefined names, missing modules, arity/types, duplicate recover labels, recover in loops | Grammar accepts syntax; checker may reject | No name resolution, effects or types in an analysis grammar |
| Computed/duplicate block options, malformed data bodies, invalid outer splices | Opaque content accepted; checker validates | Body-language validation is not outer syntax |
| Keyword-adjacent strings such as return"x" and some reserved bindings | Contextual grammar can accept; lexer/checker may reject | S3 must enumerate these cases; analysis tokens remain queryable |
| String escape values, assignments in formatted fields | Delimiters/expressions checked, not scalar ranges or purity | Semantic validation belongs to the real checker |
| Marker and terminating semicolon on different physical lines | Grammar can accept; pinned lexer requires one line | Later differential control; closers still must match at column one |

Queued marker state uses Tree-sitter's fixed serialization buffer: at most
`TREE_SITTER_SERIALIZATION_BUFFER_SIZE - 2` pending markers (1022 with current
headers) per statement. Larger headers are refused rather than losing
incremental state. This is an analysis-parser limitation, not a language limit.
Heredoc bodies and ordinary source length have no scanner cap.

No schema names, host handles, catalogs or execution policies are resolved here.
Inner `$return` syntax is not interpreted by the outer grammar.
