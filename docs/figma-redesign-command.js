// Single canvas write for docs/figma-redesign-prompt.md.
const ids = [];
const C = { blue:'#2459E0', navy:'#142B54', canvas:'#F4F7FC', white:'#FFFFFF', muted:'#65738B', green:'#18765C', border:'#DCE4EF', pale:'#EAF0FF' };
const rgb = h => ({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
const fill = h => [{type:'SOLID',color:rgb(h)}];
const fonts = ['Regular','Medium','Bold'].map(style=>({family:'Alexandria',style}));
await Promise.all(fonts.map(f=>figma.loadFontAsync(f)));
const [buttonSet,inputSet] = await Promise.all([
  figma.importComponentSetByKeyAsync('cc8b558dc7d9684011b6b99ce8e6509399bc836b'),
  figma.importComponentSetByKeyAsync('c28150b04d333d34ed9d2b77abd9f2f54e1a878a')
]);
function keep(n){ids.push(n.id);return n;}
function box(parent,name,w,d='VERTICAL',bg=null,pad=0,gap=16){
  const n=keep(figma.createAutoLayout(d)); n.name=name; n.resize(w,100); n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode='FIXED';n.itemSpacing=gap;
  n.paddingTop=n.paddingBottom=n.paddingLeft=n.paddingRight=pad;n.fills=bg?fill(bg):[];n.cornerRadius=20;
  if(parent)parent.appendChild(n);return n;
}
function text(parent,s,size=16,color=C.navy,bold=false,w){
  const n=keep(figma.createText());n.fontName=fonts[bold?2:0];n.characters=s;n.fontSize=size;n.lineHeight={unit:'PERCENT',value:165};n.textAlignHorizontal='RIGHT';n.fills=fill(color);
  parent.appendChild(n);n.textAutoResize='HEIGHT';n.resize(w||parent.width-parent.paddingLeft-parent.paddingRight,Math.ceil(size*1.65));return n;
}
function pill(parent,s,bg=C.pale,color=C.blue,w=180){const n=box(parent,'Badge / '+s,w,'HORIZONTAL',bg,12,8);n.cornerRadius=12;text(n,s,12,color,true,w-24);return n;}
function brand(parent,light=false,w=300){const n=box(parent,'Brand',w,'HORIZONTAL',null,0,12);text(n,'أي آم سبيشل',20,light?C.white:C.navy,true,w-56);const mark=box(n,'Brand mark',44,'VERTICAL',light?C.white:C.blue,4,0);mark.cornerRadius=14;text(mark,'✦',26,light?C.blue:C.white,true,36);return n;}
async function libraryControl(parent,type,label,w){
  const set=type==='button'?buttonSet:inputSet;
  const n=keep(set.defaultVariant.createInstance());parent.appendChild(n);n.name=(type==='button'?'Button / ':'Input / ')+label;
  const ts=n.findAllWithCriteria({types:['TEXT']});
  for(const t of ts){for(const segment of t.getStyledTextSegments(['fontName']))await figma.loadFontAsync(segment.fontName);t.fontName=fonts[0];t.textAlignHorizontal='RIGHT';ids.push(t.id);}
  if(type==='button'){
    const t=ts.find(t=>/button/i.test(t.characters))||ts[0];if(t)t.characters=label;n.fills=fill(C.blue);for(const t of ts)t.fills=fill(C.white);n.resize(w,52);n.cornerRadius=12;
  }else{
    const l=ts.find(t=>/label/i.test(t.characters));if(l)l.characters=label;
    const v=ts.find(t=>/value|placeholder/i.test(t.characters));if(v)v.characters=label.includes('المرور')?'••••••••':'اسم المستخدم أو البريد الإلكتروني';
    n.resize(w,n.height);n.cornerRadius=12;
  }
  return n;
}
let x=100;
const screens=[];
function screen(name,w,h,dir='VERTICAL'){
  const n=box(null,name,w,dir,C.canvas,32,24);figma.currentPage.appendChild(n);n.x=x;n.y=100;x+=w+100;n.resize(w,h);n.primaryAxisSizingMode='FIXED';n.clipsContent=true;screens.push(n);return n;
}
async function login(mobile){
  const s=screen(mobile?'02 / Login / Mobile':'01 / Login / Desktop',mobile?390:1440,mobile?844:960,mobile?'VERTICAL':'HORIZONTAL');
  if(mobile){s.paddingLeft=s.paddingRight=24;brand(s,false,342);}
  const form=box(s,'Login form',mobile?342:620,'VERTICAL',null,mobile?0:80,22);
  if(!mobile)form.paddingTop=120;
  text(form,'مرحباً بعودتك',mobile?30:36,C.navy,true);
  text(form,'سجّلي الدخول لمتابعة يومك.',14,C.muted);
  await libraryControl(form,'input','البريد الإلكتروني أو اسم المستخدم',mobile?342:460);
  await libraryControl(form,'input','كلمة المرور',mobile?342:460);
  await libraryControl(form,'button','تسجيل الدخول',mobile?342:460);
  text(form,'تحتاجين مساعدة؟ تواصلي مع مسؤول النظام.',12,C.muted);
  text(form,'إدارة السمعة الرقمية',12,C.muted);
  if(!mobile){
    const hero=box(s,'Identity panel',724,'VERTICAL',C.blue,56,30);hero.resize(724,896);hero.primaryAxisSizingMode='FIXED';hero.cornerRadius=28;brand(hero,true,612);
    text(hero,'كل تجربة\nتصنع سمعتنا.',52,C.white,true,612);
    text(hero,'مساحة واحدة لمتابعة التقييمات، وتنظيم الشفتات، والاحتفاء بأثر الفريق.',18,C.white,false,612);
    const orbit=box(hero,'Static orbital motif',612,'HORIZONTAL',null,40,32);orbit.counterAxisAlignItems='CENTER';
    for(const a of ['✦','✦','✦']){const q=box(orbit,'Orbit star',120,'VERTICAL',null,20,0);q.strokes=[{type:'SOLID',color:rgb('#7296F0')}];q.strokeWeight=1;q.cornerRadius=60;text(q,a,45,C.white,true,80);}
    const benefits=box(hero,'Benefits',612,'HORIZONTAL',null,0,12);
    for(const a of ['إدارة أسهل','فريق أقرب','نتائج أوضح'])text(benefits,a,14,C.white,true,196);
  }
  return s;
}
await login(false);await login(true);
function heading(parent,title,sub,w){text(parent,title,28,C.navy,true,w);if(sub)text(parent,sub,13,C.muted,false,w);}
function row(parent,values,w,bg=C.white){const n=box(parent,'Data row',w,'HORIZONTAL',bg,16,12);for(const v of values)text(n,v,13,C.navy,false,(w-32-(values.length-1)*12)/values.length);return n;}
function sidebar(parent){const n=box(parent,'RTL sidebar',248,'VERTICAL',C.white,24,24);n.resize(248,896);n.primaryAxisSizingMode='FIXED';brand(n,false,200);text(n,'لوحة الإدارة العامة',12,C.muted);for(const [i,a]of ['الشفتات','الفروع','الموظفات','الملاحظات','الإحصائيات','المزامنة'].entries())pill(n,a,i===0?C.pale:C.white,i===0?C.blue:C.muted,200);text(n,'إدارة السمعة الرقمية',12,C.muted);}
const admin=screen('03 / System administrator / Desktop',1440,960,'HORIZONTAL');
const ac=box(admin,'Main workspace',1104,'VERTICAL',null,16,24);heading(ac,'إدارة الشفتات','نظّمي يوم الفريق وتابعي تغطية الشفتات.');
row(ac,['أكتوبر 2026','جميع الفروع','عرض الشهر'],1072,C.pale);
const table=box(ac,'Shift calendar',1072,'VERTICAL',C.white,24,12);
row(table,['اليوم','الشفت الأول','الشفت الثاني','الإجراء'],1024,C.canvas);
for(const a of ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس'])row(table,[a,'لم تُحدد الموظفات','لم تُحدد الموظفات','عرض الشفت'],1024);
pill(ac,'اختاري يوماً لإدارة الشفتات',C.pale,C.blue,360);sidebar(admin);
const manager=screen('04 / Branch manager / Mobile',390,844);manager.paddingLeft=manager.paddingRight=24;brand(manager,false,342);heading(manager,'شفتات الفرع','تنظيم اليوم يبدأ من هنا.',342);pill(manager,'أكتوبر 2026',C.white,C.navy,342);
const cal=box(manager,'Calendar',342,'VERTICAL',C.white,16,12);row(cal,['خ','ر','ث','إ','ح'],310,C.pale);for(let i=0;i<3;i++)row(cal,Array.from({length:5},(_,j)=>String(1+i*5+j)),310);
row(manager,['الشفت الأول','اختيار الموظفات'],342);row(manager,['الشفت الثاني','اختيار الموظفات'],342);
await libraryControl(manager,'button','حفظ الشفتات',342);row(manager,['الشفتات','حسابي'],342,C.pale);
const employee=screen('05 / Employee results / Mobile',390,960);employee.paddingLeft=employee.paddingRight=24;brand(employee,false,342);heading(employee,'أهلاً بكِ','نتائجك، وأثر كل تجربة.',342);
const score=box(employee,'Monthly score',342,'VERTICAL',C.navy,24,8);text(score,'نتيجة الشهر الحالي',14,C.white);text(score,'—',56,C.white,true);text(score,'فترة النتيجة: أكتوبر 2026',12,C.white);
const grid=box(employee,'Metrics',342,'VERTICAL',null,0,12);row(grid,['إجمالي التقييمات  —','إيجابي  —'],342);row(grid,['شكاوى  —','مخالفات سلامة  —'],342);
row(employee,['سجل التقييمات','⌄'],342);row(employee,['سجل الشفتات','⌄'],342);row(employee,['نتائجي','حسابي'],342,C.pale);
const ranking=screen('06 / Leaderboard / Desktop',1440,960);brand(ranking,false,1376);heading(ranking,'أثر يستحق التقدير','نحتفي بتجارب الفريق، يوماً بعد يوم.');
const ranks=box(ranking,'Recognition stage',1376,'HORIZONTAL',C.navy,48,32);
for(const [i,a]of ['نشاط الأسبوع','الترتيب الشهري','نجمة الثناء'].entries()){const card=box(ranks,a,405,'VERTICAL',C.white,24,20);text(card,a,20,C.navy,true,357);text(card,'✦',64,C.blue,true,357);text(card,'يظهر الترتيب عند توفر النتائج',14,C.muted,false,357);pill(card,i===1?'لوحة الترتيب':'عرض التفاصيل',C.pale,C.blue,357);}
row(ranking,['الفروع','الموظفات','صفحتي'],1376,C.white);
const profile=screen('07 / Profile / Mobile',390,844);profile.paddingLeft=profile.paddingRight=24;brand(profile,false,342);heading(profile,'حسابي','بياناتك وإعدادات حسابك.',342);pill(profile,'الملف الشخصي',C.pale,C.blue,342);row(profile,['الاسم','—'],342);row(profile,['الفرع','—'],342);await libraryControl(profile,'button','تغيير كلمة المرور',342);row(profile,['نتائجي','حسابي'],342,C.pale);
const states=screen('08 / Interface states',720,960);heading(states,'حالات الواجهة','مرجع للمكونات أثناء الاستخدام.',656);for(const [a,bg,c]of [['جارٍ تحميل النتائج…',C.pale,C.blue],['لا توجد تقييمات لهذه الفترة.',C.white,C.muted],['تعذر تحميل النتائج. حاولي مجدداً.', '#FFF0EF','#B42318'],['تم حفظ التغييرات.', '#E9F5EF',C.green]])pill(states,a,bg,c,656);await libraryControl(states,'input','حقل محدد',656);await libraryControl(states,'button','حفظ التغييرات',656);
await screens[0].screenshot({scale:0.6});await screens[2].screenshot({scale:0.6});
return {createdNodeIds:ids,frames:screens.map(n=>({id:n.id,name:n.name,width:n.width,height:n.height})),componentKeys:{button:buttonSet.key,input:inputSet.key},brief:'docs/figma-redesign-prompt.md',designCommands:1};
