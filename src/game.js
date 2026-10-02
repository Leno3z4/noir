const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');
ctx.imageSmoothingEnabled=false;
const W=canvas.width,H=canvas.height,GRAVITY=1450,JUMP=-560,R=13,TILE=30,ROW_GAP=104;
const el={menu:document.querySelector('#menu'),over:document.querySelector('#game-over'),start:document.querySelector('#start'),restart:document.querySelector('#restart'),height:document.querySelector('#height'),best:document.querySelector('#best'),speed:document.querySelector('#speed'),final:document.querySelector('#final-height'),newBest:document.querySelector('#new-best'),seed:document.querySelector('#seed')};
const state={running:false,time:0,cameraY:0,score:0,best:Number(localStorage.getItem('dlicom-best')||0),seed:0,rng:null,charge:0,flash:0};
const input={left:false,right:false},platforms=[];
const player={x:W/2,y:520,vx:0,vy:0,lastY:520};
el.best.textContent=String(state.best);

function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function rand(a,b){return a+(b-a)*state.rng()}
function difficulty(){return Math.min(1,state.score/4500)}
function profileAt(height){
  if(height<500)return {minW:90,maxW:180,minGap:86,maxGap:102,moving:0};
  if(height<1500)return {minW:72,maxW:150,minGap:88,maxGap:108,moving:.05};
  if(height<3000)return {minW:58,maxW:126,minGap:92,maxGap:114,moving:.18};
  return {minW:48,maxW:108,minGap:94,maxGap:118,moving:.3};
}
function wrappedDistance(a,b){
  const direct=Math.abs(a-b);
  return Math.min(direct,W-direct);
}
function reachable(prev,next){
  const gap=Math.abs(prev.y-next.y);
  const discriminant=JUMP*JUMP-2*GRAVITY*gap;
  if(discriminant<0)return false;
  const t=(-JUMP+Math.sqrt(discriminant))/GRAVITY;
  const maxTravel=190*1.35*t+prev.w*.5;
  return wrappedDistance(prev.x+prev.w/2,next.x+next.w/2)<=maxTravel;
}
function addAbove(prev,n){
  const row=n+1,p=profileAt(Math.max(0,state.score));
  const w=Math.round(rand(p.minW,p.maxW));
  const y=prev.y-rand(p.minGap,p.maxGap);
  const candidates=[
    Math.max(0,Math.min(W-w,prev.x+rand(-115,115))),
    rand(0,W-w),
    row%2===1?W-w:0,
    0,W-w
  ];
  for(const x of [...new Set(candidates.map(v=>Math.round(v)))]) {
    const moving=rand(0,1)<p.moving;
    const candidate={
      x,y,w,h:12,type:moving?'moving':'static',seed:n,baseX:x,
      phase:rand(0,Math.PI*2),
      amplitude:moving?Math.min(TILE*1.5,8+difficulty()*8):0,
      speed:moving?rand(.7,1.05):0,tiles:Math.max(1,Math.round(w/TILE)),
      side:x===0?'left':x===W-w?'right':'mid'
    };
    if(reachable(prev,candidate)){platforms.push(candidate);return candidate}
  }
  const x=Math.max(0,Math.min(W-w,prev.x+rand(-60,60)));
  const fallback={
    x:Math.round(x),y,w,h:12,type:'static',seed:n,baseX:Math.round(x),
    phase:rand(0,Math.PI*2),amplitude:0,speed:0,tiles:Math.max(1,Math.round(w/TILE)),side:'mid'
  };
  platforms.push(fallback);return fallback;
}
function reset(seed=Math.floor(Math.random()*2**31)){
  state.running=true;state.time=0;state.cameraY=0;state.score=0;state.charge=0;state.flash=0;state.seed=seed;state.rng=rng(seed);
  player.x=W/2;player.y=520;player.vx=0;player.vy=JUMP;player.lastY=player.y;platforms.length=0;
  let p={x:0,y:580,w:TILE,h:12,type:'static',seed:0,tiles:1,side:'left'};platforms.push(p);
  player.x=TILE/2;
  for(let i=0;i<16;i++)p=addAbove(p,i);
  el.menu.classList.add('hidden');el.over.classList.add('hidden');
}
function ensure(){while(Math.min(...platforms.map(p=>p.y))>state.cameraY-900){const top=platforms.reduce((a,b)=>a.y<b.y?a:b);addAbove(top,top.seed+1);if(platforms.length>90)break}}
function cleanup(){const cut=state.cameraY+H+120;for(let i=platforms.length-1;i>=0;i--)if(platforms[i].y>cut)platforms.splice(i,1)}
function axis(){return(input.right?1:0)-(input.left?1:0)}
function endRun(){
  state.running=false;const nb=state.score>state.best;
  if(nb){state.best=state.score;localStorage.setItem('dlicom-best',String(state.best))}
  el.final.textContent=String(state.score)+'m';el.newBest.classList.toggle('hidden',!nb);el.seed.textContent='RUN SEED · '+state.seed;el.best.textContent=String(state.best);el.over.classList.remove('hidden');
}
function update(dt){
  if(!state.running)return;state.time+=dt;state.flash=Math.max(0,state.flash-dt*3.5);
  const a=axis(),moving=a!==0,same=a===0||Math.sign(player.vx||a)===a;
  if(moving&&same)state.charge=Math.min(4,state.charge+dt);else state.charge=Math.max(0,state.charge-dt*1.8);
  const mult=1+Math.min(.55,state.charge/7.25),maxSpeed=190*mult;
  if(a)player.vx+=a*930*dt;else{const drag=Math.min(Math.abs(player.vx),1350*dt);player.vx-=Math.sign(player.vx)*drag}
  player.vx=Math.max(-maxSpeed,Math.min(maxSpeed,player.vx));player.lastY=player.y;player.vy+=GRAVITY*dt;player.x+=player.vx*dt;player.y+=player.vy*dt;
  if(player.x<-R)player.x=W+R;if(player.x>W+R)player.x=-R;
  for(const p of platforms)if(p.type==='moving')p.x=p.baseX+Math.sin(state.time*p.speed+p.phase)*p.amplitude;
  if(player.vy>0)for(const p of platforms){
    const above=player.lastY+R<=p.y+2,cross=player.y+R>=p.y,inside=player.x+R*.72>=p.x&&player.x-R*.72<=p.x+p.w;
    if(above&&cross&&inside){player.y=p.y-R;player.vy=JUMP*(1+Math.min(.12,state.score/50000));state.flash=.32;break}
  }
  const target=player.y-H*.34;if(target<state.cameraY)state.cameraY+=(target-state.cameraY)*Math.min(1,dt*5.5);
  state.score=Math.max(state.score,Math.floor((520-player.y+state.cameraY)*.75));
  ensure();cleanup();
  el.height.textContent=String(Math.max(0,state.score));
  el.speed.textContent=mult.toFixed(2)+'x';
  if(player.y>state.cameraY+H+70)endRun();
  el.height.textContent=String(Math.max(0,state.score));el.speed.textContent=mult.toFixed(2)+'x';
}
function bg(){
  const progress=Math.min(1,state.score/3500),band=Math.floor(state.cameraY*-.12/180)%4;
  ctx.fillStyle='#080808';ctx.fillRect(0,0,W,H);
  for(let i=0;i<16;i++){const x=i*24+(band*9%18),h=55+(i*31+band*23)%120;ctx.fillStyle=i%3===0?'#111':'#0d0d0d';ctx.fillRect(x,H-h,14,h);if(progress>.35&&i%4===0){ctx.fillStyle='#1f1f1f';ctx.fillRect(x+4,H-h+14,4,4);ctx.fillRect(x+4,H-h+28,4,4)}}
  const shift=state.cameraY*.08%640;for(let i=0;i<28;i++){const x=i*137%W,y=(i*53-shift+H*2)%H;ctx.fillStyle=i%5===0?'#333':'#1b1b1b';ctx.fillRect(x,y,i%4===0?3:2,i%4===0?3:2)}
}
function drawPlatform(p){
  const y=p.y-state.cameraY;if(y<-30||y>H+30)return;
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
  const sx=Math.round(player.x),sy=Math.round(player.y-state.cameraY),sq=player.vy<0?.96:1.06,w=Math.round(30*sq),h=Math.round(30/sq),x=sx-Math.floor(w/2),y=Math.round(sy-h/2+Math.sin(state.time*14)*1.5);
  ctx.fillStyle='#fff';ctx.fillRect(x+4,y,w-8,h);ctx.fillRect(x,y+5,w,h-10);
  ctx.fillStyle='#080808';ctx.fillRect(x+7,y+9,5,5);ctx.fillRect(x+w-12,y+9,5,5);ctx.fillRect(x+9,y+h-10,w-18,3);
  ctx.fillStyle='#888';ctx.fillRect(x+5,y+4,3,3);ctx.fillRect(x+w-8,y+4,3,3);
  if(state.flash){ctx.globalAlpha=state.flash;ctx.fillStyle='#fff';ctx.fillRect(x-5,y-5,w+10,h+10);ctx.globalAlpha=1}
}
function draw(){bg();for(const p of platforms)drawPlatform(p);mascot()}
function key(k,on){if(k==='ArrowLeft'||k.toLowerCase()==='a')input.left=on;if(k==='ArrowRight'||k.toLowerCase()==='d')input.right=on}
addEventListener('keydown',e=>{key(e.key,true);if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='Enter'&&!state.running&&el.over.classList.contains('hidden')===false)reset()});
addEventListener('keyup',e=>key(e.key,false));
function touch(id,dir){const z=document.querySelector(id);const on=e=>{e.preventDefault();input[dir]=true},off=e=>{e.preventDefault();input[dir]=false};['pointerdown','pointerenter'].forEach(v=>z.addEventListener(v,on));['pointerup','pointercancel','pointerleave'].forEach(v=>z.addEventListener(v,off))}
touch('#touch-left','left');touch('#touch-right','right');
el.start.onclick=()=>reset();el.restart.onclick=()=>reset();
let last=performance.now();function frame(now){const dt=Math.min(.032,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(frame)}requestAnimationFrame(frame);
