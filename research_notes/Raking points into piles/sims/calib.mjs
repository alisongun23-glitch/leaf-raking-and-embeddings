function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function bottleneck(x,y,torus){const n=x.length,inT=new Uint8Array(n),d=new Float64Array(n).fill(Infinity);d[0]=0;let maxE=0;
 for(let it=0;it<n;it++){let u=-1,b=Infinity;for(let i=0;i<n;i++)if(!inT[i]&&d[i]<b){b=d[i];u=i;}inT[u]=1;if(b>maxE)maxE=b;const ux=x[u],uy=y[u];
  for(let i=0;i<n;i++)if(!inT[i]){let dx=Math.abs(x[i]-ux),dy=Math.abs(y[i]-uy);if(torus){if(dx>0.5)dx=1-dx;if(dy>0.5)dy=1-dy;}const dd=dx*dx+dy*dy;if(dd<d[i])d[i]=dd;}}
 return Math.sqrt(maxE);}
const q=(a,p)=>{const s=Float64Array.from(a).sort(),i=(s.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return s[lo]+(s[hi]-s[lo])*(i-lo);};
console.log('N | reps | geometry | M*sqrt(N): 5% / 50% / 95% | mean degree N*pi*M^2 at median | Penrose bulk median sqrt((lnN+0.3665)/pi) ');
for(const [N,reps] of [[50,3000],[100,2000],[200,1000],[500,400],[1000,200],[2000,100]]){
 for(const torus of [false,true]){
  const rng=mulberry32(99+N+(torus?1:0)); const Ms=[];
  for(let r=0;r<reps;r++){const x=new Float64Array(N),y=new Float64Array(N);for(let i=0;i<N;i++){x[i]=rng();y[i]=rng();}Ms.push(bottleneck(x,y,torus));}
  const s=Math.sqrt(N), m=q(Ms,.5);
  console.log(`${N} | ${reps} | ${torus?'torus':'square'} | ${(q(Ms,.05)*s).toFixed(3)} / ${(m*s).toFixed(3)} / ${(q(Ms,.95)*s).toFixed(3)} | ${(N*Math.PI*m*m).toFixed(2)} | ${Math.sqrt((Math.log(N)+0.3665)/Math.PI).toFixed(3)}`);
 }
}
