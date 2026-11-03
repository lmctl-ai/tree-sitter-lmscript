/* Copyright (c) 2026 Lattice Systems LLC. MIT licensed. */
#include "tree_sitter/parser.h"
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

enum Token { HEREDOC_START, HEREDOC_BODY, QW_WORD, QI_WORD, QF_WORD, END_OF_FILE, SPLICE_START, SPLICE_END, SPLICE_COMMENT };
/* FIFO of (uint16 length, dedent byte, tag). No pointers enter serialized state.
 * Fail closed on the tree-sitter serialization capacity, never truncate a tag. */
typedef struct { uint16_t used; bool splice; unsigned char queue[TREE_SITTER_SERIALIZATION_BUFFER_SIZE-3]; } Scanner;
static bool first(int32_t c){return (c>='A'&&c<='Z')||(c>='a'&&c<='z')||c=='_';}
static bool ident(int32_t c){return first(c)||(c>='0'&&c<='9');}
static bool space(int32_t c){return c==' '||c=='\t'||c=='\n'||c=='\r'||c=='\f'||c=='\v';}
static bool digit(int32_t c){return c>='0'&&c<='9';}
static void next(TSLexer *l){l->advance(l,false);}
void *tree_sitter_lmscript_lmcode_external_scanner_create(void){return calloc(1,sizeof(Scanner));}
void tree_sitter_lmscript_lmcode_external_scanner_destroy(void *p){free(p);}
unsigned tree_sitter_lmscript_lmcode_external_scanner_serialize(void *p,char *buffer){
 Scanner *s=p;buffer[0]=(char)s->splice;buffer[1]=(char)(s->used>>8);buffer[2]=(char)s->used;memcpy(buffer+3,s->queue,s->used);return s->used+3;
}
void tree_sitter_lmscript_lmcode_external_scanner_deserialize(void *p,const char *buffer,unsigned size){
 Scanner *s=p;s->used=0;s->splice=false;if(size<3||(unsigned char)buffer[0]>1)return;
 unsigned n=((unsigned char)buffer[1]<<8)|(unsigned char)buffer[2];
 if(n+3!=size||n>sizeof(s->queue))return;
 for(unsigned at=0;at<n;){if(n-at<3)return;unsigned len=((unsigned char)buffer[at+3]<<8)|(unsigned char)buffer[at+4];
  if(!len||len>n-at-3||(unsigned char)buffer[at+5]>1)return;
  for(unsigned i=0;i<len;i++)if(!(i?ident((unsigned char)buffer[at+6+i]):first((unsigned char)buffer[at+6+i])))return;
  at+=len+3;
 }
 memcpy(s->queue,buffer+3,n);s->used=(uint16_t)n;s->splice=buffer[0]!=0;
}
static bool body(Scanner *s,TSLexer *l){
 if(l->lookahead=='\r'){next(l);if(l->lookahead!='\n')return false;}
 if(l->lookahead!='\n')return false;
 next(l);
 unsigned length=(s->queue[0]<<8)|s->queue[1];bool dedent=s->queue[2]!=0;
 while(!l->eof(l)){
  if(dedent)while(l->lookahead==' '||l->lookahead=='\t')next(l);
  unsigned at=0;while(at<length&&l->lookahead==s->queue[3+at]){next(l);at++;}
  bool matched=at==length;
  if(matched&&l->lookahead=='\r'){next(l);matched=l->lookahead=='\n'||l->eof(l);}
  if(matched&&(l->lookahead=='\n'||l->eof(l))){
   l->mark_end(l);l->result_symbol=HEREDOC_BODY;
   memmove(s->queue,s->queue+length+3,s->used-length-3);s->used-=(uint16_t)(length+3);return true;
  }
  while(!l->eof(l)&&l->lookahead!='\n')next(l);
  if(!l->eof(l))next(l);
 }
 return false;
}
static bool word(TSLexer *l,enum Token kind){
 bool consumed=false;int32_t previous=0;
 if(kind==QW_WORD){
  while(!l->eof(l)&&!space(l->lookahead)&&l->lookahead!=')'&&l->lookahead!='#'){
   int32_t c=l->lookahead;
   if(c=='('||c=='\''||c=='"'||c=='\\'||c<32||c==127||(previous=='$'&&c=='{')||(previous=='<'&&c=='<'))return false;
   previous=c;next(l);consumed=true;
  }
 }else{
  if(l->lookahead=='-')next(l);
  if(l->lookahead=='0')next(l);
  else{if(l->lookahead<'1'||l->lookahead>'9')return false;while(digit(l->lookahead))next(l);}
  if(kind==QF_WORD&&l->lookahead=='.'){next(l);if(!digit(l->lookahead))return false;while(digit(l->lookahead))next(l);}
  if(kind==QF_WORD&&(l->lookahead=='e'||l->lookahead=='E')){next(l);if(l->lookahead=='+'||l->lookahead=='-')next(l);if(!digit(l->lookahead))return false;while(digit(l->lookahead))next(l);}
  if(!l->eof(l)&&!space(l->lookahead)&&l->lookahead!=')'&&l->lookahead!='#')return false;
  consumed=true;
 }
 if(!consumed)return false;
 l->mark_end(l);l->result_symbol=kind;return true;
}
bool tree_sitter_lmscript_lmcode_external_scanner_scan(void *p,TSLexer *l,const bool *valid){
 Scanner *s=p;
 /* Scanner state is meaningful only in normal parses, not all-token recovery. */
 if(valid[END_OF_FILE]&&valid[HEREDOC_START]&&valid[QW_WORD])return false;
 if(s->used&&!s->splice&&valid[HEREDOC_BODY]){
  while(l->lookahead==' '||l->lookahead=='\t')l->advance(l,true);
  if(l->lookahead=='\n'||l->lookahead=='\r')return body(s,l);
 }
 while(space(l->lookahead))l->advance(l,true);
 if(l->eof(l)&&valid[END_OF_FILE]&&!s->used&&!s->splice){l->result_symbol=END_OF_FILE;return true;}
 if(valid[SPLICE_START]&&l->lookahead=='$'){
  next(l);if(l->lookahead!='{')return false;next(l);l->mark_end(l);s->splice=true;l->result_symbol=SPLICE_START;return true;
 }
 if(valid[SPLICE_END]&&l->lookahead=='}'){next(l);l->mark_end(l);s->splice=false;l->result_symbol=SPLICE_END;return true;}
 if(s->splice&&valid[SPLICE_COMMENT]&&l->lookahead=='/'){
  next(l);
  if(l->lookahead=='/'){while(!l->eof(l)&&l->lookahead!='\n'&&l->lookahead!='\r')next(l);}
  else if(l->lookahead=='*'){next(l);bool closed=false;while(!l->eof(l)){if(l->lookahead=='*'){next(l);if(l->lookahead=='/'){next(l);closed=true;break;}}else next(l);}if(!closed)return false;}
  else return false;
  l->mark_end(l);l->result_symbol=SPLICE_COMMENT;return true;
 }
 if(valid[HEREDOC_START]&&l->lookahead=='<'){
  next(l);if(l->lookahead!='<')return false;next(l);
  unsigned char dedent=0;if(l->lookahead=='~'){dedent=1;next(l);}
  if(!first(l->lookahead))return false;
  unsigned char tag[TREE_SITTER_SERIALIZATION_BUFFER_SIZE];unsigned length=0;
  while(ident(l->lookahead)){if(length+3+s->used>=sizeof(s->queue))return false;tag[length++]=(unsigned char)l->lookahead;next(l);}
  if(!l->eof(l)&&!space(l->lookahead)&&l->lookahead!=','&&l->lookahead!=')'&&l->lookahead!=']'&&l->lookahead!='}'&&l->lookahead!=';')return false;
  l->mark_end(l);l->result_symbol=HEREDOC_START;
  s->queue[s->used++]=(unsigned char)(length>>8);s->queue[s->used++]=(unsigned char)length;s->queue[s->used++]=dedent;
  memcpy(s->queue+s->used,tag,length);s->used+=(uint16_t)length;return true;
 }
 if(valid[QW_WORD])return word(l,QW_WORD);
 if(valid[QI_WORD])return word(l,QI_WORD);
 if(valid[QF_WORD])return word(l,QF_WORD);
 return false;
}
