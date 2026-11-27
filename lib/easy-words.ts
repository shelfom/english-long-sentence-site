// Is a replacement really easier than the word it replaces?
// Two hand-kept lists stand in for a learner's vocabulary: `everyday` is about A1–A2,
// `common` about B1. They are an editorial estimate, not a dictionary-certified level.
// A swap is shown only when it replaces a word that is on neither list with words that are
// on them; a swap to a word about as hard as the original teaches nothing.

const everyday=`
a an the this that these those i you he she it we they me him her us them my your his its our their mine yours hers ours theirs
myself yourself himself herself itself ourselves yourselves themselves who whom whose which what when where why how
and or but so because if than then as while until till before after since although though unless whether nor
not no yes never always often sometimes usually ever already yet still just only even very quite really rather almost nearly enough too also
much many more most less least few fewer little lot lots several another other others such same different own each every all any some none both either neither
someone somebody something anyone anybody anything everyone everybody everything nobody nothing
one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion zero
first second third fourth fifth sixth seventh eighth ninth tenth last next half quarter double single once twice couple pair
about above across against along among around at away back behind below beside between by down during except for from in inside into near of off on onto opposite out outside over past round through to toward towards under up upon with within without per like
here there everywhere anywhere somewhere nowhere now today tonight tomorrow yesterday ago again soon later early late ahead apart together forward forwards backward backwards upstairs downstairs abroad indoors outdoors
maybe perhaps please thanks thank sorry hello hi goodbye bye ok okay oh well else instead anyway however actually especially exactly certainly probably suddenly finally quickly slowly carefully easily simply clearly hardly normally recently immediately
be am is are was were been being have has had having do does did done doing will would can could shall should may might must need cannot
don't doesn't didn't can't couldn't won't wouldn't isn't aren't wasn't weren't hasn't haven't hadn't shouldn't mustn't i'm you're he's she's it's we're they're i've you've we've they've i'll you'll he'll she'll we'll they'll i'd you'd he'd she'd we'd they'd that's there's what's let's who's here's

go went gone come came get got gotten give gave given take took taken make made say said tell told ask answer talk speak spoke spoken call see saw seen look watch hear heard listen feel felt think thought know knew known understand understood believe remember forget forgot forgotten
learn learnt teach taught study read write wrote written draw drew drawn paint sing sang sung dance play work help try use find found lose lost keep kept put bring brought carry hold held leave left stay wait stop start begin began begun finish end open close shut turn move
walk run ran jump climb swim swam swum fly flew flown drive drove driven ride rode ridden travel visit arrive return enter follow lead led pass cross reach live die born grow grew grown become became change happen build built break broke broken fix repair cut hit kick push pull
throw threw thrown catch caught drop fall fell fallen pick lift pour fill wash clean cook bake boil eat ate eaten drink drank drunk sleep slept wake woke woken dress wear wore worn buy bought sell sold pay paid cost spend spent save send sent show showed shown meet met join invite share
choose chose chosen decide plan hope wish agree mean meant explain describe guess check count add win won beat fight fought kill hurt burn burnt smile laugh cry shout sit sat stand stood lie lay lying rain snow shine shone smell taste touch sound seem let allow welcome miss enjoy prefer
worry care mind matter belong borrow lend lent order book rent hire collect copy print post email text phone ring rang rung shop cycle fish camp ski skate sail hike relax rest practise practice exercise train test fail spell repeat correct complete include cover hang hung hide hid hidden
lock tie pack park land feed fed plant dig dug mix marry kiss hug steal stole stolen shoot shot rob set bite bit blow blew blown hurry prepare receive offer dream point act knock shake shook wave fold tidy brush type click search chat fit suit lay laid

person people man men woman women child children kid boy girl baby babies adult teenager friend family parent mother father mum mom dad brother sister son daughter husband wife wives uncle aunt cousin grandmother grandfather grandma grandpa grandparent grandchild grandson granddaughter
neighbour neighbor guest visitor stranger member group team class crowd king queen prince princess hero boss worker farmer teacher student pupil doctor nurse dentist driver pilot chef waiter waitress police policeman officer soldier singer actor actress artist writer painter player
dancer musician photographer reporter manager engineer mechanic cleaner guard guide tourist customer passenger owner leader winner loser partner boyfriend girlfriend lady gentleman sir madam mr mrs ms human
body head face hair eye ear nose mouth lip tooth teeth tongue neck shoulder arm hand finger thumb chest stomach leg knee foot feet toe skin heart blood bone brain health healthy ill sick illness pain headache cold cough fever medicine pill hospital ambulance accident dead death
alive life lives tired hungry thirsty sleepy weak strong
food meal breakfast lunch dinner supper snack bread butter cheese egg milk cream meat beef chicken pork lamb sausage ham burger sandwich pizza pasta rice noodle soup salad sauce salt pepper sugar honey jam oil flour cake biscuit cookie chocolate sweet candy ice fruit apple banana
orange lemon grape pear peach strawberry melon mango pineapple cherry tomato potato carrot onion bean pea vegetable mushroom garlic corn nut water juice tea coffee beer wine bottle glass cup mug plate bowl dish knife knives fork spoon pan pot menu bill tip restaurant cafe café kitchen
fridge oven cooker picnic dessert chips fries toast cereal steak piece slice
home house flat apartment room bedroom bathroom garden yard garage floor wall roof door window stairs lift gate key bed chair table desk sofa seat shelf shelves cupboard drawer lamp light mirror picture clock carpet curtain blanket pillow sheet towel soap shower bath toilet sink tap bin
rubbish box bag basket bucket rope string paper pen pencil notebook diary dictionary page letter card envelope stamp newspaper magazine photo photograph camera telephone mobile computer laptop screen keyboard mouse mice internet website message video film movie radio television tv
programme program music song game toy doll ball balloon kite puzzle gift present prize money coin cash note wallet purse ticket map list sign poster flag machine engine tool hammer nail scissors glue comb umbrella battery plug wire button switch bell candle match fire smoke thing
object stuff
clothes shirt t-shirt blouse sweater jumper jacket coat skirt trousers pants jeans shorts sock shoe boot trainers hat cap scarf glove belt uniform pocket necklace glasses sunglasses costume
place town city village country countryside capital street road path bridge corner square playground zoo farm field forest wood jungle mountain hill valley river lake sea ocean beach coast island desert cave rock stone sand ground earth world sky sun moon star space air wind cloud
storm weather season spring summer autumn winter north south east west centre center middle side top bottom front edge area part building school college university library museum theatre theater cinema hotel bank store market supermarket office factory station airport port stadium gym
pool church castle palace tower prison club bar
car bus train tram underground taxi bike bicycle motorbike motorcycle boat ship plane aeroplane airplane helicopter lorry truck van wheel trip journey tour holiday vacation flight traffic platform luggage suitcase passport
animal pet dog cat puppy kitten horse cow pig sheep goat duck bird rat rabbit monkey lion tiger bear elephant snake frog whale dolphin shark insect bee butterfly spider ant wolf wolves fox deer camel panda penguin parrot tail wing nest tree flower grass leaf leaves branch seed root rose
time day week month year hour minute moment morning afternoon evening night midnight noon weekend weekday monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december date birthday christmas calendar
century age future daily weekly monthly yearly
lesson classroom course subject maths math science history geography art sport english language grammar word sentence story exam homework question example mistake mark grade idea fact information news problem reason result rule way kind sort number size shape colour color line
circle price job business company meeting project report law war peace government power nature

good bad better best worse worst big small large tiny great long short tall high low wide narrow thick thin fat heavy deep fast quick slow new old young modern hot warm cool freezing dry wet dirty full empty closed easy hard difficult simple soft loud quiet noisy busy free cheap
expensive rich poor happy sad glad angry afraid scared frightened worried nervous excited bored boring interesting exciting funny serious nice friendly polite rude lovely beautiful pretty ugly handsome clever smart stupid silly crazy brave lazy careful dangerous safe strange normal usual
special famous popular important main real true false right wrong sure certain ready possible impossible necessary useful terrible awful horrible wonderful fantastic amazing excellent perfect fine favourite favorite lucky unlucky pleased surprised proud shy lonely alone married
awake asleep sour bitter fresh delicious tasty bright dark clear cloudy sunny rainy windy snowy foggy flat straight sharp smooth rough comfortable whole total extra final ordinary common public private local national international foreign natural wild personal
red blue green yellow black white brown grey gray pink purple gold silver golden
want love hate name far party fun plenty plastic petrol online app blog web robot fog board beaten bitten shaken lit helpful
football soccer tennis basketball baseball volleyball golf hockey badminton chess guitar piano drum violin
metre meter kilometre kilometer mile centimetre centimeter kilo kilogram gram litre liter dollar pound euro cent percent
`;

const common=`
accept achieve admit advise affect afford aim announce apologise apologize apply argue arrange attack attend avoid behave blame bother breathe calm cancel cause celebrate challenge cheat cheer chew claim clap combine comment communicate compare compete complain concentrate
confirm connect consider contact contain continue control create cure damage deal dealt defend delay deliver depend deserve design destroy develop disagree disappear disappoint discover discuss dislike divide doubt download earn employ encourage escape examine exchange exist expect
experience experiment explore express fear force forgive freeze froze frozen frighten gain gather greet handle head heat hunt imagine improve increase influence inform injure intend interview introduce invent involve iron judge lack last lean limit link lower manage measure melt
mention mend notice obey operate organise organize overtake pause perform permit persuade pile predict press pretend prevent produce promise protect prove provide publish punish queue race raise react realise realize recognise recognize recommend record recover reduce refuse regret
relate release remain remind remove replace reply represent request require rescue reserve respect respond retire review rise rose risen risk roll rub satisfy scream separate serve settle sign sink sank sunk slip solve spill spoil spread squeeze stare stick stuck sting stir stress
stretch strike struck succeed suffer suggest supply support suppose surprise surround survive swallow swap sweep swept switch tear tore torn tend threaten translate trap treat trust upset vote warn waste weigh whisper wonder wrap mend tap upload

ability accommodation account action activity advantage adventure advert advertisement advice agency alarm amount ambition anger announcement apology appearance application appointment argument army arrangement arrival article atmosphere attention attitude attraction audience author
average background balance band base basis battle beauty behaviour behavior belief benefit border brand breath bubble budget campaign career case celebration chain champion chance channel chapter character charge charity choice climate coal collection communication community
competition complaint concert condition conference confidence connection contest continent contract conversation courage court crime criminal crop culture custom danger data debt decision decrease defeat degree delivery department description detail development difference
difficulty direction director disadvantage disaster discount discovery discussion disease distance document duty earthquake economy education effect effort election electricity emergency emotion employee employer employment enemy energy entertainment entrance environment equipment
error event evidence excitement excuse exhibition expert explanation explosion expression failure fan fashion fault feature feeling fee festival figure flood focus freedom fuel function fun furniture gas germ goal god goods growth habit harm height hobby hole hunger imagination
importance improvement income independence industry injury instruction instrument insurance interest invention invitation issue item joke justice kingdom knowledge label lawyer layer level licence license liquid literature location loss luck majority manner material meaning media
memory mess metal method military mixture model mood movement mud murder mystery nation net network noise novel occasion operation opinion opportunity option organisation organization origin pattern performance period permission personality planet pleasure poem poet poetry politics
pollution pond population position possibility pressure process product production profession professor profit progress proof property protection punishment purpose quality quantity range rate reaction reality receipt recipe region relationship religion research responsibility
reward role route safety salary sale scene schedule score secret section security sense series service shadow shame shock signal silence situation skill society soil solution soul source speech speed spirit staff stage standard state statement steam step structure style success
surface survey system talent target task tax technology temperature term theme theory threat title topic tradition trade training transport treatment trend trick trouble truth value variety vehicle victim victory view violence virus voice volume wage warning wave wealth weapon
wedding weight youth scientist drug seller buyer maker helper speaker reader user

able absent active actual additional alike amazed ancient annoyed annoying available aware basic brief brilliant broad capable central cheerful classic complicated confident confused confusing convenient cruel curious current damaged delighted depressed determined direct disappointed
disappointing dull eastern effective electric electronic embarrassed embarrassing emotional enormous entire environmental equal essential even exact exhausted familiar fashionable fair fixed fond formal former fortunate frightening general gentle generous global grateful guilty harmful
honest hopeful hopeless ideal illegal imaginary immediate impressed impressive incredible independent individual industrial informal innocent intelligent jealous junior keen latest legal likely limited lively loose mad major medical medium mental mild minor miserable nasty negative
neat obvious odd official opposite organised organized original patient peaceful physical plain pleasant political positive powerful practical precious pregnant previous professional proper pure rapid rare raw reasonable recent regular related relaxed relaxing reliable religious
responsible ridiculous romantic scientific selfish senior sensible sensitive severe shocked shocking silent similar social solid spicy steady stressful strict successful sudden suitable surprising technical temporary terrified tight tough traditional tropical typical unable
uncomfortable unexpected unfair unhappy unique unknown unusual urgent valuable various violent wealthy western wise wooden worth convenient native

according afterwards altogether anymore approximately aside badly basically briefly completely constantly currently definitely deeply directly eventually extremely fairly forever fortunately frequently fully generally gradually highly honestly hopefully indeed lately luckily mainly
mostly naturally nowadays obviously occasionally originally otherwise partly particularly personally properly rarely regularly seriously shortly similarly slightly somehow therefore totally typically unfortunately whenever whatever wherever widely worldwide despite spite
besides beyond throughout underneath unlike dozen happiness sadness kindness darkness weakness
blank bronze tank fake ignore attractive historical strength favour favor decade row length dust dirt steel cotton wool leather cloth thief thieves prisoner shore loan giant useless painful colourful colorful homeless appear form block spot track demand owe grab load drag bury rush flow
float chase jail gap unit device bomb gun agreement clue tale file joy wound wildlife creature fence bay cliff stream thunder lightning muscle lung diet elderly generation birth marriage president holy priest pray prayer statue treasure lab laboratory software solar digital plus
further nearby truly spare rid quit shell rebuild rewrite replay reuse recycle proven huge delete
`;

const list=(text:string)=>new Set(text.split(/\s+/).filter(Boolean));
const tier1=list(everyday),tier2=list(common);
// Words that look like a form of an easy word and are not: namely is not name, deserted is not desert.
const apart=new Set('namely deserted willing striking pressing bearing'.split(' '));
const WORD=/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu;
const fold=(w:string)=>w.toLowerCase().replace(/’/g,"'");

// The plain forms a written word may be an inflection of.
function bases(word:string):string[] {
  const out=new Set([word]);
  const add=(...xs:string[])=>xs.forEach(x=>x.length>1&&out.add(x));
  const undouble=(s:string)=>/([b-df-hj-np-tv-z])\1$/.test(s)?s.slice(0,-1):s;
  let w=word.replace(/'s$|s'$/,m=>m==="'s"?'':'s');add(w);
  if(/n't$/.test(w))return [...out];
  for(const [from,to] of [['isation','ization'],['ise','ize'],['ised','ized'],['ising','izing'],['our','or'],['tre','ter']] as const)if(w.includes(from))add(w.replace(from,to));
  for(const v of [...out]){
    if(/ies$/.test(v))add(v.slice(0,-3)+'y');
    if(/ves$/.test(v))add(v.slice(0,-3)+'f',v.slice(0,-3)+'fe');
    if(/es$/.test(v))add(v.slice(0,-2));
    if(/s$/.test(v)&&!/ss$/.test(v))add(v.slice(0,-1));
    if(/ied$/.test(v))add(v.slice(0,-3)+'y');
    if(/ed$/.test(v))add(v.slice(0,-2),v.slice(0,-1),undouble(v.slice(0,-2)));
    if(/ying$/.test(v))add(v.slice(0,-4)+'ie');
    if(/ing$/.test(v))add(v.slice(0,-3),v.slice(0,-3)+'e',undouble(v.slice(0,-3)));
    if(/iest$/.test(v))add(v.slice(0,-4)+'y');
    if(/ier$/.test(v))add(v.slice(0,-3)+'y');
    if(/est$/.test(v))add(v.slice(0,-3),v.slice(0,-2),undouble(v.slice(0,-3)));
    if(/er$/.test(v))add(v.slice(0,-2),v.slice(0,-1),undouble(v.slice(0,-2)));
    if(/ily$/.test(v))add(v.slice(0,-3)+'y');
    if(/ally$/.test(v))add(v.slice(0,-2),v.slice(0,-4));
    if(/bly$/.test(v))add(v.slice(0,-1)+'e');
    if(/ly$/.test(v))add(v.slice(0,-2));
  }
  return [...out];
}

// 1: an everyday word (about A1–A2). 2: a fairly common one (about B1). 3: anything else.
export function level(written:string):1|2|3 {
  const word=fold(written);
  if(/^\d/.test(word))return 1;
  const listed=(w:string):1|2|3=>{
    if(apart.has(w))return 3;
    const forms=bases(w);
    return forms.some(f=>tier1.has(f))?1:forms.some(f=>tier2.has(f))?2:3;
  };
  const known=(w:string):1|2|3=>{
    const plain=listed(w);
    if(plain<3)return plain;
    // un- on a known word reads as that word; so does a compound of two known words (farmland, rainwater).
    if(/^un[a-z]{4}/.test(w)&&listed(w.slice(2))<3)return 2;
    for(let i=4;i<=w.length-4;i++){
      const head=w.slice(0,i);
      if(!particles.has(head)&&listed(head)<3&&listed(w.slice(i))<3)return 2;
    }
    return 3;
  };
  const whole=known(word);
  if(whole<3||!word.includes('-'))return whole;
  // A hyphenated word is as hard as its hardest part.
  return Math.max(...word.split('-').filter(Boolean).map(known)) as 1|2|3;
}
// A particle in front makes a new word, not a compound: overcome, withdraw, undertake.
const particles=new Set(['over','under','with','fore','down','back','after','out']);

const words=(text:string)=>[...text.matchAll(WORD)].map(m=>fold(m[0]));
const hardest=(list:string[])=>list.reduce<number>((top,w)=>Math.max(top,level(w)),0);
const articles=new Set(['a','an','the']);
// Whether a replacement is worth showing. The words it removes must include a big word, or be
// an expression of several words, which may be an idiom built from easy ones; the words it
// brings in must all be common; and it stays a word swap, not a rewrite.
export function simpler(big:string,small:string):boolean {
  const before=words(big).filter(w=>!articles.has(w)),after=words(small).filter(w=>!articles.has(w));
  const added=after.filter(w=>!before.includes(w)),removed=before.filter(w=>!after.includes(w));
  if(!added.length||!removed.length)return false;
  if(after.length>before.length+3)return false;
  return hardest(added)<3&&(removed.length>1||hardest(removed)===3);
}
