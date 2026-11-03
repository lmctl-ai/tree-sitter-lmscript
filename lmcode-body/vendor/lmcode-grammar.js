// Copyright (c) 2026 Lattice Systems LLC. MIT licensed.
// Syntax only: schema resolution, type checking and function/control-flow
// validity remain the handwritten compiler's responsibility.
const KEYWORDS = ['let','if','else','true','false','for','in','range','fn','return',
  'switch','case','default','while','break','continue','implements'];
const binary = (operand, offset=0) => [
  ['||',1],['&&',2],['==',3],['!=',3],['<',4],['<=',4],['>',4],['>=',4],
  ['+',5],['-',5],['*',6],['/',6],['%',6],
].map(([op,p])=>prec.left(p+offset,seq(field('left',operand),field('operator',op),field('right',operand))));
module.exports = grammar({
 name:'lmcode',
 extras:$=>[/[ \t\r\n]/,$.comment,$.heredoc_body,$.splice_comment],
 word:$=>$.identifier,
 reserved:{global:$=>[],splice:$=>[$._splice_reserved]},
 externals:$=>[$.heredoc_start,$.heredoc_body,$.qw_word,$.qi_word,$.qf_word,$.end_of_file,$.splice_start,$.splice_end,$.splice_comment],
 conflicts:$=>[[$._name,$.null]],
 rules:{
  source_file:$=>seq(repeat(choice($.function_declaration,$._statement)),$.end_of_file),
  _splice_reserved:$=>token(choice(...['fn','function','let','const','if','else','while','for','return','break','continue','parallel','parallel_map','sync','import','recover','resumepoint','_csv_','_toml_','_props_','_json_','_cmd_','_graphql_','_dsl_','_lmcode_'])),
  comment:$=>token(/#[^\r\n]*/),
  identifier:$=>/[A-Za-z_][A-Za-z0-9_]*/,
  _name:$=>choice($.identifier,alias(choice('qw','qi','qf','json','null'),$.identifier)),
  _field_name:$=>choice($._name,alias(choice(...KEYWORDS),$.identifier)),
  function_declaration:$=>seq(optional($.annotation),'fn',field('name',$._name),
   '(',commaSep($.parameter),')','-', '>',field('return_type',$.type),optional($.implements_clause),field('body',$.function_body)),
  annotation:$=>seq('@',field('name',$._field_name)),
  implements_clause:$=>seq('implements',field('interface',$._name)),
  parameter:$=>seq(field('name',$._name),':',field('type',$.type)),
  type:$=>$._name,
  function_body:$=>seq('{',repeat($._statement),optional($.return_statement),'}'),
  block:$=>seq('{',repeat($._statement),'}'),
  _statement:$=>choice($.let_statement,$.assignment_statement,$.return_assignment,$.if_statement,
   $.for_statement,$.while_statement,$.switch_statement,$.break_statement,$.continue_statement,$.expression_statement),
  let_statement:$=>seq('let',field('name',$._name),'=',field('value',$._expression),';'),
  assignment_statement:$=>seq(field('left',$._name),'=',field('right',$._expression),';'),
  return_assignment:$=>seq(field('target',$.return_target),'=',field('value',choice(prec(1,$.null),$._expression)),';'),
  return_target:$=>seq('$','return',optional(choice(seq('.',field('field',$._field_name)),seq('[',field('index',$._expression),']')))),
  null:$=>'null',
  if_statement:$=>seq('if','(',field('condition',$._expression),')',field('consequence',$.block),optional(seq('else',field('alternative',choice($.block,$.if_statement))))),
  for_statement:$=>seq('for','(',field('variable',$._name),'in',field('iterable',choice($.range_expression,$._expression)),')',field('body',$.block)),
  range_expression:$=>seq('range','(',$._expression,',',$._expression,')'),
  while_statement:$=>seq('while','(',field('condition',$._expression),')',field('body',$.block)),
  switch_statement:$=>seq('switch','(',field('value',$._expression),')','{',choice(seq(repeat1($.switch_case),optional($.default_case)),$.default_case),'}'),
  switch_case:$=>seq('case',field('value',choice(seq(optional('-'),$.int_literal),$.string,$.member_expression)),':',field('body',$.block)),
  default_case:$=>seq('default',':',field('body',$.block)),
  return_statement:$=>seq('return',field('value',$._expression),';'),
  break_statement:$=>seq('break',';'),continue_statement:$=>seq('continue',';'),
  expression_statement:$=>seq($._expression,';'),
  _expression:$=>choice($.binary_expression,$.unary_expression,$.call_expression,$.member_expression,$.parenthesized,$._primary),
  parenthesized:$=>seq('(',$._expression,')'),
  binary_expression:$=>choice(...binary($._expression)),
  unary_expression:$=>prec(7,seq(field('operator',choice('!','-')),field('argument',$._expression))),
  call_expression:$=>prec.left(9,seq(field('function',choice($._name,$.member_expression)),$.argument_list)),
  argument_list:$=>seq('(',commaSep($._expression),')'),
  member_expression:$=>prec(10,seq(field('object',$._expression),'.',field('property',$._name))),
  _primary:$=>choice($._name,$.int_literal,$.float_literal,$.string,$.true,$.false,$.qw_literal,$.qi_literal,$.qf_literal,$.map_literal,$.heredoc_literal,$.json_literal,$.splice),
  int_literal:$=>/[0-9]+/,
  float_literal:$=>/[0-9]+\.[0-9]+/,
  string:$=>token(seq('"',repeat(choice(/[^"\\\r\n]/,/\\[ntr"\\]/)),'"')),
  true:$=>'true',false:$=>'false',
  qw_literal:$=>seq('qw',token.immediate('('),repeat(choice($.qw_word,$._quote_space)),')'),
  qi_literal:$=>seq('qi',token.immediate('('),repeat(choice($.qi_word,$._quote_space)),')'),
  qf_literal:$=>seq('qf',token.immediate('('),repeat(choice($.qf_word,$._quote_space)),')'),
  _quote_space:$=>/[\f\v]+/,
  map_literal:$=>seq('%','(',optional(seq($.map_entry,repeat(seq(',',$.map_entry)),optional(','))),')'),
  map_entry:$=>seq(field('key',choice($._field_name,$.string,$.parenthesized)), '=>',field('value',$._expression)),
  heredoc_literal:$=>$.heredoc_start,
  json_literal:$=>seq('json',$.heredoc_literal),
  // Splice payload is an outer LMScript expression, not an opaque [^}]* token.
  splice:$=>seq($.splice_start,field('expression',$._splice_expression),$.splice_end),
  _splice_identifier:$=>reserved('splice',$.identifier),
  _splice_field_name:$=>choice($._splice_identifier,alias(choice('system','cmd'),$.identifier)),
  _splice_expression:$=>choice($._splice_identifier,$.int_literal,$.float_literal,$.true,$.false,$.null,
   $.splice_string,$.splice_raw_string,$.splice_triple_string,$.splice_fstring,$.splice_triple_fstring,$.splice_path,$.splice_fraction,$.splice_system_call,$.splice_list,$.splice_object,$.splice_call,$.splice_member,$.splice_index,
   $.splice_binary,$.splice_unary,$.splice_conditional,$.splice_parenthesized),
  splice_string:$=>choice(...['"',"'"].map(q=>token(seq(q,repeat(choice(new RegExp('[^'+q+'\\\\\\r\\n]'),/\\[\s\S]/)),q)))),
  splice_list:$=>seq('[',commaSep($._splice_expression),']'),
  splice_object:$=>seq('{',commaSep($.splice_pair),'}'),
  splice_pair:$=>seq(field('key',choice($._splice_field_name,$.splice_string)),':',field('value',$._splice_expression)),
  splice_call:$=>prec(11,seq(field('function',choice($._splice_identifier,$.splice_member)),'(',commaSep($._splice_expression),')')),
  splice_member:$=>prec(11,seq($._splice_expression,'.',$._splice_field_name)),
  splice_index:$=>prec(11,seq($._splice_expression,'[',$._splice_expression,']')),
  splice_binary:$=>choice(...binary($._splice_expression,2)),
  splice_unary:$=>prec(10,seq(choice('!','-'),$._splice_expression)),
  splice_conditional:$=>prec.right(2,seq($._splice_expression,'?',$._splice_expression,':',$._splice_expression)),
  splice_parenthesized:$=>seq('(',optional(seq($._splice_expression,repeat(seq(',',$._splice_expression)),optional(','))),')'),
  splice_fraction:$=>/\.[0-9]+/,
  splice_system_call:$=>seq('system','(',commaSep($._splice_expression),')'),
  splice_raw_string:$=>choice(...['"',"'"].map(q=>token(seq(choice('r'+q,'R'+q),repeat(choice(new RegExp('[^'+q+'\\\\\\r\\n]'),/\\[\s\S]/)),q)))),
  splice_path:$=>choice(...['"',"'"].map(q=>token(seq('path'+q,new RegExp('[^'+q+'\\r\\n]*'),q)))),
  splice_triple_string:$=>choice(...['"',"'"].map(q=>triple($,q,false))),
  splice_fstring:$=>choice(...['"',"'"].map(q=>formatted($,q,false))),
  splice_triple_fstring:$=>choice(...['"',"'"].map(q=>formatted($,q,true))),
  splice_interpolation:$=>seq('{',$._splice_expression,'}'),
 }
});
function commaSep(rule){return optional(commaSep1(rule))}
function commaSep1(rule){return seq(rule,repeat(seq(',',rule)))}

function triple($,q){
 const delimiter=q.repeat(3);
 return seq(token(choice(delimiter,'r'+delimiter,'R'+delimiter)),repeat(choice(
  token.immediate(prec(1,new RegExp('[^'+q+'\\\\]+'))),token.immediate(prec(1,/\\[\s\S]/)),token.immediate(prec(-1,q))
 )),token.immediate(delimiter));
}
function formatted($,q,multiline){
 const delimiter=multiline?q.repeat(3):q;
 const prefixes=['f','F','rf','rF','Rf','RF','fr','fR','Fr','FR'];
 return seq(token(choice(...prefixes.map(p=>p+delimiter))),repeat(choice(
  token.immediate(prec(1,new RegExp('[^{}'+q+'\\\\'+(multiline?'':'\\r\\n')+']+'))),
  token.immediate(prec(1,/\\[^{}]/)),token.immediate('\\'),
  token.immediate(prec(1,choice('{{','}}'))),$.splice_interpolation,
  ...(multiline?[token.immediate(prec(-1,q))]:[])
 )),token.immediate(delimiter));
}
