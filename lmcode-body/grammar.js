// Lmscript owns body templates; the inherited lmcode grammar stays plain.
const binary = (operand, offset=0) => [
  ['||',1],['&&',2],['==',3],['!=',3],['<',4],['<=',4],['>',4],['>=',4],
  ['+',5],['-',5],['*',6],['/',6],['%',6],
].map(([op,p])=>prec.left(p+offset,seq(field('left',operand),field('operator',op),field('right',operand))));
module.exports=grammar(require('./vendor/lmcode-grammar'),{name:'lmscript_lmcode',rules:{
source_file:$=>$.lmscript_lmcode_body,
lmscript_lmcode_body:$=>seq(repeat(choice($.function_declaration,$._statement)),$.end_of_file),
_primary:($,original)=>choice(original,$.formatted_string),
  // Lmscript body f-strings are single-line double-quoted literals. Braced fields
  // contain ordinary lmcode expressions; doubled braces are literal braces.
  formatted_string:$=>seq('f"',repeat(choice(
   token.immediate(prec(1,/[^{}"\\\r\n]+/)),
   token.immediate(prec(1,/\\[ntr"\\]/)),
   token.immediate(prec(1,choice('{{','}}'))),
   $.formatted_field
  )),'"'),
  formatted_field:$=>seq('{',$._formatted_expression,'}'),
  // A field may contain arbitrarily nested ordinary expressions, but the
  // compiler deliberately rejects a second formatted string in that tree.
  _formatted_expression:$=>choice($.formatted_binary_expression,$.formatted_unary_expression,$.formatted_call_expression,$.formatted_member_expression,$.formatted_parenthesized,$._formatted_primary),
  formatted_binary_expression:$=>choice(...binary($._formatted_expression)),
  formatted_unary_expression:$=>prec(7,seq(field('operator',choice('!','-')),field('argument',$._formatted_expression))),
  formatted_call_expression:$=>prec.left(9,seq(field('function',choice($._name,$.formatted_member_expression)),$.formatted_argument_list)),
  formatted_argument_list:$=>seq('(',commaSep($._formatted_expression),')'),
  formatted_member_expression:$=>prec(10,seq(field('object',$._formatted_expression),'.',field('property',$._name))),
  formatted_parenthesized:$=>seq('(',$._formatted_expression,')'),
  _formatted_primary:$=>choice($._name,$.int_literal,$.float_literal,$.string,$.true,$.false,$.qw_literal,$.qi_literal,$.qf_literal,$.formatted_map_literal,$.heredoc_literal,$.json_literal,$.splice),
  formatted_map_literal:$=>seq('%','(',optional(seq($.formatted_map_entry,repeat(seq(',',$.formatted_map_entry)),optional(','))),')'),
  formatted_map_entry:$=>seq(field('key',choice($._field_name,$.string,$.formatted_parenthesized)),'=>',field('value',$._formatted_expression)),
}});

function commaSep(rule){return optional(seq(rule,repeat(seq(",",rule))));}
