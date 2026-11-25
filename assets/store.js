/* ══════════ FIREBASE ══════════ */
const firebaseConfig = { databaseURL: 'https://alamristore-ad281-default-rtdb.firebaseio.com' };
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) { console.warn('Firebase init failed', e); }

/* ══════════ STATE ══════════ */
const $ = id => document.getElementById(id);
const IMG_FALLBACK = 'https://placehold.co/300x225/eeeeee/999999?text=%F0%9F%93%A6';
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let allProducts = [], allCategories = [], shippingZones = [];
let cart = JSON.parse(localStorage.getItem('myCartV16')) || [];
let promoSettings = { freeShip:false, freeShipMin:30000, discount:false, discountMin:50000, discountType:'pct', discountValue:10, homeCatsLimit:8 };
let shipUnlocked = false, discUnlocked = false;
let homeCatsLimit = 8;
let reelObserver = null, isReelsMuted = true;
let currentCatName = '', currentCatSort = 'all';
let reelsSig = '', reelDots = [];
let dataLoaded = false, searchTimer = 0, adRaf = 0;
const navStack = [];

/* ══════════ FIREBASE SYNC ══════════ */
if (db) {
  db.ref().on('value', snap => {
    const d = snap.val() || {};
    dataLoaded = true;
    allProducts   = d.products   ? Object.entries(d.products).map(([id,v])=>({...v,id})) : sampleProducts();
    allCategories = d.categories ? Object.entries(d.categories).map(([id,v])=>({...v,id})) : sampleCats();
    shippingZones = d.shipping   ? Object.values(d.shipping) : sampleShipping();
    if (d.promoSettings) {
      promoSettings = {...promoSettings, ...d.promoSettings};
      homeCatsLimit = parseInt(d.promoSettings.homeCatsLimit) || 8;
    }
    applyBanner(d);
    renderAdCards(d.adCards);
    renderHome();
    renderCatsGrid();
    buildReels();
    populateShippingSelect();
    updateCartBadge();
    updatePromo(false);
    syncTopHeight();
  }, () => useSampleData());
} else {
  setTimeout(useSampleData, 300);
}

function useSampleData(){
  if (dataLoaded) return;
  dataLoaded = true;
  allProducts = sampleProducts();
  allCategories = sampleCats();
  shippingZones = sampleShipping();
  applyBanner({});
  renderAdCards(null);
  renderHome();
  renderCatsGrid();
  buildReels();
  populateShippingSelect();
  updateCartBadge();
  updatePromo(false);
  syncTopHeight();
}

/* safety net: never leave skeletons forever */
setTimeout(() => { if (!dataLoaded) useSampleData(); }, 3500);

/* ══════════ SAMPLE DATA ══════════ */
function sampleProducts(){
  return [
    {id:'s1',name:'سماعة برو ماكس',description:'جودة صوت استثنائية مع إلغاء الضوضاء',price:45000,img:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80',category:'إلكترونيات',badge:'خصم 30%',video:'https://videos.pexels.com/video-files/3209828/3209828-sd_640_360_30fps.mp4'},
    {id:'s2',name:'ساعة ذكية X1',description:'تتابع صحتك وإشعاراتك بأسلوب فاخر',price:75000,img:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80',category:'إلكترونيات',badge:'جديد'},
    {id:'s3',name:'حقيبة جلد برميوم',description:'جلد طبيعي مع حماية كاملة للأجهزة',price:38000,img:'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=400&q=80',category:'أكسسوار',badge:'رائج',video:'https://videos.pexels.com/video-files/4434246/4434246-sd_640_360_25fps.mp4'},
    {id:'s4',name:'عطر مودرن فاخر',description:'مزيج فريد من الخشب والمسك الشرقي',price:28000,img:'https://images.unsplash.com/photo-1541643600914-78b084683702?w=400&q=80',category:'عناية',badge:''},
    {id:'s5',name:'حذاء رياضي إير',description:'راحة لا مثيل لها مع تصميم عصري',price:52000,img:'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80',category:'أزياء',badge:'خصم 20%',video:'https://videos.pexels.com/video-files/8068953/8068953-sd_540_960_25fps.mp4'},
    {id:'s6',name:'كاميرا احترافية',description:'التقط لحظاتك بدقة 48 ميغابكسل',price:180000,img:'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&q=80',category:'إلكترونيات',badge:''},
  ];
}
function sampleCats(){
  return [
    {id:'c1',name:'إلكترونيات',icon:'📱',desc:'موبايلات وأجهزة',color:'linear-gradient(135deg,#3b82f6,#06b6d4)'},
    {id:'c2',name:'أكسسوار',icon:'💍',desc:'مجوهرات وحقائب',color:'linear-gradient(135deg,#ec4899,#8b5cf6)'},
    {id:'c3',name:'أزياء',icon:'👗',desc:'ملابس متنوعة',color:'linear-gradient(135deg,#f59e0b,#ef4444)'},
    {id:'c4',name:'عناية',icon:'🧴',desc:'مستحضرات تجميل',color:'linear-gradient(135deg,#10b981,#06b6d4)'},
  ];
}
function sampleShipping(){ return [{name:'بغداد',price:3000},{name:'البصرة',price:5000},{name:'أربيل',price:6000},{name:'الموصل',price:6000},{name:'النجف',price:5000}]; }

function sampleAdCards(){
  return [
    {img:'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&q=80',title:'تسوق بلا حدود',subtitle:'أفضل الأسعار في كل مكان',badge:'حصري',action:'',showTag:true},
    {img:'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80',title:'أزياء العيد',subtitle:'كوليكشن ربيع ٢٠٢٦',badge:'جديد',action:'category',actionValue:'أزياء',showTag:false},
    {img:'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&q=80',title:'إلكترونيات فاخرة',subtitle:'تقنية بلا تنازلات',badge:'خصم 40%',action:'category',actionValue:'إلكترونيات',showTag:true},
    {img:'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80',title:'عناية وجمال',subtitle:'روتين يومي مثالي',badge:'',action:'category',actionValue:'عناية',showTag:false},
  ];
}

/* ══════════ SKELETONS ══════════ */
function skelCard(){
  return `<div class="p-card skel-card">
    <div class="skeleton" style="width:100%;aspect-ratio:4/3;border-radius:0"></div>
    <div class="p-body">
      <div class="skeleton" style="height:12px;width:82%"></div>
      <div class="skeleton" style="height:10px;width:56%;margin-top:8px"></div>
      <div class="skeleton" style="height:16px;width:44%;margin-top:12px"></div>
    </div>
  </div>`;
}
function skelMini(){
  return `<div class="mini-prod-card skel-mini">
    <div class="skeleton" style="height:108px;border-radius:0"></div>
    <div class="mini-prod-body">
      <div class="skeleton" style="height:10px;width:80%"></div>
      <div class="skeleton" style="height:9px;width:55%;margin-top:7px"></div>
      <div class="skeleton" style="height:12px;width:45%;margin-top:9px"></div>
    </div>
  </div>`;
}
function renderSkeletons(){
  if ($('mostOrderedSection')) { $('mostOrderedSection').style.display = 'block'; }
  if ($('latestSection')) { $('latestSection').style.display = 'block'; }
  if ($('randomSection')) { $('randomSection').style.display = 'block'; }
  if ($('mostOrderedScroll')) $('mostOrderedScroll').innerHTML = skelMini().repeat(3);
  if ($('latestProdsScroll')) $('latestProdsScroll').innerHTML = skelMini().repeat(3);
  if ($('randomProdsGrid')) $('randomProdsGrid').innerHTML = skelCard().repeat(4);
  if ($('storeCatsGrid')) $('storeCatsGrid').innerHTML = `<div class="cat-card skeleton" style="height:168px;animation:none"></div>`.repeat(4);
  if ($('adCardsList')) {
    $('adCardsSection').style.display = 'block';
    $('adCardsList').innerHTML = `<div class="ad-card-wide skeleton" style="animation:none"></div><div class="ad-card-tall skeleton" style="animation:none"></div>`;
  }
}

/* ══════════ AD CARDS ══════════ */
function renderAdCards(adCardsData){
  const sec = $('adCardsSection'), list = $('adCardsList'), dots = $('adDotIndicators');
  if (!sec || !list) return;

  let cards = adCardsData
    ? Object.values(adCardsData).filter(c => c.active !== false)
    : sampleAdCards();

  if (!cards.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  if (dots) {
    dots.innerHTML = cards.map((_, i) => `<div class="ad-dot${i === 0 ? ' active' : ''}"></div>`).join('');
  }

  const cardGrads = [
    'linear-gradient(135deg,rgba(232,121,160,.6),rgba(192,65,122,.75))',
    'linear-gradient(135deg,rgba(79,70,229,.6),rgba(55,48,163,.75))',
    'linear-gradient(135deg,rgba(245,158,11,.55),rgba(239,68,68,.7))',
    'linear-gradient(135deg,rgba(16,185,129,.55),rgba(6,182,212,.7))',
  ];

  list.innerHTML = cards.map((c, i) => {
    const isFirst = i === 0;
    const isTall = !isFirst && i % 2 === 0;
    const cls = isFirst ? 'ad-card-wide featured' : isTall ? 'ad-card-tall' : 'ad-card-wide';
    const badge = c.badge || '';
    const hasImg = c.img && c.img.length > 0;
    const grad = cardGrads[i % cardGrads.length];

    return `
    <div class="${cls}" style="animation-delay:${Math.min(i * 70, 420)}ms"
         onclick="adCardClick('${esc(c.action || '')}','${esc(c.actionValue || '')}')">

      ${hasImg
        ? `<img class="ad-card-img" src="${c.img}" loading="lazy" decoding="async" alt="${c.title || 'إعلان'}">`
        : `<div class="ad-card-placeholder">🛍️</div>`}

      <div class="ad-card-overlay-bottom"></div>
      <div class="ad-card-tint" style="background:${grad}"></div>

      ${badge ? `<div class="ad-float-badge">${badge}</div>` : ''}
      ${c.showTag !== false ? `<div class="ad-tag">إعلان</div>` : ''}

      <div class="ad-info">
        ${c.title ? `<div class="ad-info-title">${c.title}</div>` : ''}
        ${c.subtitle ? `<div class="ad-info-sub">${c.subtitle}</div>` : ''}
        ${c.action || c.title ? `<div class="ad-info-btn"><i class="fa fa-bolt" style="font-size:.6rem"></i> تسوق الآن</div>` : ''}
      </div>
    </div>`;
  }).join('') + `
    <div class="ad-see-all-card" onclick="navTo('p-cats',1)">
      <i class="fa fa-th-large"></i>
      <span>كل<br>الفئات</span>
    </div>`;
}

/* rAF-throttled dot update */
function updateAdDots(el){
  if (adRaf) return;
  adRaf = requestAnimationFrame(() => {
    adRaf = 0;
    const dots = document.querySelectorAll('#adDotIndicators .ad-dot');
    if (!dots.length) return;
    const cards = el.querySelectorAll('.ad-card-wide,.ad-card-tall');
    const listLeft = el.getBoundingClientRect().left;
    let closest = 0, minDist = Infinity;
    cards.forEach((card, i) => {
      const dist = Math.abs(card.getBoundingClientRect().left - listLeft);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    dots.forEach((d, i) => d.classList.toggle('active', i === closest));
  });
}

function adCardClick(action, value){
  switch (action) {
    case 'category': openCatPage(value); break;
    case 'product': {
      const p = allProducts.find(x => x.id === value || x.name === value);
      if (p) openProdPage(p.id);
      break;
    }
    case 'url': if (value) window.open(value, '_blank'); break;
    default: break;
  }
}

/* ══════════ BANNER ══════════ */
const defaultBannerTexts = ['🔥 خصومات حتى 50%','🚚 توصيل سريع للعراق','💎 ضمان 7 أيام','⚡ منتجات جديدة أسبوعياً','🎁 هدية مع كل طلب 50,000+','✨ أكثر من 10,000 عميل سعيد'];
function applyBanner(data){
  const s = data?.bannerSettings || null;
  const txts = data?.banners ? Object.values(data.banners).map(b => b.text).filter(Boolean) : defaultBannerTexts;
  const banner = $('adBanner'), inner = $('bannerInner'), track = $('bannerTrack');
  if (!banner) return;
  if (s && s.active === false) { banner.style.display = 'none'; return; }
  banner.style.display = '';
  if (s?.grad) banner.style.background = s.grad;
  banner.style.setProperty('--bspeed', (s?.speed || 22) + 's');
  const anim = s?.anim || 'marquee';
  const dir = s?.dir || 'rtl';
  inner.className = 'banner-inner bm-' + (anim === 'marquee' ? `marquee-${dir}` : anim);
  const fs = (s?.fontSize || 12.5) + 'px';
  const color = s?.textColor || 'var(--on-main)';
  const doubled = [...txts, ...txts];
  track.innerHTML = doubled.map(t =>
    `<div class="banner-item" style="font-size:${fs};color:${color}">${t} <span>◆</span></div>`
  ).join('');
}

/* ══════════ NAVIGATION ══════════ */
function switchTab(pageId, navIdx){ navStack.length = 0; showPage(pageId, navIdx); }
function navTo(pageId, navIdx){ pushNav(); showPage(pageId, navIdx); }
function navBack(){
  if (!navStack.length) return;
  const prev = navStack.pop();
  showPage(prev.page, prev.navIdx, prev.scrollY);
}
function pushNav(){
  const cur = document.querySelector('.page-node.active,.cat-prods-page.show');
  if (!cur) return;
  navStack.push({
    page: cur.id,
    navIdx: [...document.querySelectorAll('.nav-btn')].findIndex(b => b.classList.contains('active')),
    scrollY: window.scrollY
  });
}
function showPage(pageId, navIdx, scrollY = 0){
  document.querySelectorAll('.page-node').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.cat-prods-page').forEach(p => { p.classList.remove('show'); p.style.display = 'none'; });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const target = $(pageId);
  if (!target) return;
  if (target.classList.contains('cat-prods-page')) { target.style.display = 'block'; target.classList.add('show'); }
  else target.classList.add('active');

  const btns = document.querySelectorAll('.nav-btn');
  if (navIdx >= 0 && btns[navIdx]) btns[navIdx].classList.add('active');

  requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'auto' }));

  if (pageId === 'p-cart') { renderCartPage(); updatePromo(false); }
  if (pageId === 'p-reels') {
    buildReels();
    setupReelObserver();
    const first = document.querySelector('.reel-unit');
    if (first) {
      const v = first.querySelector('video');
      if (v) { v.muted = isReelsMuted; v.play().catch(() => {}); }
      updateReelProgress(0);
    }
  } else {
    if (reelObserver) reelObserver.disconnect();
    document.querySelectorAll('video[data-reel-media]').forEach(v => v.pause());
  }
}
function focusSearch(){
  switchTab('p-home', 0);
  setTimeout(() => $('searchInput')?.focus(), 260);
}

/* ══════════ HOME ══════════ */
const grads = ['linear-gradient(135deg,#7c3aed,#a78bfa)','linear-gradient(135deg,#ef4444,#f97316)','linear-gradient(135deg,#10b981,#06b6d4)','linear-gradient(135deg,#f59e0b,#ec4899)','linear-gradient(135deg,#0ea5e9,#6366f1)','linear-gradient(135deg,#ec4899,#a78bfa)'];
function shuffle(a){ const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function prodsByCat(name){ return allProducts.filter(p => Array.isArray(p.categories) ? p.categories.includes(name) : p.category === name); }

function renderHome(){ renderMostOrdered(); renderLatest(); renderRandom(); }

function renderMostOrdered(){
  const sec = $('mostOrderedSection'), scr = $('mostOrderedScroll');
  if (!scr) return;
  let list = [...allProducts].sort((a, b) => (parseInt(b.orderCount) || 0) - (parseInt(a.orderCount) || 0));
  const hasCounts = list.some(p => p.orderCount > 0);
  if (!hasCounts) list = [...allProducts.filter(p => p.badge), ...allProducts.filter(p => !p.badge)];
  list = list.slice(0, 10);
  if (!list.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  scr.innerHTML = list.map((p, i) => `
    <div class="mini-prod-card" style="animation-delay:${Math.min(i * 45, 360)}ms" onclick="openProdPage('${p.id}')">
      ${p.badge ? `<div class="mini-prod-badge">${p.badge}</div>` : ''}
      ${i === 0 ? `<div style="position:absolute;top:7px;left:7px;z-index:3;background:#f59e0b;color:#fff;font-size:8px;font-weight:900;padding:2px 6px;border-radius:20px">🔥 #1</div>`
        : i < 3 ? `<div style="position:absolute;top:7px;left:7px;z-index:3;background:rgba(245,158,11,.85);color:#fff;font-size:8px;font-weight:900;padding:2px 6px;border-radius:20px">#${i + 1}</div>` : ''}
      <img class="mini-prod-img" src="${p.img || IMG_FALLBACK}" loading="lazy" decoding="async" onerror="this.src='${IMG_FALLBACK}'">
      <div class="mini-prod-body">
        <span class="mini-prod-name">${p.name}</span>
        <p class="mini-prod-desc">${p.description || ''}</p>
        <div class="mini-prod-price">${parseInt(p.price).toLocaleString()} <small>د.ع</small></div>
      </div>
      <button class="mini-add-btn" onclick="event.stopPropagation();addToCart('${p.id}',this)" aria-label="أضف للسلة"><i class="fa fa-plus"></i></button>
    </div>`).join('') + `<div class="mini-see-all-card" onclick="navTo('p-cats',1)"><i class="fa fa-th-large"></i><span>عرض الكل</span></div>`;
}

function renderLatest(){
  const sec = $('latestSection'), scr = $('latestProdsScroll');
  if (!scr) return;
  const list = [...allProducts].slice(-8).reverse();
  if (!list.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  scr.innerHTML = list.map((p, i) => `
    <div class="mini-prod-card" style="animation-delay:${Math.min(i * 45, 360)}ms" onclick="openProdPage('${p.id}')">
      ${p.badge ? `<div class="mini-prod-badge">${p.badge}</div>` : ''}
      <img class="mini-prod-img" src="${p.img || IMG_FALLBACK}" loading="lazy" decoding="async" onerror="this.src='${IMG_FALLBACK}'">
      <div class="mini-prod-body">
        <span class="mini-prod-name">${p.name}</span>
        <p class="mini-prod-desc">${p.description || ''}</p>
        <div class="mini-prod-price">${parseInt(p.price).toLocaleString()} <small>د.ع</small></div>
      </div>
      <button class="mini-add-btn" onclick="event.stopPropagation();addToCart('${p.id}',this)" aria-label="أضف للسلة"><i class="fa fa-plus"></i></button>
    </div>`).join('') + `<div class="mini-see-all-card" onclick="navTo('p-cats',1)"><i class="fa fa-th-large"></i><span>عرض الكل</span></div>`;
}

function renderRandom(){
  const sec = $('randomSection'), grid = $('randomProdsGrid');
  if (!grid) return;
  const list = shuffle(allProducts).slice(0, 8);
  if (!list.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  grid.innerHTML = list.map((p, i) => prodCard(p, i)).join('');
}

/* ══════════ CATEGORIES PAGE ══════════ */
function renderCatsGrid(){
  const grid = $('storeCatsGrid'), lbl = $('allCatsCountLabel');
  if (!grid) return;
  if (lbl) lbl.textContent = allCategories.length + ' فئة';
  if (!allCategories.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-2)">لا توجد فئات بعد</div>`;
    return;
  }
  grid.innerHTML = allCategories.map((c, i) => `
    <div class="cat-card" style="background:${c.color || grads[i % grads.length]};animation-delay:${Math.min(i * 45, 360)}ms" onclick="openCatPage('${esc(c.name)}')">
      ${c.img ? `<img class="cat-card-bg" src="${c.img}" loading="lazy" decoding="async" onerror="this.style.display='none'">` : ''}
      <div class="cat-card-overlay"></div>
      <div class="cat-card-body">
        <div class="cat-card-icon">${c.icon || '🏷️'}</div>
        <div class="cat-card-name">${c.name}</div>
        ${c.desc ? `<div class="cat-card-desc">${c.desc}</div>` : ''}
        <div class="cat-card-count"><i class="fa fa-box" style="font-size:8px"></i>${prodsByCat(c.name).length} منتج</div>
      </div>
    </div>`).join('');
}

/* ══════════ CATEGORY PRODUCTS ══════════ */
function openCatPage(catName){
  pushNav();
  currentCatName = catName;
  currentCatSort = 'all';
  document.querySelectorAll('.cat-sort-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.cat-sort-btn')[0]?.classList.add('active');

  const cat = allCategories.find(c => c.name === catName) || { name: catName, icon: '🏷️', desc: '', color: '', img: '' };
  const hero = $('catProdsHero');
  if (hero) hero.style.background = cat.color || grads[0];
  const bg = $('catProdsHeroBg');
  if (cat.img) { bg.src = cat.img; bg.style.display = 'block'; } else { bg.style.display = 'none'; }

  $('catProdsHeroIcon').textContent = cat.icon || '🏷️';
  $('catProdsHeroName').textContent = cat.name;
  $('catProdsHeroDesc').textContent = cat.desc || '';
  renderCatProds();
  showPage('p-cat-prods', -1);
}
function renderCatProds(){
  let list = prodsByCat(currentCatName);
  $('catProdsHeroCount').textContent = list.length;
  $('catProdsSubLabel').textContent = list.length + ' منتج';
  if (currentCatSort === 'low') list = [...list].sort((a, b) => parseInt(a.price) - parseInt(b.price));
  if (currentCatSort === 'high') list = [...list].sort((a, b) => parseInt(b.price) - parseInt(a.price));
  $('catProdsList').innerHTML = list.length
    ? list.map((p, i) => prodCard(p, i)).join('')
    : `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-2)"><i class="fa fa-box-open" style="font-size:2.6rem;opacity:.2;display:block;margin-bottom:10px"></i>لا توجد منتجات</div>`;
}
function setCatSort(sort, btn){
  currentCatSort = sort;
  document.querySelectorAll('.cat-sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCatProds();
}

/* ══════════ PRODUCT DETAIL ══════════ */
function openProdPage(productId){
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;
  pushNav();
  window.scrollTo({ top: 0, behavior: 'auto' });

  $('prodDetailContent').innerHTML = `
    <div class="prod-detail-hero">
      <img class="prod-detail-hero-img" src="${p.img || IMG_FALLBACK}" onerror="this.src='${IMG_FALLBACK}'" alt="${p.name}">
      <div class="prod-detail-hero-grad"></div>
      <button class="pdh-back" onclick="navBack()" aria-label="رجوع"><i class="fa fa-arrow-right"></i></button>
      <button class="pdh-share" onclick="shareP('${esc(p.name)}')" aria-label="مشاركة"><i class="fa fa-share-alt"></i></button>
      ${p.badge ? `<div class="pdh-badge">${p.badge}</div>` : ''}
    </div>

    <div class="prod-detail-card">
      <div class="prod-detail-top-row">
        <div class="prod-detail-name">${p.name}</div>
        <div class="prod-detail-price-box">
          <div class="prod-detail-price-main">${parseInt(p.price).toLocaleString()}</div>
          <div class="prod-detail-price-cur">د.ع</div>
        </div>
      </div>

      <div class="prod-detail-meta">
        ${p.category ? `<span class="prod-meta-tag"><i class="fa fa-tag" style="color:var(--main)"></i>${p.category}</span>` : ''}
        <span class="prod-meta-tag"><i class="fa fa-check-circle" style="color:#10b981"></i>متوفر</span>
        ${p.orderCount ? `<span class="prod-meta-tag"><i class="fa fa-fire" style="color:#f59e0b"></i>${p.orderCount} طلب</span>` : ''}
      </div>

      <div class="prod-detail-divider"></div>

      <div class="prod-detail-desc-label"><i class="fa fa-align-right" style="color:var(--main)"></i> تفاصيل المنتج</div>
      <div class="prod-detail-desc">${p.description || 'منتج مميز بجودة عالية ومواصفات ممتازة.'}</div>
    </div>

    <div class="prod-detail-actions">
      <button class="pda-cart" onclick="addToCart('${p.id}',this)"><i class="fa fa-shopping-cart"></i> أضف للسلة</button>
      <a class="pda-wa" href="https://wa.me/9647853492538?text=${encodeURIComponent('أريد الاستفسار عن: ' + p.name)}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> واتساب</a>
    </div>`;
  showPage('p-product', -1);
}

function prodCard(p, i){
  return `<div class="p-card" style="animation-delay:${Math.min(i * 40, 320)}ms" onclick="openProdPage('${p.id}')">
    ${p.badge ? `<div class="p-badge">${p.badge}</div>` : ''}
    <div class="p-img-holder"><img src="${p.img || IMG_FALLBACK}" loading="lazy" decoding="async" onerror="this.src='${IMG_FALLBACK}'" alt="${p.name}"></div>
    <div class="p-body">
      <span class="p-title">${p.name}</span>
      <p class="p-desc-short">${p.description || ''}</p>
      <div class="p-footer">
        <span class="p-price-tag">${parseInt(p.price).toLocaleString()} <small>د.ع</small></span>
        <button class="add-to-cart-btn" onclick="event.stopPropagation();addToCart('${p.id}',this)" aria-label="أضف للسلة"><i class="fa fa-plus"></i></button>
      </div>
    </div>
  </div>`;
}

/* ══════════ SEARCH (debounced) ══════════ */
function onSearchInput(){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 150);
}
function applySearch(){
  const q = ($('searchInput')?.value || '').trim().toLowerCase();
  const rw = $('searchResultsWrap'), mc = $('homeMainContent'), cl = $('searchClear');
  if (cl) cl.classList.toggle('show', !!q);
  if (!q) { rw.style.display = 'none'; mc.style.display = 'block'; return; }
  rw.style.display = 'block'; mc.style.display = 'none';
  const res = allProducts.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q) ||
    (p.category || '').toLowerCase().includes(q)
  );
  $('searchResultsLabel').textContent = res.length ? `${res.length} نتيجة لـ "${q}"` : `لا نتائج لـ "${q}"`;
  $('searchResultsList').innerHTML = res.length
    ? res.map((p, i) => prodCard(p, i)).join('')
    : `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--text-2)"><i class="fa fa-search" style="font-size:2.2rem;opacity:.2;display:block;margin-bottom:10px"></i>لا توجد نتائج</div>`;
}
function clearSearch(){
  const i = $('searchInput');
  if (i) { i.value = ''; i.focus(); }
  applySearch();
}

/* ══════════ CART ══════════ */
function addToCart(id, btn){
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const ex = cart.find(x => x.id === id);
  if (ex) ex.qty++; else cart.push({ ...p, qty: 1 });
  localStorage.setItem('myCartV16', JSON.stringify(cart));
  updateCartBadge();
  showToast(`✅ ${p.name} أُضيف للسلة`);

  if (btn) {
    const rect = btn.getBoundingClientRect();
    if (!REDUCED) spawnRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);
    btn.style.transform = 'scale(.72) rotate(14deg)';
    setTimeout(() => btn.style.transform = '', 280);
    const card = btn.closest('.p-card');
    if (card && !REDUCED) { card.classList.add('liquid-pulse'); setTimeout(() => card.classList.remove('liquid-pulse'), 560); }
  }
  if (navigator.vibrate) navigator.vibrate(35);
  updatePromo(true);
}
function changeQty(idx, d){
  cart[idx].qty += d;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  localStorage.setItem('myCartV16', JSON.stringify(cart));
  updateCartBadge(); renderCartPage(); updatePromo(true);
}
function updateCartBadge(){
  const n = cart.reduce((s, i) => s + i.qty, 0);
  const b = $('cartCount');
  if (b) {
    b.textContent = n;
    b.style.display = n > 0 ? 'flex' : 'none';
    if (n > 0 && !REDUCED) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }
  const c = $('cartItemsCount');
  if (c) c.textContent = n;
}
function renderCartPage(){
  const list = $('cartItemsDisplay'), footer = $('cartFooter'), empty = $('emptyCart');
  if (!list) return;
  if (!cart.length) {
    list.innerHTML = ''; footer.style.display = 'none'; empty.style.display = 'flex';
    updatePromo(false); return;
  }
  empty.style.display = 'none'; footer.style.display = 'block';
  list.innerHTML = cart.map((it, idx) => `
    <div class="cart-item-row">
      <img class="cart-item-img" src="${it.img || IMG_FALLBACK}" onerror="this.src='${IMG_FALLBACK}'" alt="">
      <div class="cart-item-info">
        <div class="cart-item-name">${it.name}</div>
        <div class="cart-item-price">${(parseInt(it.price) * it.qty).toLocaleString()} د.ع</div>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="changeQty(${idx},-1)" aria-label="تقليل">−</button>
        <span class="qty-num">${it.qty}</span>
        <button class="qty-btn" onclick="changeQty(${idx},1)" aria-label="زيادة">+</button>
      </div>
      <button class="remove-btn" onclick="changeQty(${idx},-99)" aria-label="حذف"><i class="fa fa-trash"></i></button>
    </div>`).join('');

  const sub = cart.reduce((s, i) => s + parseInt(i.price) * i.qty, 0);
  const disc = calcDiscount(sub);
  const free = (promoSettings.freeShip === true || promoSettings.freeShip === 'true') && sub >= (parseInt(promoSettings.freeShipMin) || 30000);

  $('subPrice').textContent = sub.toLocaleString() + ' د.ع';
  const dr = $('discRow');
  if (disc > 0) { dr.style.display = 'flex'; $('discAmount').textContent = '−' + disc.toLocaleString() + ' د.ع'; }
  else dr.style.display = 'none';
  $('deliveryFee').innerHTML = free ? '<b style="color:#10b981">مجاني 🎉</b>' : 'يحدد عند اختيار المنطقة';
  $('grandTotal').textContent = (sub - disc).toLocaleString() + ' د.ع';
  updatePromo(false);
}

/* ══════════ PROMO ══════════ */
function calcDiscount(sub){
  const on = promoSettings.discount === true || promoSettings.discount === 'true';
  if (!on || sub < (parseInt(promoSettings.discountMin) || 50000)) return 0;
  const v = parseFloat(promoSettings.discountValue) || 10;
  return promoSettings.discountType === 'pct' ? Math.round(sub * v / 100) : parseInt(v);
}
function updatePromo(animate){
  const sub = cart.reduce((s, i) => s + parseInt(i.price) * i.qty, 0);
  const bar = $('promoBar');
  const hs = promoSettings.freeShip === true || promoSettings.freeShip === 'true';
  const hd = promoSettings.discount === true || promoSettings.discount === 'true';
  if (!hs && !hd) { if (bar) bar.classList.remove('show'); return; }
  if (bar) bar.classList.add('show');

  const shipCard = $('promoShipCard');
  if (hs && shipCard) {
    shipCard.style.display = 'block';
    const min = parseInt(promoSettings.freeShipMin) || 30000;
    const pct = Math.min(sub / min * 100, 100);
    const was = !shipUnlocked; shipUnlocked = sub >= min;
    $('liquidShipFill').style.width = pct + '%';
    $('liquidShipPct').textContent = Math.round(pct) + '%';
    if (shipUnlocked) {
      $('promoShipTitle').textContent = '🎉 تم تفعيل التوصيل المجاني!';
      $('promoShipSub').textContent = 'توصيل مجاني مطبّق ✓';
      $('promoShipBadge').className = 'promo-badge pb-glow';
      $('promoShipBadge').textContent = '✓ مفعّل';
      shipCard.className = 'promo-card pc-ship pc-active-ship glow-ship';
      if (animate && was) {
        const r = shipCard.getBoundingClientRect();
        spawnSparkles(r.left + r.width / 2, r.top + r.height / 2, '#10b981');
        showUnlockToast('🚚 تم تفعيل التوصيل المجاني!', 'ship');
      }
    } else {
      const rem = (min - sub).toLocaleString();
      $('promoShipTitle').textContent = `أضف ${rem} د.ع للتوصيل المجاني`;
      $('promoShipSub').textContent = `باقي ${rem} د.ع 🚚`;
      $('promoShipBadge').className = 'promo-badge pb-green';
      $('promoShipBadge').textContent = 'مجاني';
      shipCard.className = 'promo-card pc-ship';
    }
  } else if (shipCard) shipCard.style.display = 'none';

  const discCard = $('promoDiscCard');
  if (hd && discCard) {
    discCard.style.display = 'block';
    const min = parseInt(promoSettings.discountMin) || 50000;
    const pct = Math.min(sub / min * 100, 100);
    const was = !discUnlocked; discUnlocked = sub >= min;
    $('liquidDiscFill').style.width = pct + '%';
    $('liquidDiscPct').textContent = Math.round(pct) + '%';
    const v = parseFloat(promoSettings.discountValue) || 10;
    const lbl = promoSettings.discountType === 'pct' ? v + '%' : parseInt(v).toLocaleString() + ' د.ع';
    if (discUnlocked) {
      $('promoDiscTitle').textContent = `🎉 تم تطبيق خصم ${lbl}!`;
      $('promoDiscSub').textContent = 'الخصم مطبّق ✓';
      $('promoDiscBadge').className = 'promo-badge pb-glow-y';
      $('promoDiscBadge').textContent = `✓ −${lbl}`;
      discCard.className = 'promo-card pc-disc pc-active-disc glow-disc';
      if (animate && was) {
        const r = discCard.getBoundingClientRect();
        spawnSparkles(r.left + r.width / 2, r.top + r.height / 2, '#f59e0b');
        showUnlockToast(`🏷️ تم تطبيق خصم ${lbl}!`, 'disc');
      }
    } else {
      const rem = (min - sub).toLocaleString();
      $('promoDiscTitle').textContent = `أضف ${rem} د.ع للحصول على خصم ${lbl}`;
      $('promoDiscSub').textContent = `باقي ${rem} د.ع 🏷️`;
      $('promoDiscBadge').className = 'promo-badge pb-yellow';
      $('promoDiscBadge').textContent = `خصم ${lbl}`;
      discCard.className = 'promo-card pc-disc';
    }
  } else if (discCard) discCard.style.display = 'none';
}
function spawnRipple(cx, cy){
  const el = document.createElement('div');
  el.className = 'cart-ripple';
  el.style.cssText = `left:${cx - 30}px;top:${cy - 30}px;width:60px;height:60px;background:radial-gradient(circle,var(--main) 0%,transparent 70%);`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 700);
}
function spawnSparkles(cx, cy, color){
  if (REDUCED) return;
  const colors = [color, '#fbbf24', '#06b6d4', '#f43f5e', '#a78bfa'];
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('div');
    el.className = 'sparkle';
    const a = (i / 12) * 360, d = 40 + Math.random() * 60;
    el.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[i % colors.length]};--sx:${Math.cos(a * Math.PI / 180) * d}px;--sy:${Math.sin(a * Math.PI / 180) * d}px;animation-delay:${i * .04}s;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
}
function showUnlockToast(msg, type){
  const t = $('unlockToast');
  t.textContent = msg;
  t.className = `unlock-toast ut-${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

/* ══════════ SHIPPING ══════════ */
function populateShippingSelect(){
  const sel = $('ordRegion'), drop = $('customRegionDropdown');
  if (!sel) return;

  sel.innerHTML = `<option value="0">اختر المنطقة...</option>` + shippingZones.map(z =>
    `<option value="${z.price}">${z.name} — ${parseInt(z.price).toLocaleString()} د.ع</option>`
  ).join('');

  if (drop) {
    const isFreeShipActive = (promoSettings.freeShip === true || promoSettings.freeShip === 'true');
    const govIcons = {'بغداد':'🏛️','البصرة':'🌊','أربيل':'⛰️','الموصل':'🏛️','النجف':'🕌','كربلاء':'🕌','السليمانية':'⛰️','كركوك':'🏙️','الأنبار':'🌵','ميسان':'🌿','ذي قار':'🏺','المثنى':'🌾','القادسية':'🌾','واسط':'🌾','ديالى':'🌴','صلاح الدين':'🌾','بابل':'🏺','دهوك':'⛰️'};
    drop.innerHTML = `<div class="csd-option placeholder" onclick="selectRegionOption(0,'اختر المنطقة...','','')">
        <div class="csd-opt-icon"><i class="fa fa-times"></i></div>
        <span class="csd-opt-name">اختر المنطقة...</span>
      </div>` + shippingZones.map(z => {
      const icon = govIcons[z.name] || '📍';
      const isFree = isFreeShipActive && z.price == 0;
      return `<div class="csd-option${isFree ? ' free-ship' : ''}"
        onclick="selectRegionOption(${z.price},'${esc(z.name)}','${icon}','${parseInt(z.price).toLocaleString()} د.ع')">
        <div class="csd-opt-icon">${icon}</div>
        <span class="csd-opt-name">${z.name}</span>
        <span class="csd-opt-price">${isFree ? '🎉 مجاني' : parseInt(z.price).toLocaleString() + ' د.ع'}</span>
      </div>`;
    }).join('');
  }
}

/* ══════════ CUSTOM DROPDOWN ══════════ */
function toggleCustomSelect(){
  const trig = $('customRegionTrigger'), drop = $('customRegionDropdown');
  if (!trig || !drop) return;
  const isOpen = drop.classList.contains('open');
  trig.classList.toggle('open', !isOpen);
  drop.classList.toggle('open', !isOpen);
}
function closeCustomSelect(){
  $('customRegionTrigger')?.classList.remove('open');
  $('customRegionDropdown')?.classList.remove('open');
}
function selectRegionOption(price, name, icon, priceLabel){
  const sel = $('ordRegion');
  if (sel) {
    for (let i = 0; i < sel.options.length; i++) {
      if (parseInt(sel.options[i].value) === parseInt(price)) { sel.selectedIndex = i; break; }
    }
  }
  const nameEl = $('cstSelectedName'), hintEl = $('cstSelectedHint');
  const iconEl = $('customRegionTrigger')?.querySelector('.cst-icon');
  if (nameEl) nameEl.textContent = (price > 0 || name !== 'اختر المنطقة...') ? name : 'اختر منطقة التوصيل';
  if (hintEl) hintEl.textContent = price > 0 ? (priceLabel || '') : 'سيتم احتساب سعر التوصيل';
  if (iconEl) iconEl.innerHTML = icon ? `<span style="font-size:1.05rem">${icon}</span>` : '<i class="fa fa-map-marker-alt"></i>';

  document.querySelectorAll('#customRegionDropdown .csd-option').forEach(el => {
    el.classList.toggle('selected', el.querySelector('.csd-opt-name')?.textContent === name && price > 0);
  });

  closeCustomSelect();
  recalcModal();
}
document.addEventListener('click', e => {
  if (!e.target.closest('#customRegionWrap')) closeCustomSelect();
});

function recalcModal(){
  const sub = cart.reduce((s, i) => s + parseInt(i.price) * i.qty, 0);
  const rawFee = parseInt($('ordRegion')?.value) || 0;
  const disc = calcDiscount(sub);
  const free = (promoSettings.freeShip === true || promoSettings.freeShip === 'true') && sub >= (parseInt(promoSettings.freeShipMin) || 30000);
  const fee = free ? 0 : rawFee;

  $('mSub').textContent = sub.toLocaleString() + ' د.ع';
  $('mFee').textContent = free ? '🎉 مجاني' : fee.toLocaleString() + ' د.ع';
  $('mTotal').textContent = (sub - disc + fee).toLocaleString() + ' د.ع';

  const dr = $('mDiscRow');
  if (disc > 0) { dr.style.display = 'flex'; $('mDisc').textContent = '−' + disc.toLocaleString() + ' د.ع'; }
  else dr.style.display = 'none';
}

/* ══════════ ORDER ══════════ */
function openOrderModal(){
  if (!cart.length) { showToast('السلة فارغة!'); return; }
  const prof = JSON.parse(localStorage.getItem('profileV16')) || {};
  if (prof.name) $('ordName').value = prof.name;
  if (prof.phone) $('ordPhone').value = prof.phone;
  if (prof.addr) $('ordAddr').value = prof.addr;

  $('orderItemsSummary').innerHTML = cart.map(i =>
    `<div class="order-item-line"><span>${i.name} × ${i.qty}</span><b>${(parseInt(i.price) * i.qty).toLocaleString()} د.ع</b></div>`
  ).join('');

  recalcModal();
  $('orderModal').classList.add('open');
  document.body.classList.add('modal-open');
  setTimeout(() => { if (!prof.name) $('ordName')?.focus(); }, 380);
}
function closeOrderModal(){
  $('orderModal').classList.remove('open');
  document.body.classList.remove('modal-open');
  closeCustomSelect();
}
function submitOrder(){
  const name = $('ordName').value.trim();
  const phone = $('ordPhone').value.trim();
  const addr = $('ordAddr').value.trim();
  const reg = $('ordRegion');
  const rawFee = parseInt(reg?.value) || 0;
  const notes = $('ordNotes').value.trim();

  if (!name || !phone || !addr) { showToast('⚠️ أكمل جميع الحقول'); return; }
  if (!rawFee) { showToast('⚠️ اختر منطقة التوصيل'); return; }

  const sub = cart.reduce((s, i) => s + parseInt(i.price) * i.qty, 0);
  const disc = calcDiscount(sub);
  const free = (promoSettings.freeShip === true || promoSettings.freeShip === 'true') && sub >= (parseInt(promoSettings.freeShipMin) || 30000);
  const fee = free ? 0 : rawFee;
  const total = sub - disc + fee;
  const zoneText = reg.options[reg.selectedIndex].text;

  let msg = `*طلب جديد من A-STORE V1*%0A━━━━━━━━━━━━━━━━━━%0A`;
  msg += `👤 ${name}%0A📞 ${phone}%0A📍 ${addr}%0A🚚 ${zoneText}${free ? ' (مجاني 🎉)' : ''}%0A`;
  if (notes) msg += `📝 ${notes}%0A`;
  msg += `━━━━━━━━━━━━━━━━━━%0A`;
  cart.forEach(i => msg += `• ${i.name} × ${i.qty} = ${(parseInt(i.price) * i.qty).toLocaleString()} د.ع%0A`);
  msg += `━━━━━━━━━━━━━━━━━━%0A💰 المنتجات: ${sub.toLocaleString()} د.ع%0A`;
  if (disc > 0) msg += `🏷️ خصم: −${disc.toLocaleString()} د.ع%0A`;
  msg += `🚚 التوصيل: ${free ? 'مجاني 🎉' : fee.toLocaleString() + ' د.ع'}%0A✅ الإجمالي: ${total.toLocaleString()} د.ع`;

  if (db) {
    db.ref('orders').push({
      customer: name, phone, address: addr, zone: zoneText,
      total, discount: disc, freeShipping: free, status: 'new',
      date: new Date().toLocaleDateString('ar-IQ'),
      orderNum: '#' + Math.floor(1000 + Math.random() * 9000),
      items: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price }))
    });
  }

  window.open(`https://wa.me/9647853492538?text=${msg}`);
  closeOrderModal();
  cart = [];
  localStorage.setItem('myCartV16', '[]');
  shipUnlocked = false; discUnlocked = false;
  updateCartBadge();
  showToast('🎉 تم إرسال طلبك بنجاح!');
}

/* ══════════ PROFILE ══════════ */
function saveProfile(){
  const d = { name: $('uName').value, phone: $('uPhone').value, addr: $('uAddr').value };
  localStorage.setItem('profileV16', JSON.stringify(d));
  $('displayName').textContent = `مرحباً ${d.name || 'بك'} 👋`;
  showToast('✅ تم حفظ بياناتك');
}
function setTheme(t){
  ['pink','snow','emerald','black','royal'].forEach(x => document.body.classList.remove('theme-' + x));
  document.body.classList.add('theme-' + t);
  localStorage.setItem('themeV16', t);
  document.querySelectorAll('.theme-dot-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.t-' + t)?.classList.add('active');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--bg').trim());
  syncTopHeight();
}

/* ══════════ REELS ══════════ */
function buildReels(){
  const c = $('reelsList');
  if (!c) return;
  const ps = allProducts.length ? allProducts : sampleProducts();
  const sig = ps.map(p => `${p.id}|${p.video || ''}|${p.img || ''}`).join('~');
  if (sig === reelsSig) return;
  reelsSig = sig;

  const dg = ['linear-gradient(135deg,#ff9a9e,#fecfef)','linear-gradient(135deg,#a18cd1,#fbc2eb)','linear-gradient(135deg,#84fab0,#8fd3f4)','linear-gradient(135deg,#ffecd2,#fcb69f)'];
  c.innerHTML = ps.map((p, i) => {
    const isV = p.video && p.video.includes('.mp4');
    return `<div class="reel-unit" data-index="${i}">
      ${isV ? `<video class="reel-media" src="${p.video}" loop playsinline muted preload="none" data-reel-media="true"></video>`
            : p.img ? `<img class="reel-media" src="${p.img}" loading="lazy" decoding="async" onerror="this.style.display='none'" data-reel-media="true" alt="">`
                    : `<div style="position:absolute;inset:0;background:${dg[i % 4]};display:flex;align-items:center;justify-content:center;font-size:5rem">🛍️</div>`}
      ${isV ? `<button class="reel-mute-btn" onclick="toggleMute(this)" aria-label="صوت"><i class="fa fa-volume-mute"></i></button>` : ''}
      <div class="reel-top-grad"></div><div class="reel-grad"></div>
      <div class="reel-actions">
        <div class="reel-act" onclick="addToCart('${p.id}',this)"><div class="reel-act-circle"><i class="fa fa-cart-plus"></i></div><span class="reel-act-label">سلة</span></div>
        <div class="reel-act" onclick="toggleLike(this)"><div class="reel-act-circle"><i class="fa fa-heart"></i></div><span class="reel-act-label like-n">إعجاب</span></div>
        <div class="reel-act" onclick="shareP('${esc(p.name)}')"><div class="reel-act-circle"><i class="fa fa-share-alt"></i></div><span class="reel-act-label">نشر</span></div>
      </div>
      <div class="reel-info">
        <div class="reel-shop-tag"><i class="fa fa-store"></i> A-STORE</div>
        <div class="reel-prod-name">${p.name}</div>
        <div class="reel-prod-desc">${p.description || 'منتج مميز بجودة عالية'}</div>
        <div class="reel-price-badge"><i class="fa fa-tag" style="color:#fbbf24"></i><span>${parseInt(p.price).toLocaleString()}</span> <small>د.ع</small></div>
        <button class="reel-order-btn" onclick="addToCart('${p.id}',this)"><i class="fa fa-plus-circle"></i> أضف للسلة</button>
      </div>
      <div class="reel-progress">${ps.map((_, j) => `<div class="reel-dot${j === 0 ? ' active' : ''}"></div>`).join('')}</div>
    </div>`;
  }).join('');

  reelDots = [...c.querySelectorAll('.reel-unit')].map(u => [...u.querySelectorAll('.reel-dot')]);
  setupReelObserver();
}
function setupReelObserver(){
  if (reelObserver) reelObserver.disconnect();
  const root = $('reelsList');
  if (!root) return;
  reelObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target.querySelector('video[data-reel-media]');
      if (e.isIntersecting) {
        if (v) { v.muted = isReelsMuted; v.play().catch(() => {}); }
        updateReelProgress(parseInt(e.target.dataset.index));
      } else if (v) v.pause();
    });
  }, { root, threshold: .75 });
  root.querySelectorAll('.reel-unit').forEach(r => reelObserver.observe(r));
}
function updateReelProgress(ai){
  reelDots.forEach(dots => dots.forEach((d, j) => d.classList.toggle('active', j === ai)));
}
function toggleMute(btn){
  isReelsMuted = !isReelsMuted;
  const v = btn.closest('.reel-unit').querySelector('video');
  if (v) v.muted = isReelsMuted;
  document.querySelectorAll('.reel-mute-btn i').forEach(i => i.className = isReelsMuted ? 'fa fa-volume-mute' : 'fa fa-volume-up');
}
const likes = {};
function toggleLike(el){
  const c = el.querySelector('.like-c i') || el.querySelector('i');
  const n = el.querySelector('.like-n');
  const k = el.closest('.reel-unit').dataset.index;
  likes[k] = likes[k] || 0;
  if (c.style.color === 'rgb(239, 68, 68)') { c.style.color = '#fff'; likes[k] = Math.max(0, likes[k] - 1); }
  else { c.style.color = '#ef4444'; likes[k]++; }
  n.textContent = likes[k] || 'إعجاب';
}
function shareP(name){
  if (navigator.share) navigator.share({ title: name, url: window.location.href }).catch(() => {});
  else showToast('تم نسخ الرابط!');
}

/* ══════════ TOAST ══════════ */
let _tt;
function showToast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_tt);
  _tt = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ══════════ HELPERS ══════════ */
function esc(s){
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function syncTopHeight(){
  const ts = document.querySelector('.top-stack');
  const h = ts ? ts.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty('--top-h', Math.round(h) + 'px');
}
window.addEventListener('resize', syncTopHeight, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(syncTopHeight, 250), { passive: true });

/* ══════════ INIT ══════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeOrderModal(); closeCustomSelect(); }
});

window.addEventListener('load', () => {
  setTheme(localStorage.getItem('themeV16') || 'pink');

  const prof = JSON.parse(localStorage.getItem('profileV16'));
  if (prof) {
    if (prof.name) { $('uName').value = prof.name; $('displayName').textContent = `مرحباً ${prof.name} 👋`; }
    if (prof.phone) $('uPhone').value = prof.phone;
    if (prof.addr) $('uAddr').value = prof.addr;
  }

  cart = JSON.parse(localStorage.getItem('myCartV16')) || [];
  updateCartBadge();
  syncTopHeight();
});

renderSkeletons();
syncTopHeight();
