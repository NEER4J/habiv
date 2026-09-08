'use strict';
const $ = (s) => document.querySelector(s);
const canvas = $('#orbit'), ctx = canvas.getContext('2d');
const moods = {
  wild: { color: [244, 89, 48], title: 'the beautifully wild.', word: 'vermilion', twist: 3 },
  calm: { color: [112, 197, 205], title: 'a quieter kind of magic.', word: 'teal', twist: 2 },
  dreamy: { color: [188, 151, 239], title: 'somewhere between stars.', word: 'violet', twist: 4 },
  electric: { color: [204, 235, 95], title: 'a beautiful disruption.', word: 'lime', twist: 5 }
};
let current = { name: '', mood: 'wild' }, phase = 0, lastTime = 0, frame = 0;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
function hash(text) { let h = 2166136261; for (const c of text) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function geometry(state) { const seed = hash(state.name.trim().toLowerCase() + ':' + state.mood); return { seed, tilt: .35 + (seed % 80) / 150, twist: moods[state.mood].twist, offset: (seed % 628) / 100, stretch: .82 + ((seed >>> 8) % 35) / 100 }; }
let shape = geometry(current);
function draw(context, w, h, state, t) {
  const g = state === current ? shape : geometry(state), m = moods[state.mood];
  context.fillStyle = '#121815'; context.fillRect(0, 0, w, h);
  const glow = context.createRadialGradient(w*.5,h*.46,0,w*.5,h*.46,w*.51);
  glow.addColorStop(0,'#263022'); glow.addColorStop(1,'#121815'); context.fillStyle=glow;context.fillRect(0,0,w,h);
  context.fillStyle='#c6d0ba';
  for(let i=0;i<58;i++){ const x=((Math.imul(i+1,73856093)>>>0)%1000)/1000*w,y=((Math.imul(i+1,19349663)>>>0)%1000)/1000*h;context.globalAlpha=.06+(i%4)*.025;context.fillRect(x,y,Math.max(.7,w/900),Math.max(.7,w/900)); }
  context.globalAlpha=1;
  const scale=w*.285,cx=w*.5,cy=h*.465,spin=t*.065+g.offset,tilt=g.tilt;
  context.lineWidth=Math.max(.48,w/1150);
  for(let j=0;j<116;j++){
    const v=j/116*Math.PI*2;context.beginPath();
    for(let i=0;i<=260;i++){
      const u=i/260*Math.PI*2, ripple=.075*Math.sin(u*g.twist+v*2+g.offset);
      const radius=1+.36*Math.cos(v+u*g.twist)+ripple;
      const x=radius*Math.cos(u), y=radius*Math.sin(u), z=.38*Math.sin(v+u*g.twist);
      const xx=x*Math.cos(spin)-y*Math.sin(spin),yy=x*Math.sin(spin)+y*Math.cos(spin);
      const px=cx+scale*xx*g.stretch,py=cy+scale*(yy*Math.sin(tilt)+z*Math.cos(tilt));
      const angle=-.42;const dx=px-cx,dy=py-cy;const rx=cx+dx*Math.cos(angle)-dy*Math.sin(angle),ry=cy+dx*Math.sin(angle)+dy*Math.cos(angle);
      if(i===0)context.moveTo(rx,ry);else context.lineTo(rx,ry);
    }
    const brightness=.68+.32*Math.sin(v*.5);const [r,gc,b]=m.color;context.strokeStyle=`rgba(${Math.round(r*brightness)},${Math.round(gc*brightness)},${Math.round(b*brightness)},${.36+.32*(Math.sin(v)+1)/2})`;context.stroke();
  }
}
function render(){draw(ctx,canvas.width,canvas.height,current,phase)}
function resize(){ const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);render(); }
function tick(time){if(!paused&&!document.hidden){if(lastTime&&time-lastTime<40){frame=requestAnimationFrame(tick);return;}phase+=lastTime?Math.min((time-lastTime)/1000,.08):0;render();lastTime=time;}else lastTime=0;frame=requestAnimationFrame(tick);}
function announce(text){$('#status').textContent=text;$('#status').classList.add('visible');clearTimeout(announce.timer);announce.timer=setTimeout(()=>$('#status').classList.remove('visible'),3500);}
function update(state, message=true){current={name:state.name.trim().slice(0,32),mood:Object.hasOwn(moods,state.mood)?state.mood:'wild'};shape=geometry(current);phase=0;$('#name').value=current.name;$(`input[name="mood"][value="${current.mood}"]`).checked=true;$('#art-name').textContent=current.name ? current.name + '’s orbit.' : moods[current.mood].title;$('#art-id').innerHTML=`H / ${String(shape.seed%10000).padStart(4,'0')}<br>${current.mood.toUpperCase()} FREQUENCY`;canvas.setAttribute('aria-label',`An animated ${moods[current.mood].word} orbit of interwoven lines${current.name?' for '+current.name:''}`);render();if(message)announce('Your universe, freshly made.');}
$('#creator').addEventListener('submit',e=>{e.preventDefault();update({name:$('#name').value,mood:$('input[name="mood"]:checked').value});});
for(const input of document.querySelectorAll('input[name="mood"]'))input.addEventListener('change',()=>update({name:$('#name').value,mood:input.value},false));
$('#surprise').addEventListener('click',()=>{const words=['Moonchild','Soft chaos','Daydreamer','Velvet thunder','Little comet','Afterglow','Wild heart','Stardust'];let i=crypto.getRandomValues(new Uint32Array(2));update({name:words[i[0]%words.length],mood:Object.keys(moods)[i[1]%4]});});
function pauseLabel(){$('#pause').textContent=paused?'▶':'Ⅱ';$('#pause').setAttribute('aria-label',paused?'Play animation':'Pause animation');$('#pause').setAttribute('aria-pressed',String(paused));}
$('#pause').addEventListener('click',()=>{paused=!paused;pauseLabel();});pauseLabel();
$('#save').addEventListener('click',()=>{const out=document.createElement('canvas');out.width=1600;out.height=1800;const c=out.getContext('2d');draw(c,1600,1700,current,0);c.fillStyle='#121815';c.fillRect(0,1510,1600,290);c.fillStyle='#a4ada0';c.font='18px monospace';c.fillText('HABIV / THE ORBIT EXPERIMENT',80,91);c.fillText(current.mood.toUpperCase()+' FREQUENCY',80,1580);c.fillStyle='#eeeee4';c.font='italic 64px Georgia';c.fillText(current.name?current.name+'’s orbit.':moods[current.mood].title,80,1670,1430);c.fillStyle='#a4ada0';c.font='20px monospace';c.fillText('habiv — your vibe, in orbit',80,1740);out.toBlob(blob=>{if(!blob){announce('Couldn’t create the image. Please try again.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='habiv-'+(current.name.replace(/[^a-z0-9]/gi,'-')||'orbit')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);announce('Your orbit is ready to keep.');},'image/png');});
$('#share').addEventListener('click',async()=>{const url=new URL(location.href);url.search='';url.hash=new URLSearchParams({name:current.name,mood:current.mood}).toString();const data={title:'Habiv — Your vibe, in orbit',text:current.name?`Meet ${current.name}’s orbit. What does yours look like?`:'A little universe. Make yours.',url:url.href};try{if(navigator.share){await navigator.share(data);}else if(navigator.clipboard){await navigator.clipboard.writeText(url.href);announce('Orbit link copied. Send a little universe.');}else{window.prompt('Copy your orbit link:',url.href);}}catch(e){if(e.name!=='AbortError'){window.prompt('Copy your orbit link:',url.href);}}});
function readHash(){const params=new URLSearchParams(location.hash.slice(1));if(params.has('mood')||params.has('name'))update({name:params.get('name')||'',mood:params.get('mood')||'wild'},false);}
window.addEventListener('hashchange',readHash);
const dialog=$('#about-dialog');$('#about').addEventListener('click',()=>dialog.showModal());$('.close').addEventListener('click',()=>dialog.close());$('.close-about').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
new ResizeObserver(resize).observe(canvas);readHash();resize();frame=requestAnimationFrame(tick);
