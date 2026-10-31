#include "tree_sitter/parser.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Only marker order survives token boundaries. A body is one token, so its
 * heredoc queue is local. Serialized state is required for incremental edits. */
enum TokenType { BLOCK_MARKER, DATA_BODY, LMCODE_BODY, BLOCK_CLOSER, SEMICOLON, BLOCK_START, ERROR_SENTINEL };
static const char *markers[] = {"_csv_","_toml_","_props_","_json_","_cmd_","_graphql_","_dsl_","_lmcode_"};
#define QUEUE_SIZE (TREE_SITTER_SERIALIZATION_BUFFER_SIZE - 2)
typedef struct { unsigned count; unsigned char queue[QUEUE_SIZE]; } Scanner;
typedef struct Here { char *tag; bool dedent; struct Here *next; } Here;
void *tree_sitter_lmscript_external_scanner_create(void) { return calloc(1,sizeof(Scanner)); }
void tree_sitter_lmscript_external_scanner_destroy(void *p) { free(p); }
unsigned tree_sitter_lmscript_external_scanner_serialize(void *p,char *b) {
  Scanner *s=p; b[0]=(char)(s->count>>8); b[1]=(char)s->count;
  memcpy(b+2,s->queue,s->count); return s->count+2;
}
void tree_sitter_lmscript_external_scanner_deserialize(void *p,const char *b,unsigned n) {
  Scanner *s=p; s->count=0;
  if(n<2)return;
  unsigned count=((unsigned char)b[0]<<8)|(unsigned char)b[1];
  if(count>QUEUE_SIZE||n!=count+2)return;
  for(unsigned i=0;i<count;i++)if((unsigned char)b[i+2]>=8)return;
  s->count=count;memcpy(s->queue,b+2,count);
}
static bool word(int32_t c) {return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_';}
static void free_heres(Here *h) {while(h){Here *next=h->next;free(h->tag);free(h);h=next;}}
static bool closer(const char *line,unsigned id) {
  if(strncmp(line,"end",3))return false;
  const char *p=line+3;if(*p!=' '&&*p!='\t')return false;
  while(*p==' '||*p=='\t')p++;
  size_t n=strlen(markers[id]);if(strncmp(p,markers[id],n))return false;p+=n;
  while(*p==' '||*p=='\t')p++;
  return !*p;
}
static bool closer_like(const char *line) {
  while(*line==' '||*line=='\t')line++;
  if(strncmp(line,"end",3))return false;line+=3;
  if(*line!=' '&&*line!='\t')return false;
  while(*line==' '||*line=='\t')line++;
  if(*line++!='_')return false;
  while(word((unsigned char)*line)) {if(*line=='_')return true;line++;}
  return false;
}
typedef struct { unsigned depth; char quote; bool triple, escaped; } Fields;
static void fields_line(Fields *f,const char *line) {
  for(size_t i=0;line[i];i++) {
    char c=line[i];
    if(!f->depth){if(c=='$'&&line[i+1]=='{'){f->depth=1;i++;}continue;}
    if(f->quote){
      if(f->escaped){f->escaped=false;continue;}
      if(c=='\\'){f->escaped=true;continue;}
      if(c==f->quote&&(!f->triple||(line[i+1]==c&&line[i+2]==c))){if(f->triple)i+=2;f->quote=0;}
      continue;
    }
    if(c=='"'||c=='\''){f->quote=c;f->triple=line[i+1]==c&&line[i+2]==c;if(f->triple)i+=2;}
    else if(c=='{')f->depth++;
    else if(c=='}')f->depth--;
  }
  f->escaped=false;
}
static Here *openers(const char *line) {
  Here *head=NULL,**tail=&head;char quote=0;bool escaped=false;unsigned field=0;
  for(size_t i=0;line[i];i++) {
    char c=line[i];
    if(quote){if(escaped)escaped=false;else if(c=='\\')escaped=true;else if(c==quote)quote=0;continue;}
    if(c=='"'||c=='\''){quote=c;continue;}
    if(c=='#')break;
    if(c=='$'&&line[i+1]=='{'){field++;i++;continue;}
    if(field){if(c=='{')field++;else if(c=='}')field--;continue;}
    if(c!='<'||line[i+1]!='<')continue;
    size_t at=i+2;bool dedent=line[at]=='~';if(dedent)at++;
    if(!((line[at]>='A'&&line[at]<='Z')||(line[at]>='a'&&line[at]<='z')||line[at]=='_'))continue;
    size_t start=at;while(word((unsigned char)line[at]))at++;
    if(line[at]&&!strchr(" \t\r,)]};",line[at]))continue;
    Here *h=calloc(1,sizeof(Here));if(!h){free_heres(head);return NULL;}
    h->tag=malloc(at-start+1);if(!h->tag){free(h);free_heres(head);return NULL;}
    memcpy(h->tag,line+start,at-start);h->tag[at-start]=0;h->dedent=dedent;*tail=h;tail=&h->next;i=at-1;
  }
  return head;
}
bool tree_sitter_lmscript_external_scanner_scan(void *payload,TSLexer *lexer,const bool *valid) {
  Scanner *s=payload;
  /* Recovery probes must not enqueue phantom markers. */
  if(valid[ERROR_SENTINEL])return false;
  if(valid[SEMICOLON]||valid[BLOCK_START]) {
    while(lexer->lookahead==' '||lexer->lookahead=='\t'||lexer->lookahead=='\r'||lexer->lookahead=='\n')lexer->advance(lexer,true);
    if(lexer->lookahead==';') {
      unsigned symbol=s->count?BLOCK_START:SEMICOLON;
      if(!valid[symbol])return false;
      lexer->advance(lexer,false);lexer->mark_end(lexer);lexer->result_symbol=symbol;return true;
    }
  }
  if(valid[BLOCK_MARKER] && !(s->count && (valid[DATA_BODY]||valid[LMCODE_BODY]||valid[BLOCK_CLOSER]))) {
    while(lexer->lookahead==' '||lexer->lookahead=='\t'||lexer->lookahead=='\r'||lexer->lookahead=='\n')lexer->advance(lexer,true);
    if(lexer->lookahead!='_')return false;
    char name[16];size_t n=0;
    while(word(lexer->lookahead)){if(n>=sizeof(name)-1)return false;name[n++]=(char)lexer->lookahead;lexer->advance(lexer,false);}name[n]=0;
    for(unsigned i=0;i<8;i++)if(!strcmp(name,markers[i])){
      if(s->count==QUEUE_SIZE)return false;
      s->queue[s->count++]=(unsigned char)i;lexer->mark_end(lexer);lexer->result_symbol=BLOCK_MARKER;return true;
    }
    return false;
  }
  if(!s->count)return false;
  unsigned body=s->queue[0]>=6?LMCODE_BODY:DATA_BODY;
  if(!valid[body]&&!valid[BLOCK_CLOSER])return false;
  /* The statement's newline is not part of the injected language range. */
  if(lexer->get_column(lexer)!=0) {
    while(lexer->lookahead==' '||lexer->lookahead=='\t')lexer->advance(lexer,true);
    if(lexer->lookahead=='#'||lexer->lookahead=='/')while(!lexer->eof(lexer)&&lexer->lookahead!='\r'&&lexer->lookahead!='\n')lexer->advance(lexer,true);
    if(lexer->lookahead=='\r')lexer->advance(lexer,true);
    if(lexer->lookahead!='\n'&&!lexer->eof(lexer))return false;
    if(lexer->lookahead=='\n')lexer->advance(lexer,true);
  }
  bool consumed=false;Here *heres=NULL;Fields fields={0};
  while(!lexer->eof(lexer)) {
    lexer->mark_end(lexer);
    size_t size=0,cap=128;char *line=malloc(cap);if(!line){free_heres(heres);return false;}
    while(!lexer->eof(lexer)&&lexer->lookahead!='\r'&&lexer->lookahead!='\n') {
      if(size+1==cap){cap*=2;char *next=realloc(line,cap);if(!next){free(line);free_heres(heres);return false;}line=next;}
      line[size++]=lexer->lookahead<128?(char)lexer->lookahead:'?';lexer->advance(lexer,false);
    }
    line[size]=0;
    if(!heres&&!fields.depth&&closer(line,s->queue[0])) {
      free(line);
      if(consumed){if(!valid[body])return false;lexer->result_symbol=body;return true;}
      if(!valid[BLOCK_CLOSER])return false;
      lexer->mark_end(lexer);memmove(s->queue,s->queue+1,--s->count);lexer->result_symbol=BLOCK_CLOSER;return true;
    }
    if(!heres && !fields.depth && closer_like(line)){free(line);return false;}
    if(heres){const char *p=line;if(heres->dedent)while(*p==' '||*p=='\t')p++;if(!strcmp(p,heres->tag)){Here *old=heres;heres=old->next;free(old->tag);free(old);}}
    else {if(body==LMCODE_BODY&&!fields.depth)heres=openers(line);fields_line(&fields,line);}
    free(line);
    if(lexer->lookahead=='\r')lexer->advance(lexer,false);
    if(lexer->lookahead=='\n')lexer->advance(lexer,false);
    consumed=true;
  }
  free_heres(heres);return false;
}
