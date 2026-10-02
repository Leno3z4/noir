const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const W=canvas.width,H=canvas.height,GRAVITY=1450,JUMP=-560,R=13,TILE=30,ROW_GAP=104;
const el={menu:document.querySelector('#menu'),over:document.querySelector('#game-over'),start:document.querySelector('#start'),restart:document.querySelector('#restart'),height:document.querySelector('#height'),best:document.querySelector('#best'),speed:document.querySelector('#speed'),final:document.querySelector('#final-height'),newBest:document.querySelector('#new-best'),seed:document.querySelector('#seed')};
const state={running:false,time:0,cameraY:0,score:0,best:Number(localStorage.getItem('dlicom-best')||0),seed:0,rng:null,charge:0,flash:0,launchTimer:0,currentPlatformId:0};
const input={left:false,right:false},platforms=[];
const player={x:W/2,y:520,vx:0,vy:0,lastY:520};
el.best.textContent=String(state.best);

function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function rand(a,b){return a+(b-a)*state.rng()}
function axis(){return(input.right?1:0)-(input.left?1:0)}
function difficulty(){return Math.min(1,state.score/4500)}
function profileAt(height){
  if(height<500)return {minTiles:4,maxTiles:4,minGap:92,maxGap:98,moving:0};
  if(height<1500)return {minTiles:4,maxTiles:5,minGap:92,maxGap:100,moving:.05};
  if(height<3000)return {minTiles:3,maxTiles:4,minGap:94,maxGap:102,moving:.18};
  return {minTiles:2,maxTiles:4,minGap:96,maxGap:106,moving:.3};
}
function snapped(value){return Math.round(value/TILE)*TILE}
function wrappedDistance(a,b){
  const direct=Math.abs(a-b);
  return Math.min(direct,W-direct);
}
function reachable(prev,next){
  const gap=Math.abs(prev.y-next.y);
  const discriminant=JUMP*JUMP-2*GRAVITY*gap;
  if(discriminant<0)return false;
  const descendingTime=(-JUMP+Math.sqrt(discriminant))/GRAVITY;
  const maxTravel=190*1.35*descendingTime+prev.w*.5;
  return wrappedDistance(prev.x+prev.w/2,next.x+next.w/2)<=maxTravel;
}
function makePlatform(x,y,tiles,type,id,starter=false){
  const w=tiles*TILE;
  const safeX=Math.max(0,Math.min(W-w,x));
  return {
    x:snapped(safeX),y,w,h:12,type,seed:id,baseX:snapped(safeX),
    phase:rand(0,Math.PI*2),
    amplitude:type==='moving'?Math.min(TILE*1.5,8+difficulty()*8):0,
    speed:type==='moving'?rand(.7,1.05):0,
    tiles,side:safeX===0?'left':safeX===W-w?'right':'mid',
    active:true,starter
  };
}
function addAbove(prev,n){
  const row=n+1,p=profileAt(Math.max(0,state.score));
  const tiles=Math.floor(rand(p.minTiles,p.maxTiles+1));
  const w=tiles*TILE;
  const gap=rand(p.minGap,p.maxGap);
  const y=prev.y-gap;

  // Early climb follows the deliberate left/right tile rhythm.
  let x;
  if(state.score<500){
    const side=row%2===1?'right':'left';
    x=side==='left'?0:W-w;
  }else{
    const side=state.rng()<.65?(row%2===1?'right':'left'):(rand(0,1)<.5?'left':'right');
    const inset=Math.round(rand(0,Math.max(0,W-w))*0.22);
    x=side==='left'?inset:(W-w)-inset;
  }

  const type=rand(0,1)<p.moving?'moving':'static';
  let candidate=makePlatform(x,y,tiles,type,n);

  if(!reachable(prev,candidate)){
    const fallbackX=prev.x<=W/2?Math.max(0,W-w-30):0;
    candidate=makePlatform(fallbackX,y,tiles,'static',n);
  }

  platforms.push(candidate);
  return candidate;
}
function seedIntroRoute(){
  const gap=96;
  const tiles=4;
  const width=tiles*TILE;

  // Starter is always the bottom-left tile block.
  const route=[
    {x:0,y:H-35},
    {x:W-width,y:H-35-gap},
    {x:0,y:H-35-gap*2},
    {x:W-width,y:H-35-gap*3},
    {x:0,y:H-35-gap*4},
    {x:W-width,y:H-35-gap*5},
    {x:0,y:H-35-gap*6}
  ];

  for(let i=0;i<route.length;i++){
    const r=route[i];
    platforms.push(makePlatform(r.x,r.y,tiles,'static',i,i===0));
  }
}
function reset(seed=Math.floor(Math.random()*2**31)){
  state.running=true;state.time=0;state.cameraY=0;state.score=0;state.charge=0;
  state.flash=0;state.seed=seed;state.rng=rng(seed);state.launchTimer=.9;
  state.currentPlatformId=0;

  platforms.length=0;
  seedIntroRoute();

  const starter=platforms[0];
  player.x=starter.x+starter.w/2;
  player.y=starter.y-R;
  player.vx=0;
  player.vy=0;
  player.lastY=player.y;

  let previous=platforms[platforms.length-1];
  for(let i=7;i<=20;i++) previous=addAbove(previous,i);

  el.menu.classList.add('hidden');
  el.over.classList.add('hidden');
  el.height.textContent='0';
  el.speed.textContent='1.00x';
}
function endRun(){
  state.running=false;const nb=state.score>state.best;
  if(nb){state.best=state.score;localStorage.setItem('dlicom-best',String(state.best))}
  el.final.textContent=String(state.score)+'m';el.newBest.classList.toggle('hidden',!nb);el.seed.textContent='RUN SEED · '+state.seed;el.best.textContent=String(state.best);el.over.classList.remove('hidden');
}
function update(dt){
  if(!state.running)return;

  state.time+=dt;
  state.flash=Math.max(0,state.flash-dt*3.5);

  if(state.launchTimer>0){
    state.launchTimer=Math.max(0,state.launchTimer-dt);
    if(state.launchTimer===0){
      const starter=platforms.find(p=>p.starter);
      if(starter)starter.active=false;
      player.vy=JUMP;
    }
    return;
  }

  const a=axis(),moving=a!==0,same=a===0||Math.sign(player.vx||a)===a;
  if(moving&&same)state.charge=Math.min(4,state.charge+dt);
  else state.charge=Math.max(0,state.charge-dt*1.8);

  const mult=1+Math.min(.55,state.charge/7.25),maxSpeed=190*mult;
  if(a)player.vx+=a*930*dt;
  else{
    const drag=Math.min(Math.abs(player.vx),1350*dt);
    player.vx-=Math.sign(player.vx)*drag;
  }

  player.vx=Math.max(-maxSpeed,Math.min(maxSpeed,player.vx));
  player.lastY=player.y;
  player.vy+=GRAVITY*dt;
  player.x+=player.vx*dt;
  player.y+=player.vy*dt;

  if(player.x<-R)player.x=W+R;
  if(player.x>W+R)player.x=-R;

  for(const p of platforms){
    if(p.type==='moving'&&p.active){
      p.x=p.baseX+Math.sin(state.time*p.speed+p.phase)*p.amplitude;
      p.x=Math.max(0,Math.min(W-p.w,p.x));
    }
  }


  if(player.vy>0)for(const p of platforms){
    if(!p.active||p.id!==state.currentPlatformId+1)continue;
    const above=player.lastY+R<=p.y+2;
    const cross=player.y+R>=p.y;
    const inside=player.x+R*.72>=p.x&&player.x-R*.72<=p.x+p.w;
    if(above&&cross&&inside){
      player.y=p.y-R;
      player.vy=JUMP*(1+Math.min(.12,state.score/50000));
      p.active=false;
      state.currentPlatformId=p.id;
      state.flash=.32;
      break;
    }
  }

  const target=player.y-H*.34;
  if(target<state.cameraY)state.cameraY+=(target-state.cameraY)*Math.min(1,dt*5.5);

  state.score=Math.max(state.score,Math.floor((520-player.y+state.cameraY)*.75));
  ensure();cleanup();

  el.height.textContent=String(Math.max(0,state.score));
  el.speed.textContent=mult.toFixed(2)+'x';

  if(player.y>state.cameraY+H+70)endRun();
}
function bg(){
  const progress=Math.min(1,state.score/3500),band=Math.floor(state.cameraY*-.12/180)%4;
  ctx.fillStyle='#080808';ctx.fillRect(0,0,W,H);
  for(let i=0;i<16;i++){const x=i*24+(band*9%18),h=55+(i*31+band*23)%120;ctx.fillStyle=i%3===0?'#111':'#0d0d0d';ctx.fillRect(x,H-h,14,h);if(progress>.35&&i%4===0){ctx.fillStyle='#1f1f1f';ctx.fillRect(x+4,H-h+14,4,4);ctx.fillRect(x+4,H-h+28,4,4)}}
  const shift=state.cameraY*.08%640;for(let i=0;i<28;i++){const x=i*137%W,y=(i*53-shift+H*2)%H;ctx.fillStyle=i%5===0?'#333':'#1b1b1b';ctx.fillRect(x,y,i%4===0?3:2,i%4===0?3:2)}
}
function drawPlatform(p){
  const y=p.y-state.cameraY;
  if(y<-30||y>H+30)return;
  const platformColor=p.type==='moving'?'#b8ff36':'#f0f0f0';
  ctx.fillStyle=platformColor;
  ctx.fillRect(Math.round(p.x),Math.round(y),Math.round(p.w),10);
  ctx.fillStyle='#4a4a4a';
  ctx.fillRect(Math.round(p.x),Math.round(y+10),Math.round(p.w),3);
  ctx.fillStyle='#171717';
  for(let i=0;i<p.tiles;i++){
    const tx=p.x+i*TILE;
    ctx.fillRect(Math.round(tx+5),Math.round(y+3),4,2);
    if(TILE>=24)ctx.fillRect(Math.round(tx+TILE-5),Math.round(y+3),2,2);
  }
}
function mascot(){
  const sx=Math.round(player.x);
  const sy=Math.round(player.y-state.cameraY);
  const rising=player.vy<0;
  const squash=rising?.92:1.08;
  const w=Math.round(34*squash);
  const h=Math.round(34/squash);
  const x=sx-Math.floor(w/2);
  const y=Math.round(sy-h/2);

  // Bright prototype marker so the gameplay object is impossible to miss.
  ctx.fillStyle='#b8ff36';
  ctx.fillRect(x,y,w,h);
  ctx.fillStyle='#080808';
  ctx.fillRect(x+7,y+9,6,6);
  ctx.fillRect(x+w-13,y+9,6,6);
  ctx.fillRect(x+9,y+h-10,w-18,3);

  if(state.launchTimer>0){
    ctx.strokeStyle='#ffffff';
    ctx.lineWidth=2;
    ctx.strokeRect(x-4,y-4,w+8,h+8);
  }

  if(state.flash>0){
    ctx.globalAlpha=Math.min(.55,state.flash);
    ctx.fillStyle='#ffffff';
    ctx.fillRect(x-6,y-6,w+12,h+12);
    ctx.globalAlpha=1;
  }
}
function draw(){
  bg();
  for(const p of platforms)drawPlatform(p);
  mascot();
}
function key(k,on){if(k==='ArrowLeft'||k.toLowerCase()==='a')input.left=on;if(k==='ArrowRight'||k.toLowerCase()==='d')input.right=on}
addEventListener('keydown',e=>{key(e.key,true);if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='Enter'&&!state.running&&el.over.classList.contains('hidden')===false)reset()});
addEventListener('keyup',e=>key(e.key,false));
function touch(id,dir){const z=document.querySelector(id);const on=e=>{e.preventDefault();input[dir]=true},off=e=>{e.preventDefault();input[dir]=false};['pointerdown','pointerenter'].forEach(v=>z.addEventListener(v,on));['pointerup','pointercancel','pointerleave'].forEach(v=>z.addEventListener(v,off))}
touch('#touch-left','left');touch('#touch-right','right');
el.start.onclick=()=>reset();el.restart.onclick=()=>reset();
let last=performance.now();function frame(now){const dt=Math.min(.032,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);
