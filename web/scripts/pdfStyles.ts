import postcss from 'postcss';

/** Split selector lists without splitting commas in :is(), :has(), or attributes. */
function selectors(value:string):string[]{
  const result:string[]=[];let start=0,depth=0,quote='';
  for(let i=0;i<value.length;i++){
    const ch=value[i];if(ch==='\\'){i++;continue}
    if(quote){if(ch===quote)quote='';continue}
    if(ch==='"'||ch==="'"){quote=ch;continue}
    if(ch==='('||ch==='[')depth++;
    else if(ch===')'||ch===']')depth--;
    else if(ch===','&&depth===0){result.push(value.slice(start,i).trim());start=i+1}
  }
  result.push(value.slice(start).trim());return result;
}

/** Vendor UI classes and root variables must never style the surrounding app. */
export function scopePdfStyles(source:string):string{
  const css=postcss.parse(source);
  css.walkRules(rule=>{
    for(let parent=rule.parent;parent;parent=parent.parent){
      // Nested CSS inherits the scoped parent; keyframe steps aren't selectors.
      if(parent.type==='rule'||(parent.type==='atrule'&&/keyframes$/i.test(parent.name)))return;
    }
    rule.selector=selectors(rule.selector).map(selector=>
      /^:root\b/.test(selector)?selector.replace(/^:root\b/,'.pdf-reader'):`:where(.pdf-reader) ${selector}`,
    ).join(',\n');
  });
  return css.toString();
}
