/* Local ranking for OCR. Numeric variants must agree; suggestions never submit. */
(function (root) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = value => normalize(value).replace(/(\d)\s+(kg|ml|mg|gr|cm|mm|lt|g|l)\b/g,'$1$2').match(/[a-z0-9]+/g) || [];
  const ignored = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'lo', 'al', 'con', 'para', 'por', 'un', 'una', 'unos', 'unas', 'y', 'en', 'und', 'unidad', 'unidades']);
  function similar(a, b) {
    if (a === b) return 1;
    // Correct visual OCR substitutions only against an alphabetic catalog word.
    // Codes and quantities never pass through this correction.
    if (/^[a-z]{4,}$/.test(a) && (b.match(/[a-z]/g)||[]).length>=3 && (b.match(/[0158]/g)||[]).length<=2) {
      const corrected=b.replace(/[0158]/g,c=>({'0':'o','1':'i','5':'s','8':'b'}[c]));
      if(corrected===a)return .94;
    }
    if (/\d/.test(a + b) || Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return 0;
    // One insertion, deletion, substitution or transposition in a word.
    if (a.length === b.length) {
      const different = [...a].map((c, i) => c !== b[i] ? i : -1).filter(i => i >= 0);
      if (different.length === 1) return .72;
      if (different.length === 2 && different[1] === different[0] + 1 && a[different[0]] === b[different[1]] && a[different[1]] === b[different[0]]) return .72;
      return 0;
    }
    const shorter = a.length < b.length ? a : b, longer = a.length < b.length ? b : a;
    let i = 0, j = 0, skips = 0;
    while (i < shorter.length && j < longer.length) {
      if (shorter[i] === longer[j]) { i++; j++; } else { skips++; j++; }
    }
    return skips <= 1 ? .72 : 0;
  }
  function rank(products, text) {
    return weightedOcrRank(products,text);
  }
  function confident(matches) {
    const first=matches[0],second=matches[1];
    if(!first)return null;
    if(first.exactCode)return second?.exactCode ? null : first.product;
    const safe=first.confidence==='high'&&first.evidence>=2;
    return safe&&(!second||first.score-second.score>=10)?first.product:null;
  }
  // Voice suggestions are independent of the OCR ranking and confidence rules.
  function voiceRankBase(products, text) {
    return weightedVoiceRank(products, text, 12);
  }
  const numberWords = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciseis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidos','veintitres','veinticuatro','veinticinco','veintiseis','veintisiete','veintiocho','veintinueve'];
  function spokenNumber(value) {
    const text=normalize(value).trim().replace(/\b(un|una)\b/g,'uno');
    if(/^\d+(?:[.,]\d+)?$/.test(text))return Number(text.replace(',','.'));
    const parts=text.split(/\s+/), tens={treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90};
    if(parts.includes('mil')) {
      const split=parts.indexOf('mil'), before=parts.slice(0,split).join(' '), after=parts.slice(split+1).join(' ');
      if(after.includes('mil'))return null;
      const thousands=before?spokenNumber(before):1, rest=after?spokenNumber(after):0;
      return thousands!==null&&thousands>0&&thousands<1000&&rest!==null&&rest<1000?thousands*1000+rest:null;
    }
    if(parts.length===1 && numberWords.includes(text))return numberWords.indexOf(text);
    if(parts.length===1 && tens[text])return tens[text];
    if(parts.length===3 && tens[parts[0]] && parts[1]==='y' && numberWords.indexOf(parts[2])>0 && numberWords.indexOf(parts[2])<10)return tens[parts[0]]+numberWords.indexOf(parts[2]);
    if(text==='cien')return 100;
    const hundreds={ciento:100,doscientos:200,trescientos:300,cuatrocientos:400,quinientos:500,seiscientos:600,setecientos:700,ochocientos:800,novecientos:900};
    if(hundreds[parts[0]]) { const rest=parts.slice(1).join(' '), n=rest?spokenNumber(rest):0; return n!==null&&n<100?hundreds[parts[0]]+n:null; }
    return null;
  }
  function parseMaster(text) {
    const original=String(text||'').slice(0,300).trim();
    const clean=normalize(original).replace(/[.!?;]+$/g,'').trim();
    const unit=clean.match(/\s+(unidad(?:es)?|unds?|paquetes?|packs?|cajas?|piezas?|botellas?|bolsas?|rollos?|sacos?|bidones?|gal(?:on|ones)|palos?|tachos?|baldes?|latas?|frascos?|par(?:es)?)$/);
    const end=unit?clean.slice(0,unit.index):clean;
    // Inspect suffixes only. Measures such as 140 litros and x100 stay in the product.
    const words=end.split(/\s+/);
    for(let count=Math.min(8,words.length-1);count>=1;count--) {
      const value=words.slice(-count).join(' '), amount=spokenNumber(value);
      if(amount===null || !Number.isFinite(amount) || amount<0)continue;
      const start=end.length-value.length;
      let product=original.slice(0,start).replace(/[\s,;:]+$/g,'').trim();
      if(!product || /(?:\bx|\bpor|\bde|\bmenos|-)\s*$/i.test(product))continue;
      return {text:original,productText:product,quantity:amount,countUnit:unit?unit[1]:null};
    }
    return {text:original,productText:original,quantity:null,countUnit:null};
  }
  function masterTokens(text) {
    let value=normalize(text);
    // Apply the same representation to spoken descriptions and every catalog entry.
    // Split 140LT / 500GR before expanding aliases; a word boundary alone misses them.
    value=value.replace(/(\d)(?=[a-zµμ])/g,'$1 ').replace(/[µμ]/g,'u');
    const measures={litros:'l',litro:'l',lts:'l',lt:'l',litr:'l',mililitros:'ml',mililitro:'ml',mls:'ml',cc:'ml',kilogramos:'kg',kilogramo:'kg',kilos:'kg',kilo:'kg',kgs:'kg',gramos:'g',gramo:'g',grs:'g',gr:'g',galones:'gal',galon:'gal',gln:'gal',gl:'gal',centimetros:'cm',centimetro:'cm',cms:'cm',milimetros:'mm',milimetro:'mm',metros:'m',metro:'m',mts:'m',mt:'m',micras:'um',micra:'um',micrones:'um',micron:'um',micrometros:'um',micrometro:'um',onzas:'oz',onza:'oz',yardas:'yd',yarda:'yd',pulgadas:'in',pulgada:'in',pulg:'in'};
    value=value.replace(new RegExp('\\b('+Object.keys(measures).join('|')+')\\b','g'),w=>measures[w]);
    value=value.replace(/(\d)\s*["″]/g,'$1 in');
    const numberWord='(?:'+numberWords.concat(['un','una','y','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa','cien','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos','mil']).join('|')+')';
    value=value.replace(new RegExp('\\b(?:x|por)\\s+('+numberWord+'(?:\\s+'+numberWord+'){0,7})\\b','g'),(all,n)=>{
      const amount=spokenNumber(n);return amount===null?all:'x'+amount;
    });
    value=value.replace(new RegExp('\\b('+numberWord+'(?:\\s+'+numberWord+'){0,7})\\s+(l|ml|kg|g|gal|cm|mm|m|um|oz|yd|in)\\b','g'),(all,n,u)=>{
      const amount=spokenNumber(n);return amount===null?all:amount+u;
    });
    value=value.replace(/\b(?:de\s+)?(l|kg|gal)\b/g,(all,u,offset)=>/\d\s*$/.test(value.slice(0,offset))?all:'1'+u);
    value=value.replace(/(\d)\s+(l|ml|kg|g|gal|cm|mm|m|um|oz|yd|in)\b/g,'$1$2')
      .replace(/\b(?:pqt|paq|paquete|pack)\s*(?:x|por)\s*(\d+)/g,'x$1').replace(/\b(?:x|por)\s*(\d+)/g,'x$1');
    // Safe, exact metric conversions only; do not infer gallon/ounce variants.
    value=value.replace(/\b(\d+(?:[.,]\d+)?)(ml|l|kg|g|cm|mm|m|um|oz|yd|in|gal)\b/g,(all,n,u)=>{
      const equivalent={ml:[1,'ml'],l:[1000,'ml'],kg:[1000,'g'],g:[1,'g'],m:[1000,'mm'],cm:[10,'mm'],mm:[1,'mm']};
      const [factor,unit]=equivalent[u]||[1,u];
      return Number((Number(n.replace(',','.'))*factor).toFixed(9))+unit;
    });
    const forms={negra:'negro',negras:'negro',negros:'negro',blanca:'blanco',blancas:'blanco',blancos:'blanco',roja:'rojo',rojas:'rojo',rojos:'rojo',amarilla:'amarillo',amarillas:'amarillo',azules:'azul',verdes:'verde',grises:'gris',rosada:'rosado',rosadas:'rosado',naranjas:'naranja',marrones:'marron',bolsas:'bolsa',liquida:'liquido',liquidos:'liquido',paquetes:'paquete',packs:'paquete',pqt:'paquete',paq:'paquete',botellas:'botella',cajas:'caja',rollos:'rollo',grandes:'grande',medianas:'mediano',mediana:'mediano',pequenas:'pequeno',pequena:'pequeno'};
    return [...new Set((value.match(/\d+(?:[.,]\d+)?(?:[a-z]+)?\b|[a-z]+[a-z0-9]*/g)||[]).map(w=>forms[w]||w.replace(/(\d),(\d)/g,'$1.$2')).filter(w=>!ignored.has(w)&&!['un','una','unidad','quiero','necesito','producto','favor'].includes(w)))];
  }

  const voiceColors=new Set(['negro','blanco','rojo','amarillo','azul','verde','gris','rosado','naranja','transparente','marron','plomo','beige','morado','violeta']);
  const voiceSizes=new Set(['pequeno','mediano','grande','jumbo','mini','extra','xl','xxl']);
  const voicePresentations=new Set(['paquete','pack','pqt','caja','botella','bolsa','rollo','saco','bidon','balde','lata','frasco','par']);
  const featureCache=new WeakMap();
  function editDistance(a,b) {
    let row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++) {
      const next=[i];
      for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));
      row=next;
    }
    return row[b.length];
  }
  function voiceSound(word) {
    return word.replace(/h/g,'').replace(/qu/g,'k').replace(/c(?=[ei])/g,'s').replace(/z/g,'s')
      .replace(/v/g,'b').replace(/y/g,'i').replace(/ll/g,'i').replace(/j/g,'g');
  }
  function voiceCloseness(a,b) {
    if(a===b)return 1;
    if(/\d/.test(a+b)||Math.min(a.length,b.length)<4||Math.abs(a.length-b.length)>2)return 0;
    if(voiceSound(a)===voiceSound(b))return .92;
    const distance=editDistance(a,b), length=Math.max(a.length,b.length);
    return distance===1?.84:distance===2&&length>=7?.68:0;
  }
  // Speech-only similarity: OCR retains its independent, stricter comparator.
  function speechSound(word) {
    return word.replace(/ch/g,'x').replace(/sh/g,'x').replace(/ll/g,'y')
      .replace(/qu(?=[ei])/g,'k').replace(/gu(?=[ei])/g,'g')
      .replace(/g(?=[ei])/g,'j').replace(/c(?=[ei])/g,'s')
      .replace(/[cq]/g,'k').replace(/z/g,'s').replace(/v/g,'b')
      .replace(/h/g,'').replace(/y/g,'i').replace(/rr/g,'r').replace(/(.)\1+/g,'$1');
  }
  function speechCloseness(a,b) {
    if(a===b)return 1;
    if(/\d/.test(a+b)||Math.min(a.length,b.length)<3)return 0;
    const shorter=Math.min(a.length,b.length),longer=Math.max(a.length,b.length);
    const pa=speechSound(a),pb=speechSound(b);
    if(pa===pb)return .94;
    let best=voiceCloseness(a,b);
    // Swapped adjacent letters also occur in short dictated brands (PATO / PAOT).
    if(a.length===b.length&&shorter>=4) {
      const differences=[...a].map((letter,index)=>letter!==b[index]?index:-1).filter(index=>index>=0);
      if(differences.length===2&&differences[1]===differences[0]+1&&
          a[differences[0]]===b[differences[1]]&&a[differences[1]]===b[differences[0]])best=Math.max(best,.84);
    }
    // A meaningful fragment can suggest a word, but is not an exact word.
    if(shorter>=4&&shorter/longer>=.5&&(a.includes(b)||b.includes(a)))
      best=Math.max(best,.70+.14*shorter/longer);
    if(shorter/longer<.55)return best;
    const distance=editDistance(a,b),ratio=1-distance/longer;
    if(distance<=3&&ratio>=.62)best=Math.max(best,.58+.30*ratio);
    const soundRatio=1-editDistance(pa,pb)/Math.max(pa.length,pb.length,1);
    const consonants=w=>w.replace(/[aeiou]/g,''),vowels=w=>w.replace(/[^aeiou]/g,'');
    const ca=consonants(pa),cb=consonants(pb),va=vowels(pa),vb=vowels(pb);
    const consonantRatio=ca&&cb?1-editDistance(ca,cb)/Math.max(ca.length,cb.length):0;
    const vowelRatio=va&&vb?1-editDistance(va,vb)/Math.max(va.length,vb.length):0;
    // Vowels alone are weak evidence; require corroborating consonants/spelling.
    if(soundRatio>=.67&&Math.min(pa.length,pb.length)>=4)
      best=Math.max(best,Math.min(.91,.60+.24*soundRatio+.07*consonantRatio));
    if(Math.min(ca.length,cb.length)>=3&&consonantRatio>=.8&&ratio>=.5)
      best=Math.max(best,.60+.12*consonantRatio+.08*vowelRatio);
    return best;
  }
  const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const phrasePattern=value=>value.split(/\s+/).map(escapePattern).join('\\s+');
  const brandAliases=(Array.isArray(root.InventoryBrandAliases)?root.InventoryBrandAliases:[]).map(entry=>({
    brand:normalize(entry.brand).replace(/[^a-z0-9]+/g,' ').trim(),
    aliases:(entry.aliases||[]).map(alias=>{
      const definition=typeof alias==='string'?{value:alias}:alias;
      const value=normalize(definition.value).replace(/[^a-z0-9]+/g,' ').trim();
      return {
        value,
        pattern:new RegExp('(?:^|\\s)'+phrasePattern(value)+'(?:$|\\s)'),
        tokens:new Set(tokens(value)),
        strength:Math.max(0.5,Math.min(1,Number(definition.strength)||0.85)),
        partial:Boolean(definition.partial)
      };
    }).filter(alias=>alias.value)
  })).filter(entry=>entry.brand&&entry.aliases.length);
  const containsPhrase=(text,phrase)=>new RegExp('(?:^|\\s)'+phrasePattern(phrase)+'(?:$|\\s)').test(text.replace(/[^a-z0-9]+/g,' ').trim());
  function brandAliasMatch(text,productFeatures) {
    const phrase=normalize(text).replace(/[^a-z0-9]+/g,' ').trim();
    let best=null;
    for(const entry of brandAliases) {
      if(!containsPhrase(productFeatures.normalized,entry.brand))continue;
      for(const alias of entry.aliases)if(alias.pattern.test(phrase)&&(!best||alias.strength>best.strength))
        best={brand:entry.brand,value:alias.value,tokens:alias.tokens,strength:alias.strength,partial:alias.partial};
    }
    return best;
  }
  function rawNumbers(text) {
    return new Set((normalize(text).match(/\d+(?:[.,]\d+)?/g)||[]).map(value=>String(Number(value.replace(',','.')))));
  }
  function voiceFeatures(text, product=null) {
    const source=product?[product.name,product.brand,product.keywords,product.presentation,product.color,product.measure].filter(Boolean).join(' '):String(text||'').slice(0,300);
    const cached=product&&featureCache.get(product);
    if(cached?.source===source)return cached.result;
    const list=masterTokens(source).slice(0,60), tokenSet=new Set(list);
    const colors=new Set(list.filter(word=>voiceColors.has(word)));
    const sizes=new Set(list.filter(word=>voiceSizes.has(word)));
    const measures=new Set(list.filter(word=>/^\d+(?:\.\d+)?(?:ml|g|mm|um|oz|yd|in|gal)$/.test(word)));
    const packs=new Set(list.filter(word=>/^x\d+(?:\.\d+)?$/.test(word)));
    const normalized=normalize(source);
    const presentations=new Set(list.filter(word=>voicePresentations.has(word)));
    if(/\b(?:pqt|paq|paquete|pack)(?:\s*(?:x|por)\s*\d+)?\b/.test(normalized)||packs.size)presentations.add('paquete');
    for(const presentation of presentations)if(!tokenSet.has(presentation)){tokenSet.add(presentation);list.push(presentation);}
    const result={tokens:list,tokenSet,colors,sizes,measures,packs,presentations,numbers:rawNumbers(source),normalized};
    if(product)featureCache.set(product,{source,result});
    return result;
  }
  const overlaps=(left,right)=>[...left].some(value=>right.has(value));
  function contradicts(query, product) {
    if(query.colors.size&&!overlaps(query.colors,product.colors))return true;
    if(query.sizes.size&&!overlaps(query.sizes,product.sizes))return true;
    if(query.measures.size&&![...query.measures].every(value=>product.measures.has(value)))return true;
    if(query.packs.size&&![...query.packs].every(value=>product.packs.has(value)))return true;
    if(query.presentations.size&&![...query.presentations].every(value=>product.presentations.has(value)))return true;
    // A number without a spoken unit still distinguishes 140 from 220.
    if(!query.measures.size&&!query.packs.size&&query.numbers.size&&![...query.numbers].every(value=>product.numbers.has(value)))return true;
    return false;
  }
  function tokenWeight(word,query) {
    if(query.types?.has(word))return 2.8;
    if(query.measures.has(word)||query.packs.has(word))return 4;
    if(query.colors.has(word)||query.sizes.has(word))return 3.5;
    if(/^\d/.test(word))return 3.5;
    if(query.presentations.has(word))return 2;
    return word.length>=7?1.6:word.length>=4?1.25:1;
  }
  // Conservative product-type synonyms, exclusively for speech. Do not turn a
  // cleaner into a disinfectant or approximate a capacity, code or pack count.
  const speechTypes=new Set(['ambientador','limpiador','desinfectante','detergente','jabon','silicona','lejia','lavavajilla','bolsa','escoba','trapeador','adhesivo','pintura']);
  const speechSynonyms={aromatizante:'ambientador',aromatisante:'ambientador',aromatizador:'ambientador',perfumador:'ambientador',ambientadores:'ambientador',limpiatodo:'limpiador',limpiadores:'limpiador',lavaplatos:'lavavajilla',lavaloza:'lavavajilla',lavalozas:'lavavajilla'};
  function speechFeatures(text,product=null){
    const base=voiceFeatures(text,product),words=[];
    for(let i=0;i<base.tokens.length;i++){
      let word=base.tokens[i];
      if(word==='limpia'&&base.tokens[i+1]==='todo'){word='limpiador';i++;}
      words.push(speechSynonyms[word]||word);
    }
    const list=[...new Set(words)];
    return {...base,tokens:list,tokenSet:new Set(list),types:new Set(list.filter(word=>speechTypes.has(word)))};
  }
  function voicePresentation(product){
    const explicit=[product.measure,product.presentation].filter(value=>typeof value==='string'&&value.trim());
    const measures=String(product.name||'').toUpperCase().match(/\b\d+(?:[.,]\d+)?\s*(?:MILILITROS?|LITROS?|KILOGRAMOS?|GRAMOS?|MICRAS?|ML|LTS?|KG|GR?|GAL|GLN|CM|MM|OZ)\b|\bX\s*\d+\b|\b(?:GLN|GALON|GALÓN|SPRAY|AEROSOL)\b/g)||[];
    const values=[...new Set([...explicit,...measures].map(value=>value.trim().replace(/(\d)([A-Z])/g,'$1 $2')))];
    return values.length?'Presentación: '+values.join(' · '):'Presentación no indicada';
  }
  function weightedVoiceRank(products,text,limit) {
    const phrase=String(text||'').slice(0,300), query=speechFeatures(phrase);
    if(!query.tokens.length)return [];
    const compact=normalize(phrase).replace(/[^a-z0-9]/g,'');
    const similarities=new Map();
    const compare=(a,b)=>{
      const key=a+'\0'+b;
      if(!similarities.has(key))similarities.set(key,speechCloseness(a,b));
      return similarities.get(key);
    };
    return products.map(product=>{
      const codes=[product.sku,product.barcode].filter(Boolean).map(value=>normalize(value).replace(/[^a-z0-9]/g,''));
      const exactCode=codes.some(code=>code&&code===compact);
      const features=speechFeatures(null,product);
      if(!exactCode&&contradicts(query,features))return null;
      const exactName=normalize(product.name).replace(/[^a-z0-9]+/g,' ').trim()===normalize(phrase).replace(/[^a-z0-9]+/g,' ').trim();
      const alias=brandAliasMatch(phrase,features);
      let matched=0,total=0,evidence=0,exactEvidence=0,contextEvidence=0,criticalContextEvidence=0,lexicalEvidence=0;
      let strongLexicalEvidence=0;
      const unknownWords=[];
      const isLexical=word=>!query.measures.has(word)&&!query.packs.has(word)&&!query.colors.has(word)&&!query.sizes.has(word)&&!/^\d/.test(word);
      const used=new Set();
      // Stable assignment independent of spoken order; reserve literal matches first.
      const orderedWords=[...query.tokens].sort((a,b)=>Number(features.tokens.includes(b))-Number(features.tokens.includes(a))||b.length-a.length||a.localeCompare(b));
      for(const word of orderedWords) {
        const weight=tokenWeight(word,query);
        let ordinaryHit=0,bestWord=null;
        for(const candidate of features.tokens)if(!used.has(candidate)) {
          const similarity=compare(word,candidate);
          if(similarity>ordinaryHit){ordinaryHit=similarity;bestWord=candidate;}
        }
        if(bestWord&&ordinaryHit>=.68)used.add(bestWord);
        if(/^\d+(?:\.\d+)?$/.test(word)&&!query.measures.size&&!query.packs.size&&features.numbers.has(word))ordinaryHit=1;
        const aliasWord=alias?.tokens.has(word);
        const hit=aliasWord?Math.max(ordinaryHit,alias.strength):ordinaryHit;
        total+=weight;matched+=weight*hit;
        if(hit>=.68)evidence++;
        if(hit>=.68&&isLexical(word))lexicalEvidence++;
        if(hit>=.8&&isLexical(word)&&word.length>=4&&!query.presentations.has(word))strongLexicalEvidence++;
        if(hit<.68)unknownWords.push(word);
        if(hit===1)exactEvidence++;
        if(!aliasWord&&ordinaryHit>=.68) {
          contextEvidence++;
          if(query.measures.has(word)||query.packs.has(word)||query.colors.has(word)||query.sizes.has(word)||/^\d/.test(word))criticalContextEvidence++;
        }
      }
      const coverage=total?matched/total:0;
      // Preserve a useful suggestion when just one descriptive word was misheard.
      // Contradictory attributes were rejected above; numbers/codes are never dropped.
      const relaxed=coverage<.58&&coverage>=.35&&strongLexicalEvidence>0&&unknownWords.length===1&&
        /^[a-z]{3,}$/.test(unknownWords[0])&&isLexical(unknownWords[0])&&!query.presentations.has(unknownWords[0]);
      if(!exactCode&&(!relaxed&&coverage<.58||evidence===0||query.tokens.some(isLexical)&&lexicalEvidence===0))return null;
      const specificity=Math.min(8,exactEvidence*1.5+(query.colors.size+query.measures.size+query.packs.size+query.sizes.size)*2);
      // A brand fragment is a ranking signal only. It cannot create a safe match
      // without independent product/attribute evidence from the same phrase.
      const aliasBoost=alias&&contextEvidence?alias.strength*(alias.partial?3:6):0;
      const typeMatch=!query.types.size||overlaps(query.types,features.types);
      const typeScore=query.types.size?(typeMatch?12:-20):0;
      const score=exactCode?200:Math.min(125,coverage*100+specificity+aliasBoost+(exactName?12:0)+typeScore);
      const aliasHasContext=!alias||contextEvidence>=2;
      const confidence=exactCode||exactName||typeMatch&&coverage>=.88&&evidence>=2&&evidence===query.tokens.length&&aliasHasContext?'high':coverage>=.72&&typeMatch?'possible':'low';
      const label=exactCode?'Código exacto':confidence==='high'?'Coincidencia alta':confidence==='possible'?'Posible coincidencia por voz':'¿Quisiste decir?';
      return {product,score,coverage,evidence,exactEvidence,contextEvidence,criticalContextEvidence,exactCode,exactName,confidence,label,brandAlias:alias?.value||null,brandAliasPartial:Boolean(alias?.partial)};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||b.coverage-a.coverage||a.product.name.localeCompare(b.product.name,'es')).slice(0,limit);
  }
  function weightedOcrRank(products,text) {
    const phrase=cleanCameraText(text), rawWords=tokens(phrase).slice(0,180);
    const query=voiceFeatures(phrase), words=[...new Set([...query.tokens,...rawWords])];
    if(!words.length)return [];
    const compactWords=new Set(rawWords.flatMap((_,index)=>[
      rawWords[index],rawWords.slice(index,index+2).join(''),rawWords.slice(index,index+3).join('')
    ]));
    for(const line of normalize(phrase).split(/\n/))compactWords.add(line.replace(/[^a-z0-9]/g,''));
    return products.map(product=>{
      const features=voiceFeatures(null,product);
      const queryTypes=query.tokens.filter(word=>speechTypes.has(word));
      const productTypes=features.tokens.filter(word=>speechTypes.has(word));
      const typeMatch=!queryTypes.length||queryTypes.some(word=>productTypes.includes(word));
      const brands=[...new Set([...brandAliases.map(entry=>entry.brand),normalize(product.brand||'')].filter(Boolean))];
      const queryBrands=brands.filter(brand=>containsPhrase(query.normalized,brand));
      const brandMatch=!queryBrands.length||queryBrands.some(brand=>containsPhrase(features.normalized,brand));
      const codes=[product.sku,product.barcode].filter(Boolean).map(value=>normalize(value).replace(/[^a-z0-9]/g,''));
      const exactCode=codes.some(code=>code.length>=4&&compactWords.has(code));
      if(!exactCode) {
        if(query.colors.size&&features.colors.size&&!overlaps(query.colors,features.colors))return null;
        if(query.sizes.size&&features.sizes.size&&!overlaps(query.sizes,features.sizes))return null;
        if(query.measures.size&&![...query.measures].every(value=>features.measures.has(value)))return null;
        if(query.packs.size&&![...query.packs].every(value=>features.packs.has(value)))return null;
      }
      let matched=0,total=0,evidence=0,exactEvidence=0,criticalEvidence=0;
      for(const productWord of features.tokens) {
        const critical=features.measures.has(productWord)||features.packs.has(productWord)||features.colors.has(productWord)||features.sizes.has(productWord)||/^\d/.test(productWord);
        const weight=critical?3.5:productWord.length>=7?1.6:productWord.length>=4?1.25:1;
        let hit=Math.max(0,...words.map(word=>Math.max(similar(productWord,word),voiceCloseness(productWord,word))));
        if(/^\d+(?:\.\d+)?$/.test(productWord)&&query.numbers.has(productWord))hit=1;
        total+=weight;matched+=weight*hit;
        if(hit>=.68){evidence++;if(critical)criticalEvidence++;}
        if(hit>=.99)exactEvidence++;
      }
      const coverage=total?matched/total:0;
      let queryMatched=0,queryTotal=0;
      for(const queryWord of query.tokens) {
        const weight=tokenWeight(queryWord,query);
        const hit=Math.max(0,...features.tokens.map(productWord=>Math.max(similar(queryWord,productWord),voiceCloseness(queryWord,productWord))));
        queryTotal+=weight;queryMatched+=weight*hit;
      }
      const queryCoverage=queryTotal?queryMatched/queryTotal:0;
      if(!exactCode&&(coverage<.34||evidence===0||query.tokens.length<=12&&queryCoverage<.45))return null;
      const score=exactCode?200:coverage*100+Math.min(10,exactEvidence*1.5+criticalEvidence*2)+(queryTypes.length?(typeMatch?8:-12):0)+(queryBrands.length?(brandMatch?8:-16):0);
      const confidence=exactCode||typeMatch&&brandMatch&&(coverage>=.78&&evidence>=2||coverage>=.56&&evidence>=3&&criticalEvidence>=2)?'high':coverage>=.52?'possible':'low';
      const label=exactCode?'Código exacto':confidence==='high'?'Coincidencia alta':confidence==='possible'?'Posible coincidencia':'Revisar coincidencia';
      return {product,score,coverage,queryCoverage,evidence,exactEvidence,criticalEvidence,exactCode,confidence,label,total:matched,numericAgreement:true};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||b.coverage-a.coverage||a.product.name.localeCompare(b.product.name,'es')).slice(0,8);
  }
  function cleanCameraText(text){
    return String(text||'').slice(0,4000).split(/\r?\n/).filter(line=>{
      const value=normalize(line).trim();
      return !/^(?:lote|lot|venc(?:imiento)?|vence|caducidad|exp(?:ira)?|fecha|fabricacion|fabricado|ingredientes|composicion|precauciones|advertencia|modo de uso|registro sanitario|ruc|direccion|telefono)\b/.test(value)&&
        !/^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}$/.test(value);
    }).join('\n');
  }
  function cameraTracker(){
    let signature='',reads=0,last=0;
    return {
      reset(){signature='';reads=0;last=0;},
      observe(matches,now=Date.now()){
        const choices=matches.slice(0,3),key=choices.map(m=>m.product.id||m.product.sku||m.product.name).join('\0');
        const usable=choices.length>0&&choices[0].confidence!=='low';
        reads=usable?(key===signature&&now-last<=3500?reads+1:1):0;
        signature=usable?key:'';last=now;
        return {matches:choices,reads,stable:reads>=3};
      }
    };
  }
  // Join adjacent speech fragments only when their sound matches a catalog word.
  // Retain the original phrase as well: "la banda" can also mean an actual band.
  function joinedVoiceQueries(products,text) {
    const normalized=normalize(text).slice(0,300);
    const sound=speechSound;
    const vocabulary=new Map();
    for(const product of products) {
      const words=tokens([product.name,product.brand,product.keywords].filter(Boolean).join(' '));
      for(const word of words)if(/^[a-z]{6,}$/.test(word)) {
        const key=sound(word);
        if(!vocabulary.has(key))vocabulary.set(key,new Set());
        vocabulary.get(key).add(word);
      }
    }
    const queries=new Set([normalized]);
    // Two passes allow two split words in the same phrase; bound variants and work.
    for(let pass=0;pass<2;pass++)for(const phrase of [...queries]) {
      const words=[...phrase.matchAll(/[a-z0-9]+/g)];
      for(let i=0;i<words.length;i++)for(const count of [2,3]) {
        const span=words.slice(i,i+count);
        if(span.length!==count||span.some(m=>! /^[a-z]{2,}$/.test(m[0])))continue;
        const start=span[0].index,end=span[count-1].index+span[count-1][0].length;
        if(!/^[a-z\s]+$/.test(phrase.slice(start,end)))continue;
        const joined=span.map(m=>m[0]).join(''),joinedSound=sound(joined);
        const matches=new Set(vocabulary.get(joinedSound)||[]);
        // Permit one sound typo in a split word, using only actual catalog words.
        if(joined.length>=6&&span.some(m=>m[0].length<=4))for(const [key,values] of vocabulary) {
          if(Math.abs(key.length-joinedSound.length)<=1&&Math.min(key.length,joinedSound.length)>=5&&
              editDistance(key,joinedSound)===1)for(const word of values)matches.add(word);
        }
        if(matches)for(const word of matches) {
          queries.add(phrase.slice(0,start)+word+phrase.slice(end));
          if(queries.size>=8)return [...queries];
        }
      }
    }
    return [...queries];
  }
  function combineVoiceQueries(products,text,ranker,limit) {
    const results=new Map();
    joinedVoiceQueries(products,text).forEach((query,index)=>{
      for(const match of ranker(products,query)) {
        const result=index?{...match,score:match.score*.9,joined:true,label:'Posible coincidencia por voz'}:match;
        const previous=results.get(match.product);
        if(!previous||result.score>previous.score)results.set(match.product,result);
      }
    });
    return [...results.values()].sort((a,b)=>b.score-a.score||a.product.name.localeCompare(b.product.name,'es')).slice(0,limit);
  }
  function voiceRank(products,text) {
    const matches=combineVoiceQueries(products,text,voiceRankBase,12);
    if(!voiceConfident(matches))for(const match of matches)if(match.confidence==='high')match.label='Posible coincidencia por voz';
    return matches;
  }
  function masterRankBase(products,text) {
    return weightedVoiceRank(products,text,3);
  }
  function voiceConfident(matches) {
    const first=matches[0],second=matches[1];
    if(!first)return null;
    if(first.exactCode)return second?.exactCode?null:first.product;
    if(first.joined)return null;
    if(first.brandAlias&&first.contextEvidence<2)return null;
    const enough=first.confidence==='high'&&(first.evidence>=2||first.exactName);
    return enough&&(!second||first.score-second.score>=9)?first.product:null;
  }
  function voiceMaster(products,text) {
    const parsed=parseMaster(text), matches=combineVoiceQueries(products,parsed.productText,masterRankBase,3), first=matches[0], second=matches[1];
    const certain=first&&!first.joined&&voiceConfident(matches);
    return {...parsed,matches,selected:certain||null};
  }
  root.InventoryMatching = { rank, confident, voiceRank, voiceConfident, voiceMaster, parseMaster, voicePresentation, cleanCameraText, cameraTracker };
  if (typeof module !== 'undefined') module.exports = root.InventoryMatching;
})(typeof window !== 'undefined' ? window : globalThis);
