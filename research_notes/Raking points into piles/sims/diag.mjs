const TAU=2*Math.PI;
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function areaDiscSquare(cx,cy,r,nq=400){const u0=Math.max(0,cx-r),u1=Math.min(1,cx+r),du=(u1-u0)/nq;let A=0;for(let i=0;i<nq;i++){const u=u0+(i+0.5)*du,hh=Math.sqrt(Math.max(0,r*r-(u-cx)*(u-cx)));const lo=Math.max(0,cy-hh),hi=Math.min(1,cy+hh);if(hi>lo)A+=(hi-lo)*du;}return A;}
function EisoExact(N,r,G){let s=0;const d=0.5/G;for(let i=0;i<G;i++){const cx=(i+0.5)*d;for(let j=0;j<G;j++){const cy=(j+0.5)*d;const A=(cx>=r&&cy>=r)?Math.PI*r*r:areaDiscSquare(cx,cy,r);s+=Math.pow(1-A,N-1);}}return 4*N*s*d*d;}
function run(N,r0,reps,seed){
  const rng=mulberry32(seed); let sumIso=0, zeroIso=0, connLe=0, isoHist=[0,0,0,0,0,0];
  for(let rep=0;rep<reps;rep++){
    const x=new Float64Array(N),y=new Float64Array(N); for(let i=0;i<N;i++){x[i]=rng();y[i]=rng();}
    // isolated count at r0
    let iso=0; const r2=r0*r0;
    for(let i=0;i<N;i++){let ok=false;for(let j=0;j<N;j++){if(j===i)continue;const dx=x[j]-x[i],dy=y[j]-y[i];if(dx*dx+dy*dy<=r2){ok=true;break;}} if(!ok)iso++;}
    sumIso+=iso; if(iso===0)zeroIso++; isoHist[Math.min(iso,5)]++;
    // connectivity at r0 via union-find over all pairs within r0
    const p=[...Array(N).keys()]; const f=a=>{while(p[a]!==a){p[a]=p[p[a]];a=p[a];}return a;};
    let comps=N; for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){const dx=x[j]-x[i],dy=y[j]-y[i];if(dx*dx+dy*dy<=r2){const a=f(i),b=f(j);if(a!==b){p[a]=b;comps--;}}}
    if(comps===1)connLe++;
  }
  const E=EisoExact(N,r0,N<=200?200:300);
  console.log(`N=${N} r0=${r0}: integral E[#iso]=${E.toFixed(4)} -> exp(-E)=${Math.exp(-E).toFixed(3)} | MC mean #iso=${(sumIso/reps).toFixed(4)}, MC P(#iso=0)=${(zeroIso/reps).toFixed(3)}, MC P(connected)=${(connLe/reps).toFixed(3)}, hist0..5+=${isoHist.join(',')}`);
}
run(200,0.1069,4000,1);
run(200,0.1162,4000,2);
run(1000,0.0527,600,3);
run(1000,0.0558,600,4);
