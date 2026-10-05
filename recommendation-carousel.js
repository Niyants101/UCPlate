if(!document.querySelector('link[data-recommendation-carousel]')){
  const stylesheet=document.createElement('link');
  stylesheet.rel='stylesheet';
  stylesheet.href='./recommendation-carousel.css';
  stylesheet.dataset.recommendationCarousel='1';
  document.head.append(stylesheet);
}

const root=document.getElementById('bulkPlan');

function button(label,className,aria){
  const b=document.createElement('button');
  b.type='button';b.className=className;b.textContent=label;b.setAttribute('aria-label',aria);return b;
}

function enhanceRecommendations(){
  if(!root)return;
  const list=root.querySelector('.station-plan-list');
  if(!list||list.dataset.carouselProcessed==='1')return;

  const slides=[];
  list.querySelectorAll('.station-plan').forEach(station=>{
    const stationName=station.querySelector('.station-plan-title h3')?.textContent?.trim()||'Station';
    const theme=station.querySelector('.station-theme')?.textContent?.trim()||'';
    station.querySelectorAll('.plate-option').forEach((option,index)=>{
      const slide=document.createElement('section');
      slide.className='recommendation-slide';
      slide.setAttribute('aria-label',`${stationName}, option ${index+1}`);

      const slideHead=document.createElement('div');
      slideHead.className='recommendation-slide-head';
      const copy=document.createElement('div');
      copy.className='recommendation-slide-title';
      const kicker=document.createElement('span');
      kicker.className='station-kicker';
      kicker.textContent='STATION';
      const title=document.createElement('h3');
      title.textContent=stationName;
      copy.append(kicker,title);
      slideHead.append(copy);
      if(theme){
        const themeChip=document.createElement('span');
        themeChip.className='station-theme';themeChip.textContent=theme;slideHead.append(themeChip);
      }
      slide.append(slideHead,option.cloneNode(true));
      slides.push({node:slide,label:`${stationName} · Option ${index+1}`});
    });
  });

  if(slides.length<=1){list.dataset.carouselProcessed='1';return;}
  list.dataset.carouselProcessed='1';

  const carousel=document.createElement('section');
  carousel.className='recommendation-carousel';
  carousel.tabIndex=0;
  carousel.setAttribute('aria-roledescription','carousel');
  carousel.setAttribute('aria-label','Recommended meal options');

  const controls=document.createElement('div');
  controls.className='recommendation-carousel-controls';
  const prev=button('← Previous','recommendation-carousel-arrow prev','Previous recommended meal');
  const next=button('Next →','recommendation-carousel-arrow next','Next recommended meal');
  const status=document.createElement('div');
  status.className='recommendation-carousel-status';
  const count=document.createElement('strong');
  const label=document.createElement('span');
  status.append(count,label);
  controls.append(prev,status,next);

  const viewport=document.createElement('div');
  viewport.className='recommendation-carousel-viewport';
  viewport.setAttribute('aria-live','polite');

  const dots=document.createElement('div');
  dots.className='recommendation-carousel-dots';
  const dotButtons=slides.map((slide,index)=>{
    const dot=button(String(index+1),'recommendation-carousel-dot',`Show recommended meal ${index+1}`);
    dot.textContent='';dot.addEventListener('click',()=>show(index));dots.append(dot);return dot;
  });

  let current=0;
  function show(index){
    current=(index+slides.length)%slides.length;
    viewport.replaceChildren(slides[current].node);
    count.textContent=`Meal ${current+1} of ${slides.length}`;
    label.textContent=slides[current].label;
    dotButtons.forEach((dot,i)=>dot.classList.toggle('active',i===current));
  }

  prev.addEventListener('click',()=>show(current-1));
  next.addEventListener('click',()=>show(current+1));
  carousel.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'){event.preventDefault();show(current-1);}
    if(event.key==='ArrowRight'){event.preventDefault();show(current+1);}
  });

  let touchX=null;
  viewport.addEventListener('touchstart',event=>{touchX=event.touches[0]?.clientX??null;},{passive:true});
  viewport.addEventListener('touchend',event=>{
    if(touchX===null)return;
    const end=event.changedTouches[0]?.clientX??touchX;
    const delta=end-touchX;touchX=null;
    if(Math.abs(delta)>45)show(current+(delta<0?1:-1));
  },{passive:true});

  carousel.append(controls,viewport,dots);
  list.replaceWith(carousel);
  show(0);
}

if(root){
  enhanceRecommendations();
  const observer=new MutationObserver(()=>enhanceRecommendations());
  observer.observe(root,{childList:true,subtree:true});
}
