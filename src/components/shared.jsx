import { useState, useEffect, useRef, Component } from "react";
import { createPortal } from "react-dom";
import { toLogoUrl, extractDriveId, detectGeoLocation, fetchWeather, classifyWeather } from "../lib/helpers.js";
import { tSt } from "../lib/i18n.js";
import { api } from "../lib/api.js";

export class ErrorBoundary extends Component {
  constructor(props){ super(props); this.state={err:null}; }
  static getDerivedStateFromError(e){ return {err:e}; }
  render(){
    if(this.state.err) return (
      <div style={{padding:20,background:"#fee2e2",border:"2px solid #ef4444",borderRadius:10,margin:10}}>
        <strong style={{color:"#dc2626"}}>⚠ Error in {this.props.name||"component"}:</strong>
        <pre style={{fontSize:12,marginTop:8,whiteSpace:"pre-wrap",color:"#991b1b"}}>{this.state.err?.message}{"\n"}{this.state.err?.stack}</pre>
      </div>
    );
    return this.props.children;
  }
}

export const LogoSVG = ({height=44, style={}}) => (
  <svg height={height} viewBox="0 0 420 110" xmlns="http://www.w3.org/2000/svg" style={{display:"block",...style}}>
    <rect x="0" y="0" width="420" height="110" fill="#C0000A" rx="12"/>
    <rect x="0" y="0" width="420" height="5" fill="#FFD700" rx="2"/>
    <rect x="0" y="105" width="420" height="5" fill="#FFD700" rx="2"/>
    <polygon points="36,16 40.5,30 55,30 43.5,38.5 47.5,52 36,44 24.5,52 28.5,38.5 17,30 31.5,30" fill="#FFD700"/>
    <rect x="66" y="10" width="2.5" height="90" fill="#FFD700" opacity="0.6" rx="1"/>
    <text x="80" y="48" fontFamily="Arial Black,Arial" fontSize="32" fontWeight="900" fill="#FFD700" letterSpacing="2">AUTO EXCEL</text>
    <text x="82" y="68" fontFamily="Arial Black,Arial" fontSize="14" fontWeight="700" fill="#FFFFFF" letterSpacing="5">SOUTH AFRICA</text>
    <rect x="80" y="75" width="316" height="1.5" fill="#FFD700" opacity="0.4" rx="1"/>
    <text x="82" y="93" fontFamily="Arial Black,Arial" fontSize="13" fontWeight="700" fill="#FFFFFF" letterSpacing="2" opacity="0.95">CHINA CAR PARTS &amp; ENGINE OIL</text>
  </svg>
);

export const ShopLogo = ({settings, size="md", style={}}) => {
  const heights = { sm:44, md:66, lg:140 };
  const h = +(settings?.["logo_h_"+size] || heights[size] || 66);
  const raw = settings?.logo_url || settings?.logo_data;
  const src = raw ? (raw.startsWith("data:") ? raw : toLogoUrl(raw)) : null;
  if(src) return (
    <img src={src} alt="logo"
      style={{maxHeight:h, maxWidth:h*5, width:"auto", height:"auto", objectFit:"contain", display:"block", ...style}}
      referrerPolicy="no-referrer"
      onError={e=>e.target.style.display="none"}/>
  );
  return null;
};

export const MotorDeskBanner = () => (
  <div style={{position:"relative",background:"linear-gradient(135deg,#080d14 0%,#111827 55%,#0c1420 100%)",borderRadius:12,padding:"28px 24px 20px",overflow:"hidden",textAlign:"center"}}>
    {/* Ambient glow circles */}
    <div style={{position:"absolute",top:-40,right:-40,width:180,height:180,borderRadius:"50%",background:"rgba(249,115,22,0.07)",pointerEvents:"none"}}/>
    <div style={{position:"absolute",bottom:-50,left:-50,width:200,height:200,borderRadius:"50%",background:"rgba(249,115,22,0.04)",pointerEvents:"none"}}/>
    {/* Icon + name row */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:18,marginBottom:10,position:"relative"}}>
      <svg width="52" height="52" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,filter:"drop-shadow(0 0 10px rgba(249,115,22,0.5))"}}>
        <circle cx="32" cy="32" r="30" fill="rgba(249,115,22,0.12)"/>
        <g transform="translate(32,32)">
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316"/>
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316" transform="rotate(45)"/>
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316" transform="rotate(90)"/>
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316" transform="rotate(135)"/>
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316" transform="rotate(180)"/>
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316" transform="rotate(225)"/>
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316" transform="rotate(270)"/>
          <rect x="-4" y="-22" width="8" height="10" rx="2" fill="#f97316" transform="rotate(315)"/>
          <circle r="14" fill="#f97316"/>
          <circle r="5.5" fill="#0f172a"/>
        </g>
        <g transform="translate(32,32) rotate(-45)">
          <rect x="-13" y="-27" width="8" height="22" rx="3" fill="white" opacity="0.9"/>
          <rect x="5" y="-27" width="8" height="22" rx="3" fill="white" opacity="0.9"/>
          <rect x="-13" y="-8" width="26" height="9" fill="white" opacity="0.9"/>
          <rect x="-5" y="-1" width="10" height="30" rx="5" fill="white" opacity="0.9"/>
        </g>
      </svg>
      <div style={{textAlign:"left"}}>
        <div style={{fontSize:46,fontWeight:900,fontFamily:"Rajdhani,sans-serif",letterSpacing:"1px",lineHeight:1,background:"linear-gradient(90deg,#f97316 0%,#fb923c 60%,#fdba74 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>MotorDesk</div>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:".18em",textTransform:"uppercase",fontWeight:700,marginTop:3}}>Automotive Workshop Management</div>
      </div>
    </div>
    {/* Divider */}
    <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(249,115,22,0.5),transparent)",margin:"14px 0 12px",position:"relative"}}/>
    {/* Feature badges */}
    <div style={{display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap",position:"relative"}}>
      {["BOOK IN","QUOTATION","INVOICE","REPORTS"].map(b=>(
        <span key={b} style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.35)",letterSpacing:".14em"}}>{b}</span>
      ))}
    </div>
  </div>
);

export const Overlay = ({onClose,children,wide,maxWidth}) => (
  <div className="overlay" onClick={onClose}>
    <div className={`modal${wide?" modal-wide":""}`} style={maxWidth?{maxWidth}:undefined} onClick={e=>e.stopPropagation()}>{children}</div>
  </div>
);

export const MHead = ({title,sub,actions,onClose}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
    <div><h2 style={{fontSize:18,fontWeight:700}}>{title}</h2>{sub&&<p style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{sub}</p>}</div>
    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
      {actions}
      <button className="btn btn-ghost btn-sm" onClick={onClose} style={{flexShrink:0}}>✕</button>
    </div>
  </div>
);

export const FL = ({label,req}) => <span className="lbl">{label}{req&&" *"}</span>;
export const FG = ({children,cols="1fr 1fr"}) => <div style={{display:"grid",gridTemplateColumns:cols,gap:12,marginBottom:14}}>{children}</div>;
export const FD = ({children}) => <div style={{marginBottom:14}}>{children}</div>;

// Reliable Google Drive image with multi-format fallback:
// tries thumbnail sz=w800 → sz=w400 → uc?export=view → hide
export function DriveImg({url, alt, style, onClick, eager}) {
  const id = extractDriveId(url);
  const isSupabase = url && url.includes('/storage/v1/object/public/');
  const supThumb = isSupabase
    ? url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + (url.includes('?') ? '&' : '?') + 'width=400&quality=75&resize=contain'
    : null;
  const urls = id ? [
    `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w800`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ] : isSupabase ? [supThumb, url] : (url ? [url] : []);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  if (!urls.length || failed) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt||""}
      style={style}
      onClick={onClick}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onError={()=>{
        if(idx < urls.length - 1) setIdx(i => i + 1);
        else setFailed(true);
      }}
    />
  );
}

export const StatusBadge = ({status}) => {
  const MAP = {
    "已完成":["rgba(52,211,153,.15)","#34d399"],"已付款":["rgba(52,211,153,.15)","#34d399"],
    "Completed":["rgba(52,211,153,.15)","#34d399"],"Paid":["rgba(52,211,153,.15)","#34d399"],
    "approved":["rgba(52,211,153,.15)","#34d399"],"paid":["rgba(52,211,153,.15)","#34d399"],
    "待出貨":["rgba(251,191,36,.15)","#fbbf24"],"partial":["rgba(251,191,36,.15)","#fbbf24"],
    "Ready to Ship":["rgba(251,191,36,.15)","#fbbf24"],
    "處理中":["rgba(96,165,250,.15)","#60a5fa"],"pending":["rgba(96,165,250,.15)","#60a5fa"],
    "Processing":["rgba(96,165,250,.15)","#60a5fa"],
    "已取消":["rgba(248,113,113,.15)","#f87171"],"Cancelled":["rgba(248,113,113,.15)","#f87171"],
    "unpaid":["rgba(248,113,113,.15)","#f87171"],"replied":["rgba(52,211,153,.15)","#34d399"],
    "closed":["rgba(71,85,105,.3)","#94a3b8"],
  };
  const [bg,col] = MAP[status]||["rgba(71,85,105,.3)","#94a3b8"];
  return <span className="badge" style={{background:bg,color:col}}>{tSt(status)}</span>;
};

export function ImgPreview({src}) {
  const [status,setStatus] = useState("loading"); // loading | ok | error
  useEffect(()=>{ setStatus("loading"); },[src]);
  if(!src) return null;
  return (
    <div style={{position:"relative",borderRadius:10,overflow:"hidden",border:"1px solid var(--border)",background:"#fff",minHeight:80,display:"flex",alignItems:"center",justifyContent:"center"}}>
      {status==="loading"&&<div style={{position:"absolute",fontSize:12,color:"var(--text3)"}}>Loading preview...</div>}
      {status==="error"&&(
        <div style={{padding:16,textAlign:"center"}}>
          <div style={{fontSize:24,marginBottom:6}}>🔒</div>
          <div style={{fontSize:12,color:"var(--red)",fontWeight:600}}>Cannot load image</div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:4,lineHeight:1.6}}>
            Make sure Google Drive is set to<br/>
            <strong style={{color:"var(--yellow)"}}>「Anyone with the link」can view</strong>
          </div>
          <a href={src} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",marginTop:8,fontSize:11,color:"var(--blue)"}}>
            🔗 Open in Google Drive to check
          </a>
        </div>
      )}
      <img
        src={src}
        alt="preview"
        style={{width:"100%",height:140,objectFit:"contain",display:status==="error"?"none":"block"}}
        onLoad={()=>setStatus("ok")}
        onError={()=>setStatus("error")}
      />
    </div>
  );
}

export function ImgLightbox({url, urls, startIdx=0, labels, onClose}) {
  // Multi-photo mode when `urls` array provided; else single `url` fallback
  const list  = urls && urls.length ? urls : (url ? [url] : []);
  const [idx, setIdx]   = useState(Math.min(startIdx, Math.max(list.length-1,0)));
  const currentUrl      = list[idx] || "";
  const touchX = useRef(null);

  const getSizes = (u) => {
    if(!u) return [u];
    const m = u.match(/thumbnail[?]id=([^&]+)/);
    if(m) return [
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`,
    ];
    return [u];
  };
  const sizes = getSizes(currentUrl);
  const [tryIdx, setTryIdx] = useState(0);
  const [status, setStatus] = useState("loading");
  const src = sizes[tryIdx] || currentUrl;

  const goTo = (newIdx) => {
    setIdx(newIdx);
    setTryIdx(0);
    setStatus("loading");
  };

  const handleError = () => {
    if(tryIdx < sizes.length-1){
      setTryIdx(i=>i+1);
    } else {
      setStatus("error");
    }
  };

  const btnStyle = {position:"fixed",top:"50%",transform:"translateY(-50%)",
    background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",
    color:"#fff",borderRadius:"50%",width:44,height:44,display:"flex",
    alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:22,
    zIndex:100000};

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if(touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if(Math.abs(dx) < 40) return;
    if(dx < 0 && idx < list.length-1) goTo(idx+1);
    if(dx > 0 && idx > 0)             goTo(idx-1);
  };

  // Portal to <body> — if this renders inside an ancestor with a CSS transform
  // (e.g. .kb-card:hover translateY) + overflow:hidden, position:fixed resolves
  // against that ancestor: the lightbox collapses into the card, hover toggles,
  // and it flickers in a loop.
  return createPortal(
    <div onClick={onClose}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{position:"fixed",top:0,left:0,right:0,bottom:0,
        background:"rgba(0,0,0,0.96)",zIndex:99999,
        display:"flex",alignItems:"center",justifyContent:"center",
        transform:"translateZ(0)"}}>

      {status==="loading"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,position:"absolute"}}>
          <div style={{width:48,height:48,border:"4px solid rgba(255,255,255,.2)",
            borderTop:"4px solid #fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:13}}>Loading photo...</div>
        </div>
      )}

      {status==="error"&&(
        <div style={{textAlign:"center",color:"#fff",padding:30}}>
          <div style={{fontSize:36,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:15,marginBottom:8}}>Failed to load image</div>
          <div style={{fontSize:11,opacity:.4,wordBreak:"break-all",maxWidth:360}}>{currentUrl}</div>
        </div>
      )}

      <img key={src} src={src} alt="photo"
        style={{width:"96vw",height:"92vh",objectFit:"contain",
          display:status==="ok"?"block":"none",borderRadius:8}}
        referrerPolicy="no-referrer"
        onLoad={()=>setStatus("ok")}
        onError={handleError}
        onClick={e=>e.stopPropagation()}/>

      {/* Prev / Next arrows */}
      {list.length>1&&idx>0&&(
        <div style={{...btnStyle,left:14}} onClick={e=>{e.stopPropagation();goTo(idx-1);}}>‹</div>
      )}
      {list.length>1&&idx<list.length-1&&(
        <div style={{...btnStyle,right:58}} onClick={e=>{e.stopPropagation();goTo(idx+1);}}>›</div>
      )}

      {/* Label + counter */}
      {list.length>1&&(
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
          background:"rgba(0,0,0,.6)",color:"#fff",borderRadius:20,padding:"4px 16px",
          fontSize:13,display:"flex",gap:12,alignItems:"center",zIndex:100000}}>
          {labels&&labels[idx]&&<span style={{opacity:.8}}>{labels[idx]}</span>}
          <span style={{opacity:.5}}>{idx+1} / {list.length}</span>
        </div>
      )}

      <div onClick={e=>{e.stopPropagation();onClose();}}
        style={{position:"fixed",top:14,right:14,background:"rgba(255,255,255,.15)",
          border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",
          width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:18,fontWeight:700,zIndex:100000}}>✕</div>
    </div>,
    document.body
  );
}

// Module-level pane so its identity is stable across CompareLightbox re-renders —
// defining it inline made React remount it (and restart the image load, showing an
// endless spinner) every time the parent re-rendered, e.g. on the 30s auto-refresh.
function ComparePane({title, src, stacked=false}) {
  // Drive thumbnails can be slow/rate-limited — fall back to smaller sizes on error
  const sizes = (() => {
    const m = (src||"").match(/thumbnail[?]id=([^&]+)/);
    if(m) return [
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`,
    ];
    return src ? [src] : [];
  })();
  const [tryIdx, setTryIdx] = useState(0);
  const [status, setStatus] = useState(src?"loading":"empty");
  useEffect(()=>{ setTryIdx(0); setStatus(src?"loading":"empty"); },[src]);
  const attempt = sizes[Math.min(tryIdx,sizes.length-1)]||"";
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minWidth:0,padding:"8px 4px"}}>
      <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.7)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:8,textAlign:"center"}}>{title}</div>
      {status==="empty"&&<div style={{color:"rgba(255,255,255,.4)",fontSize:13}}>No photo</div>}
      {status==="loading"&&<div style={{width:32,height:32,border:"3px solid rgba(255,255,255,.2)",borderTop:"3px solid #fff",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>}
      {status==="error"&&<div style={{color:"rgba(255,255,255,.5)",fontSize:12}}>Failed to load</div>}
      {attempt&&<img key={attempt} src={attempt} alt={title} referrerPolicy="no-referrer"
        style={{width:"100%",height:stacked?"36vh":"70vh",objectFit:"contain",display:status==="ok"?"block":"none",borderRadius:8}}
        onLoad={()=>setStatus("ok")}
        onError={()=>{ if(tryIdx<sizes.length-1) setTryIdx(i=>i+1); else setStatus("error"); }}
        onClick={e=>e.stopPropagation()}/>}
    </div>
  );
}

// Side-by-side two-photo comparison viewer (e.g. job car vs. catalog vehicle),
// with shared prev/next navigation across a common set of labels (Front/Rear/Side).
export function CompareLightbox({left, right, labels, startIdx=0, onClose}) {
  const n = labels.length;
  const [idx, setIdx] = useState(Math.min(startIdx, Math.max(n-1,0)));
  const touchX = useRef(null);
  const [isMobile, setIsMobile] = useState(()=>typeof window!=="undefined"&&window.innerWidth<=700);
  useEffect(()=>{
    const fn=()=>setIsMobile(window.innerWidth<=700);
    window.addEventListener("resize",fn);
    return ()=>window.removeEventListener("resize",fn);
  },[]);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if(touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if(Math.abs(dx) < 40) return;
    if(dx < 0 && idx < n-1) setIdx(idx+1);
    if(dx > 0 && idx > 0)   setIdx(idx-1);
  };

  const btnStyle = {position:"fixed",top:"50%",transform:"translateY(-50%)",
    background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.3)",
    color:"#fff",borderRadius:"50%",width:44,height:44,display:"flex",
    alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:22,
    zIndex:100000};

  // Portal to <body> for the same reason as ImgLightbox — position:fixed breaks
  // inside transformed ancestors.
  return createPortal(
    <div onClick={onClose} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.96)",
        zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:isMobile?"column":"row",width:"100%",maxWidth:960,alignItems:"stretch"}} onClick={e=>e.stopPropagation()}>
        <ComparePane title={left.title} src={left.photos.find(p=>p.label===labels[idx])?.src||""} stacked={isMobile}/>
        <div style={isMobile?{height:1,width:"100%",background:"rgba(255,255,255,.2)"}:{width:1,background:"rgba(255,255,255,.2)"}}/>
        <ComparePane title={right.title} src={right.photos.find(p=>p.label===labels[idx])?.src||""} stacked={isMobile}/>
      </div>

      {n>1&&idx>0&&<div style={{...btnStyle,left:14}} onClick={e=>{e.stopPropagation();setIdx(idx-1);}}>‹</div>}
      {n>1&&idx<n-1&&<div style={{...btnStyle,right:58}} onClick={e=>{e.stopPropagation();setIdx(idx+1);}}>›</div>}

      {n>1&&(
        <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
          background:"rgba(0,0,0,.6)",color:"#fff",borderRadius:20,padding:"4px 16px",
          fontSize:13,display:"flex",gap:12,alignItems:"center",zIndex:100000}}>
          <span style={{opacity:.8}}>{labels[idx]}</span>
          <span style={{opacity:.5}}>{idx+1} / {n}</span>
        </div>
      )}

      <div onClick={e=>{e.stopPropagation();onClose();}}
        style={{position:"fixed",top:14,right:14,background:"rgba(255,255,255,.15)",
          border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",
          width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:18,fontWeight:700,zIndex:100000}}>✕</div>
    </div>,
    document.body
  );
}

// ── Advertisement components ──────────────────────────────────────────────────

// Cache geo+weather for the session so we only fetch once
let _envCtxPromise = null;
const getEnvCtx = () => {
  if (!_envCtxPromise) _envCtxPromise = (async () => {
    try {
      const geo = await detectGeoLocation();
      const wx = geo.lat ? await fetchWeather(geo.lat, geo.lon) : { label:"", code:null, temp:null };
      const weatherCond = classifyWeather(wx.code, wx.temp);
      return { city:geo.city||"", country:geo.countryFull||geo.country||"", weather:wx.label, weatherCond };
    } catch { return { city:"", country:"", weather:"", weatherCond:null }; }
  })();
  return _envCtxPromise;
};

export function AdBanner({ads=[], page="shop", userCtx=null, height=220, mobileHeight=null, staticSlides=[]}) {
  const [idx, setIdx] = useState(0);
  const [envCtx, setEnvCtx] = useState(null);
  const [timerKey, setTimerKey] = useState(0);
  const touchX = useRef(null);
  const didSwipe = useRef(false);

  // Fetch geo+weather once; drives weather-targeted ad prioritisation
  useEffect(()=>{ getEnvCtx().then(setEnvCtx); }, []);

  const weatherCond = envCtx?.weatherCond || null;

  // Pool: page-matched, active banners
  const pool = ads.filter(a=>a.active && (a.page===page||a.page==="all") && a.position==="banner");

  // When weather is known: show weather-matched ads + "any"/unset ads; sort matched first
  const dbActive = weatherCond
    ? [...pool.filter(a=>!a.weather_condition||a.weather_condition==="any"||a.weather_condition===weatherCond)]
        .sort((a,b)=>(b.weather_condition===weatherCond?1:0)-(a.weather_condition===weatherCond?1:0))
    : pool;

  // Merge hardcoded static slides (first) with DB ads
  const active = [...staticSlides.map(s=>({...s,_static:true})), ...dbActive];

  useEffect(()=>{
    if(active.length<=1) return;
    let cancelled=false;
    const schedule=(i)=>{
      const dur=((active[i]?.duration)||6)*1000;
      const t=setTimeout(()=>{
        if(cancelled) return;
        const next=(i+1)%active.length;
        setIdx(next);
        schedule(next);
      }, dur);
      return t;
    };
    const t=schedule(idx);
    return ()=>{ cancelled=true; clearTimeout(t); };
  },[active.length, timerKey]);

  const goTo=(i)=>{ setIdx(i); setTimerKey(k=>k+1); };
  const handleTouchStart=(e)=>{ touchX.current=e.touches[0].clientX; didSwipe.current=false; };
  const handleTouchEnd=(e)=>{
    if(touchX.current===null||active.length<=1) return;
    const dx=touchX.current-e.changedTouches[0].clientX;
    if(Math.abs(dx)>40){
      didSwipe.current=true;
      goTo(dx>0 ? (idx+1)%active.length : (idx-1+active.length)%active.length);
    }
    touchX.current=null;
  };

  if(!active.length) return null;
  const ad = active[idx % active.length];
  const effectiveHeight = mobileHeight && typeof window!=="undefined" && window.innerWidth<=600 ? mobileHeight : height;
  const openLink=async(url)=>{
    if(!url) return;
    const href=url.match(/^https?:\/\//)?url:"https://"+url;
    window.open(href,"_blank","noopener,noreferrer");
    if(ad._static) return;
    try {
      const env = envCtx || await getEnvCtx();
      await api.insert("ad_clicks",{
        ad_id: ad.id||null,
        ad_title: ad.title||"",
        page,
        user_id: userCtx?.id ? String(userCtx.id) : null,
        user_name: userCtx?.name || null,
        user_role: userCtx?.role || null,
        city: env.city||null,
        country: env.country||null,
        weather: env.weather||null,
      });
    } catch {}
  };
  return (
    <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
    <div style={{position:"relative",borderRadius:10,overflow:"hidden",
      cursor:ad.link_url?"pointer":"default",border:"1px solid var(--border)",background:"var(--surface2)",
      width:"100%",flexShrink:0,height:effectiveHeight}}
      onClick={()=>{ if(!didSwipe.current) openLink(ad.link_url); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}>
      {ad._static
        ? ad.render
        : ad.image_url
          ? <img key={idx} src={ad.image_url} alt={ad.title||"Ad"}
              style={{display:"block",width:"100%",height:"100%",objectFit:"contain"}}
              onError={e=>{e.target.style.display="none";const p=e.target.parentElement;if(p){p.style.minHeight="56px";const fb=p.querySelector('.ad-fb');if(fb)fb.style.display="flex";}}}/>
          : <div style={{height:56,display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:13,fontWeight:700,color:"var(--text2)",padding:"0 16px",textAlign:"center"}}>
              {ad.title}
            </div>}
      {!ad._static&&ad.image_url&&<div key={`fb-${idx}`} className="ad-fb" style={{display:"none",minHeight:56,alignItems:"center",justifyContent:"center",
          fontSize:13,fontWeight:700,color:"var(--text2)",padding:"0 16px",textAlign:"center"}}>
        {ad.title}
      </div>}
      {!ad._static&&ad.title&&ad.image_url&&(
        <div style={{position:"absolute",bottom:0,left:0,right:0,
          background:"linear-gradient(transparent,rgba(0,0,0,.65))",
          padding:"14px 10px 5px",color:"#fff",fontSize:11,fontWeight:700}}>
          {ad.title}
        </div>
      )}
      <div style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.55)",
        color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,
        letterSpacing:".05em",userSelect:"none"}}>AD</div>
      {active.length>1&&(
        <div style={{position:"absolute",bottom:6,left:"50%",transform:"translateX(-50%)",
          display:"flex",gap:4}}>
          {active.map((_,i)=>(
            <div key={i} onClick={e=>{e.stopPropagation();goTo(i);}}
              style={{width:6,height:6,borderRadius:"50%",cursor:"pointer",
                background:i===idx?"#fff":"rgba(255,255,255,.45)"}}/>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

const adOpen=(url)=>{if(!url)return;const h=url.match(/^https?:\/\//)?url:"https://"+url;window.open(h,"_blank","noopener,noreferrer");};

export function AdGridCard({ad}) {
  if(!ad) return null;
  return (
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:"2px solid rgba(249,115,22,.35)",
      background:"var(--surface)",cursor:ad.link_url?"pointer":"default",display:"flex",flexDirection:"column"}}
      onClick={()=>adOpen(ad.link_url)}>
      {ad.image_url&&(
        <img src={ad.image_url} alt={ad.title||"Ad"}
          style={{width:"100%",height:64,objectFit:"cover",display:"block"}}
          onError={e=>e.target.style.display="none"}/>
      )}
      <div style={{padding:"7px 10px",flex:1,display:"flex",flexDirection:"column",gap:2}}>
        {ad.title&&<div style={{fontSize:12,fontWeight:700,lineHeight:1.3,color:"var(--text)"}}>{ad.title}</div>}
        {ad.description&&<div style={{fontSize:10,color:"var(--text3)"}}>{ad.description}</div>}
        {ad.cta_text&&(
          <button className="btn btn-primary" style={{width:"100%",fontSize:11,padding:"4px 8px",marginTop:4}}
            onClick={e=>{e.stopPropagation();adOpen(ad.link_url);}}>
            {ad.cta_text}
          </button>
        )}
      </div>
      <div style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.55)",
        color:"#fff",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,
        letterSpacing:".05em",userSelect:"none"}}>AD</div>
    </div>
  );
}
