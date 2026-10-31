/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREFIXES = {
  f: ['f', 'F'],
  rf: ['rf', 'fr', 'Rf', 'fR', 'rF', 'Fr', 'RF', 'FR'],
};

module.exports = grammar({
  name: 'lmscript',

  extras: $ => [/\s/, $.comment],

  word: $ => $.identifier,

  externals: $ => [$.block_marker, $.data_body, $.lmcode_body, $.block_closer, $._semicolon, $._block_start, $._error_sentinel],

  conflicts: $ => [
    [$.destruct_statement, $._primary_expression],
  ],

  rules: {
    source_file: $ => repeat($._statement),

    comment: $ => token(choice(
      /#[^\n]*/,
      /\/\/[^\n]*/,
      /\/\*[^*]*\*+([^/*][^*]*\*+)*\//,
    )),

    _statement: $ => choice(
      $.let_statement,
      $.destruct_statement,
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.function_declaration,
      $.return_statement,
      $.break_statement,
      $.continue_statement,
      $.import_statement,
      $.package_statement,
      $.sync_statement,
      $.recover_block,
      $.data_block_statement,
      $.command,
      $.assignment_command_statement,
      $.expression_statement,
      $.block,
    ),

    block: $ => prec(1, seq('{', repeat($._statement), '}')),

    _terminated_value: $ => choice(
      seq($._expression, $._semicolon),
      $.command,
    ),

    let_statement: $ => seq(
      choice('let', 'const'),
      $.identifier,
      '=',
      $._terminated_value,
    ),

    destruct_statement: $ => seq(
      optional('let'),
      choice(
        seq('(', commaSep($.identifier), optional(','), ')'),
        seq('[', commaSep($.identifier), ']'),
      ),
      '=',
      seq($._expression, $._semicolon),
    ),

    if_statement: $ => seq(
      'if', '(', $._expression, ')', $.block,
      repeat(seq('else', 'if', '(', $._expression, ')', $.block)),
      optional(seq('else', $.block)),
    ),

    while_statement: $ => seq('while', '(', $._expression, ')', $.block),

    for_statement: $ => seq('for', '(', choice(
      // for (x in expr)
      seq($.identifier, 'in', $._expression),
      // C-style
      seq(
        optional(choice(
          seq('let', $.identifier, '=', $._expression),
          $._expression,
        )),
        $._semicolon,
        optional($._expression),
        $._semicolon,
        optional($._expression),
      ),
    ), ')', $.block),

    function_declaration: $ => seq(
      choice('fn', 'function'),
      $.identifier,
      $.parameter_list,
      $.block,
    ),

    parameter_list: $ => seq('(', commaSep($.identifier), ')'),

    return_statement: $ => seq('return', choice(
      $._semicolon,
      seq($._expression, $._semicolon),
      $.command,
    )),

    break_statement: $ => seq('break', $._semicolon),
    continue_statement: $ => seq('continue', $._semicolon),

    import_statement: $ => seq(
      'import',
      $.plain_string,
      optional(seq('as', $.identifier)),
      $._semicolon,
    ),

    package_statement: $ => seq('package', $.identifier, $._semicolon),

    sync_statement: $ => seq('sync', choice(
      seq(choice($.identifier, $.member_expression, $.index_expression), '=', $._terminated_value),
      seq($.call_expression, $._semicolon),
    )),

    recover_block: $ => seq('recover', '{', repeat1($.resumepoint), '}'),
    resumepoint: $ => seq('resumepoint', $.identifier, ':', repeat($._statement)),

    // Data-embedding and lmcode/dsl blocks: marker statement, opaque body, closer.
    // The marker may be the whole value, bare, or wrapped in a call (system(_cmd_);,
    // merge(_csv_, _csv_);). Bodies/closers follow the statement in marker order.
    data_block_statement: $ => seq(
      choice($._expression, seq(choice('let', 'const', 'return', 'sync'), $._expression)),
      $._block_start, repeat1(seq(optional(choice($.data_body, $.lmcode_body)), $.block_closer)),
    ),
    marker_expression: $ => prec.right(seq($.block_marker, optional($.identifier), repeat($.block_option))),
    block_option: $ => prec.right(seq($.identifier, '=', $._expression)),
    // Planned descriptor intrinsic: whitespace clauses, not comma arguments.
    load_schema_expression: $ => seq('load_schema', '(', repeat1($.schema_clause), ')'),
    schema_clause: $ => seq(choice('schema', 'cli', 'install'), '=', $.plain_string),

    // Command literals: `system word ...;` / `cmd word ...;`
    command: $ => seq(
      choice('system', 'cmd'),
      repeat1($._command_word),
      $._semicolon,
    ),

    _command_word: $ => seq(
      choice($._command_text_start, $.command_escape, $.command_squote, $.command_dquote, $.command_field),
      repeat($._command_word_cont),
    ),

    command_escape: $ => token(/\\[\s\S]/),

    _command_word_cont: $ => choice(
      token.immediate(/[^\s;'"\\${}()|&<>*?\[\]`]+/),
      token.immediate(/\\[\s\S]/),
      token.immediate(seq("'", /[^'\n]*/, "'")),
      seq(token.immediate('"'), repeat(choice($._command_dq_text, $.command_field)), '"'),
      seq(token.immediate('${'), $._expression, '}'),
    ),

    _command_text_start: $ => token(seq(
      /[^\s;'"\\#${}()|&<>*?\[\]`~]/,
      repeat(choice(/[^\s;'"\\${}()|&<>*?\[\]`]/, /\\[\s\S]/)),
    )),

    command_squote: $ => token(seq("'", /[^'\n]*/, "'")),

    command_dquote: $ => seq(
      '"',
      repeat(choice($._command_dq_text, $.command_field)),
      '"',
    ),

    _command_dq_text: $ => token(repeat1(choice(
      /[^"\\$`\n]/,
      /\\[\\"$`\n]/,
    ))),

    command_field: $ => seq('${', $._expression, '}'),

    expression_statement: $ => seq($._expression, $._semicolon),

    // x = system ...; / x = cmd ...;  (the command carries its own $._semicolon)
    assignment_command_statement: $ => seq(
      choice($.identifier, $.member_expression, $.index_expression),
      '=',
      $.command,
    ),

    // ---- expressions ----

    _expression: $ => choice(
      $.assignment_expression,
      $.ternary_expression,
      $.binary_expression,
      $.unary_expression,
      $._postfix_expression,
      $.parenthesized,
      $.tuple_expression,
    ),

    parenthesized: $ => seq('(', $._expression, ')'),

    tuple_expression: $ => choice(
      seq('(', ')'),
      seq('(', $._expression, ',', optional(seq(commaSep1($._expression), optional(','))), ')'),
    ),

    assignment_expression: $ => prec.right(1, seq(
      choice($.identifier, $.member_expression, $.index_expression),
      '=',
      $._expression,
    )),

    ternary_expression: $ => prec.right(2, seq(
      $._expression, '?', $._expression, ':', $._expression,
    )),

    binary_expression: $ => {
      const table = [
        ['||', 3], ['&&', 4],
        ['==', 5], ['!=', 5],
        ['<', 6], ['<=', 6], ['>', 6], ['>=', 6],
        ['+', 7], ['-', 7],
        ['*', 8], ['/', 8], ['%', 8],
      ];
      return choice(...table.map(([op, p]) =>
        prec.left(p, seq($._expression, op, $._expression))));
    },

    unary_expression: $ => prec(9, seq(choice('!', '-'), $._expression)),

    _postfix_expression: $ => choice(
      $.call_expression,
      $.member_expression,
      $.index_expression,
      $.system_call,
      $._primary_expression,
    ),

    call_expression: $ => prec(10, seq($._postfix_expression, $.argument_list)),
    argument_list: $ => seq('(', commaSep($._expression), ')'),

    member_expression: $ => prec(10, seq(
      $._postfix_expression, '.',
      choice($.identifier, 'system', 'cmd', 'package', 'in'),
    )),

    index_expression: $ => prec(10, seq(
      $._postfix_expression, '[', $._expression, ']',
    )),

    system_call: $ => prec(11, seq(
      'system', token.immediate('('), commaSep($._expression), ')',
    )),

    _primary_expression: $ => choice(
      $.identifier,
      $.marker_expression,
      $.load_schema_expression,
      $.number,
      $.plain_string,
      $.raw_string,
      $.raw_triple_string,
      $.fstring,
      $.raw_fstring,
      $.raw_fstring_triple,
      $.triple_string,
      $.fstring_triple,
      $.path_literal,
      $.list_literal,
      $.map_literal,
      $.true,
      $.false,
      $.null,
    ),

    true: $ => 'true',
    false: $ => 'false',
    null: $ => 'null',

    list_literal: $ => seq('[', commaSep($._expression), ']'),

    map_literal: $ => seq('{', commaSep($.map_pair), '}'),
    map_pair: $ => seq(
      choice($.identifier, $.plain_string, 'system', 'cmd', 'package', 'in'),
      ':',
      $._expression,
    ),

    number: $ => token(choice(/\d+(\.\d+)?/, /\.\d+/)),

    identifier: $ => /[A-Za-z_][A-Za-z0-9_]*/,

    plain_string: $ => choice(
      token(seq('"', repeat(choice(/[^"\\\n]/, /\\[\s\S]/)), '"')),
      token(seq("'", repeat(choice(/[^'\\\n]/, /\\[\s\S]/)), "'")),
    ),

    raw_string: $ => token(choice(
      seq(/[rR]"/, /[^"\n]*/, '"'),
      seq(/[rR]'/, /[^'\n]*/, "'"),
    )),

    fstring: $ => choice(
      seq(
        token(choice(...PREFIXES.f.map(p => p + '"'))),
        repeat(choice($._fstring_dq_text, $.fstring_field)),
        token('"'),
      ),
      seq(
        token(choice(...PREFIXES.f.map(p => p + "'"))),
        repeat(choice($._fstring_sq_text, $.fstring_field)),
        token("'"),
      ),
    ),

    _fstring_dq_text: $ => token(prec(1, repeat1(choice(
      /[^{}\\"\n]/, /\\[^{}]/, /\\/, '{{', '}}',
    )))),
    _fstring_sq_text: $ => token(prec(1, repeat1(choice(
      /[^{}\\'\n]/, /\\[^{}]/, /\\/, '{{', '}}',
    )))),

    raw_fstring: $ => choice(
      seq(token(choice(...PREFIXES.rf.map(p => p + '"'))), repeat(choice($._raw_f_dq_text, $.fstring_field)), '"'),
      seq(token(choice(...PREFIXES.rf.map(p => p + "'"))), repeat(choice($._raw_f_sq_text, $.fstring_field)), "'"),
    ),
    _raw_f_dq_text: $ => token.immediate(repeat1(choice(/[^"{}\n]/, '{{', '}}'))),
    _raw_f_sq_text: $ => token.immediate(repeat1(choice(/[^'{}\n]/, '{{', '}}'))),
    raw_fstring_triple: $ => choice(
      seq(token(choice(...PREFIXES.rf.map(p => p + '"""'))), repeat(choice(token.immediate(repeat1(choice(/[^"{}]/, '{{', '}}'))), token.immediate(prec(-1, '"')), $.fstring_field)), token('"""')),
      seq(token(choice(...PREFIXES.rf.map(p => p + "'".repeat(3)))), repeat(choice(token.immediate(repeat1(choice(/[^'{}]/, '{{', '}}'))), token.immediate(prec(-1, "'")), $.fstring_field)), token("'".repeat(3))),
    ),
    fstring_field: $ => seq('{', $._expression, '}'),

    triple_string: $ => choice(
      seq(token('"""'), repeat(choice(token.immediate(/[^"\\]+/), token.immediate(/\\[\s\S]/), token.immediate(prec(-1, '"')))), token('"""')),
      seq(token("'".repeat(3)), repeat(choice(token.immediate(/[^'\\]+/), token.immediate(/\\[\s\S]/), token.immediate(prec(-1, "'")))), token("'".repeat(3))),
    ),
    fstring_triple: $ => choice(
      seq(token(choice(...PREFIXES.f.map(p => p + '"""'))), repeat(choice($._triple_f_dq_text, token.immediate(prec(-1, '"')), $.fstring_field)), token('"""')),
      seq(token(choice(...PREFIXES.f.map(p => p + "'".repeat(3)))), repeat(choice($._triple_f_sq_text, token.immediate(prec(-1, "'")), $.fstring_field)), token("'".repeat(3))),
    ),
    _triple_f_dq_text: $ => token.immediate(repeat1(choice(/[^"{}\\]/, /\\[^{}]/, /\\/, '{{', '}}'))),
    _triple_f_sq_text: $ => token.immediate(repeat1(choice(/[^'{}\\]/, /\\[^{}]/, /\\/, '{{', '}}'))),

    path_literal: $ => token(seq('path', choice(
      seq('"', /[^"\n]*/, '"'),
      seq("'", /[^'\n]*/, "'"),
    ))),

    raw_triple_string: $ => choice(
      seq(token(/[rR]"""/), repeat(choice(token.immediate(/[^"]+/), token.immediate(prec(-1, '"')))), token('"""')),
      seq(token(/[rR]'''/), repeat(choice(token.immediate(/[^']+/), token.immediate(prec(-1, "'")))), token("'".repeat(3))),
    ),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
