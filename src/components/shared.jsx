import { useState, useEffect, useRef, Component } from "react";
import { createPortal } from "react-dom";
import { toLogoUrl, extractDriveId, detectGeoLocation, fetchWeather, classifyWeather } from "../lib/helpers.js";
import { tSt } from "../lib/i18n.js";
import { api, uploadToStorage } from "../lib/api.js";
import { decodePDF417fromImage, parseLicenceDisc } from "../lib/barcode.js";

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

export const VelGeniusBanner = ({t}={}) => (
  <div className="velg-banner">
    <div className="velg-row">
      <div className="velg-brand">
        {/* VelGenius dial mark — see BRAND.md. Needle stays orange, never recoloured. */}
        <svg className="velg-mark" width="56" height="56" viewBox="0 0 48 48" fill="none" style={{flexShrink:0}}>
          <path d="M11.3 36.7A18 18 0 1 1 36.7 36.7" stroke="#3a4152" strokeWidth="3" strokeLinecap="round"/>
          <path d="M24 24 36 14.5" stroke="#e85d04" strokeWidth="3.6" strokeLinecap="round"/>
          <circle cx="24" cy="24" r="3.4" fill="#e85d04"/>
        </svg>
        <div>
          <div className="velg-wordmark"><span className="velg-vel">VEL</span>GENIUS</div>
          <div className="velg-tagline">{t?.appTagline||"One platform for every vehicle need"}</div>
        </div>
      </div>
    </div>
    <div className="velg-scanline"/>
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

export const IcWhatsApp = ({size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
);

// Plain-stroke trash icon — the 🗑️ emoji renders in its own fixed colors on
// every platform (ignores CSS `color`), so a "make the delete icon red"
// request can't be done with the emoji. This uses currentColor instead, so
// it always matches whatever color the button around it sets.
export const IcTrash = ({size=15}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 6"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </svg>
);
export const FG = ({children,cols="1fr 1fr"}) => <div className="fg-grid" style={{display:"grid",gridTemplateColumns:cols,gap:12,marginBottom:14}}>{children}</div>;
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
    setIdx(((newIdx%list.length)+list.length)%list.length);
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
    background:"rgba(255,255,255,.15)",border:"2px solid rgba(255,255,255,.6)",
    color:"#fff",borderRadius:"50%",width:44,height:44,display:"flex",
    alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:22,fontWeight:900,
    zIndex:100000};

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd   = (e) => {
    if(touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if(Math.abs(dx) < 40) return;
    if(dx < 0) goTo(idx+1);
    if(dx > 0) goTo(idx-1);
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
      {list.length>1&&(
        <div style={{...btnStyle,left:14}} onClick={e=>{e.stopPropagation();goTo(idx-1);}}>‹</div>
      )}
      {list.length>1&&(
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

export function AdBanner({ads=[], page="shop", userCtx=null, height=220, mobileHeight=null, tabletHeight=null, staticSlides=[]}) {
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
  const _w = typeof window!=="undefined" ? window.innerWidth : 9999;
  const effectiveHeight = mobileHeight && _w<=600 ? mobileHeight
    : tabletHeight && _w>600 && _w<=1024 ? tabletHeight
    : height;
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
    <div style={{display:"flex",justifyContent:"center",marginBottom:12,padding:"0 16px",boxSizing:"border-box"}}>
    <div style={{position:"relative",borderRadius:10,overflow:"hidden",
      cursor:ad.link_url?"pointer":"default",border:"1px solid var(--border)",background:"var(--surface2)",
      width:"100%",maxWidth:1100,flexShrink:0,height:effectiveHeight}}
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
    <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:"2px solid rgba(255,122,46,.35)",
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

// Generic file attachment upload — Excel/PDF/image, no login-doc-specific
// logic. Images get the same lightweight resize used everywhere else in the
// app; Excel/PDF (and anything else) upload as-is since compressing those
// isn't meaningful. Returns the public URL to drop straight into a WhatsApp
// or email message.
export async function uploadAttachment(file, pathPrefix) {
  const isImage = file.type.startsWith("image/");
  let blob = file, mimeType = file.type || "application/octet-stream", ext = (file.name.split(".").pop() || "bin").toLowerCase();
  if (isImage) {
    const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = ev => res(ev.target.result); fr.onerror = rej; fr.readAsDataURL(file); });
    blob = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600; const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(b => b ? res(b) : rej(new Error("toBlob failed")), "image/jpeg", 0.85);
      };
      img.onerror = rej; img.src = dataUrl;
    });
    mimeType = "image/jpeg"; ext = "jpg";
  }
  const safeName = (file.name || "file").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  const path = `${pathPrefix}/${Date.now()}_${safeName}.${ext}`;
  return uploadToStorage("cars_parts", path, blob, mimeType);
}

// Small reusable "attach a file" control — used anywhere a request/inquiry
// can carry an optional Excel/PDF/photo attachment (part requests, supplier
// inquiries). Shows the upload button, or a link + replace button once
// something's attached.
export function AttachmentPicker({url, onChange, pathPrefix, label = "Attach File (Excel / PDF / Photo)"}) {
  const [uploading, setUploading] = useState(false);
  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try { onChange(await uploadAttachment(file, pathPrefix)); }
    catch (err) { alert("Upload failed: " + err.message); }
    setUploading(false);
  };
  return (
    <div>
      <FL label={label} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 12px",
          background: "var(--surface2)", border: "1px dashed var(--border)", borderRadius: 8, cursor: uploading ? "wait" : "pointer",
          fontSize: 12, fontWeight: 600, color: url ? "var(--green)" : "var(--text3)" }}>
          <input type="file" accept=".xlsx,.xls,.csv,.pdf,image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleFile(f); }} disabled={uploading} />
          {uploading ? "⏳ Uploading…" : url ? "✅ Attached — tap to replace" : "📎 Choose Excel, PDF or photo"}
        </label>
        {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--blue)", flexShrink: 0 }}>View</a>}
        {url && <button type="button" onClick={() => onChange("")} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>✕</button>}
      </div>
    </div>
  );
}

// ── Licence renewal supporting documents ──────────────────────────────────
// A single renewal (especially a walk-in or a foreign national) can need
// several distinct supporting documents, not just one generic "document" —
// used by both the workshop's renewal-request form and the agent's walk-in
// form, and shown read-only in the agent's docs modal.
export const LICENCE_DOC_TYPES = [
  {key:"licence_disc",      label:"Licence Disc / Vehicle Doc"},
  {key:"ownership_cert",    label:"Ownership Certificate"},
  {key:"passport",          label:"Passport"},
  {key:"id",                label:"ID"},
  {key:"traffic_register",  label:"Traffic Register Number"},
  {key:"address_proof",     label:"Proof of Address"},
  {key:"bank_statement",    label:"Bank Statement"},
  {key:"permit_visa",       label:"Permit / Visa"},
  {key:"other",             label:"Other"},
];

// Documents are stored per-type as {url, expiry} — expiry is an optional
// YYYY-MM-DD string, blank meaning "doesn't expire" (e.g. a Traffic Register
// Number). These helpers also accept the older plain-string shape (just a
// url, no expiry) so documents saved before expiry tracking existed still
// display correctly.
const docUrl    = (d) => typeof d === "string" ? d : (d?.url || "");
const docExpiry = (d) => typeof d === "string" ? "" : (d?.expiry || "");

export function LicenceDocsChecklist({documents={}, onChange, pathPrefix="licence_docs", readOnly=false}) {
  const [uploading, setUploading] = useState("");

  const uploadOne = async (key, file) => {
    setUploading(key);
    try{
      const isPdf = file.type==="application/pdf";
      let blob, mimeType, ext;
      if(isPdf){ blob=file; mimeType="application/pdf"; ext="pdf"; }
      else {
        const dataUrl = await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=ev=>res(ev.target.result);fr.onerror=rej;fr.readAsDataURL(file);});
        blob = await new Promise((res,rej)=>{
          const img=new Image();
          img.onload=()=>{
            const MAX=1600; const canvas=document.createElement("canvas");
            let w=img.width,h=img.height;
            if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
            canvas.width=w;canvas.height=h;
            canvas.getContext("2d").drawImage(img,0,0,w,h);
            canvas.toBlob(b=>b?res(b):rej(new Error("toBlob failed")),"image/jpeg",0.85);
          };
          img.onerror=rej; img.src=dataUrl;
        });
        mimeType="image/jpeg"; ext="jpg";
      }
      const path=`${pathPrefix}/${key}_${Date.now()}.${ext}`;
      const url = await uploadToStorage("cars_parts",path,blob,mimeType);
      onChange({...documents,[key]:{url, expiry: docExpiry(documents[key])}});
    }catch(err){ alert("Upload failed: "+err.message); }
    setUploading("");
  };

  const setExpiry = (key, expiry) => {
    const cur = documents[key];
    if(!cur) return;
    onChange({...documents,[key]:{url: docUrl(cur), expiry}});
  };

  return (
    <div>
      {LICENCE_DOC_TYPES.map(({key,label})=>{
        const url = docUrl(documents[key]);
        const expiry = docExpiry(documents[key]);
        const isExpired = expiry && new Date(expiry) < new Date();
        return (
          <div key={key} style={{marginBottom:10,paddingBottom:readOnly?10:0,borderBottom:readOnly?"1px solid var(--border)":"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:170,flexShrink:0,fontSize:12,fontWeight:600,color:"var(--text2)"}}>{label}</div>
              {readOnly ? (
                url
                  ? <a href={url} target="_blank" rel="noreferrer" style={{fontSize:12,color:"var(--blue)"}}>🔗 View</a>
                  : <span style={{fontSize:12,color:"var(--text3)"}}>— not attached</span>
              ) : (
                <>
                  <label style={{width:36,height:32,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                    background:"var(--surface2)",border:"1px dashed var(--border)",borderRadius:7,cursor:uploading?"wait":"pointer",fontSize:15}}
                    title="Take a photo">
                    <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                      onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; if(f) uploadOne(key,f); }} disabled={!!uploading}/>
                    📷
                  </label>
                  <label style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"6px 10px",
                    background:"var(--surface2)",border:"1px dashed var(--border)",borderRadius:7,cursor:uploading?"wait":"pointer",fontSize:12,fontWeight:600,color:url?"var(--green)":"var(--text3)"}}>
                    <input type="file" accept="image/*,application/pdf" style={{display:"none"}}
                      onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; if(f) uploadOne(key,f); }} disabled={!!uploading}/>
                    {uploading===key?"⏳ Uploading…":url?"✅ Uploaded — tap to replace":"📎 Choose PDF or photo"}
                  </label>
                  {url&&<a href={url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--blue)",flexShrink:0}}>View</a>}
                </>
              )}
            </div>
            {url&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginTop:5,marginLeft:178,flexWrap:"wrap"}}>
                {readOnly ? (
                  expiry
                    ? <span style={{fontSize:11,fontWeight:600,color:isExpired?"var(--red)":"var(--green)"}}>{isExpired?"⚠️ Expired ":"Expires "}{expiry}</span>
                    : <span style={{fontSize:11,color:"var(--text3)"}}>No expiry date</span>
                ) : (
                  <>
                    <span style={{fontSize:11,color:"var(--text3)"}}>Expiry date:</span>
                    <input type="date" value={expiry} onChange={e=>setExpiry(key,e.target.value)}
                      style={{fontSize:11,padding:"3px 6px",borderRadius:6,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text1)"}}/>
                    {expiry
                      ? <button type="button" onClick={()=>setExpiry(key,"")} style={{fontSize:10,color:"var(--text3)",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Doesn't expire</button>
                      : <span style={{fontSize:10,color:"var(--text3)"}}>Leave blank if it doesn't expire</span>}
                    {isExpired&&<span style={{fontSize:11,fontWeight:700,color:"var(--red)"}}>⚠️ Expired</span>}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Uploads a receipt/new-licence-disc photo for a renewal and patches it via
// onUpdate — pulled out of RenewalDocsModal so a quick shortcut button
// elsewhere (the agent's queue table) can do the same upload+scan without
// opening the full modal. Returns {url, patch, scanNote} — scanNote is only
// set for field==="new_licence" (the disc's own barcode is the authoritative
// source for its expiry, read automatically instead of trusting today's
// renewal_years guess for next year's cycle).
export async function uploadRenewalOutput(renewal, field, file, onUpdate) {
  const isPdf = file.type==="application/pdf";
  let blob, mimeType, ext, dataUrl;
  if(isPdf){ blob=file; mimeType="application/pdf"; ext="pdf"; }
  else {
    dataUrl = await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=ev=>res(ev.target.result);fr.onerror=rej;fr.readAsDataURL(file);});
    blob = await new Promise((res,rej)=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=1600; const canvas=document.createElement("canvas");
        let w=img.width,h=img.height;
        if(w>MAX||h>MAX){const r=Math.min(MAX/w,MAX/h);w=Math.round(w*r);h=Math.round(h*r);}
        canvas.width=w;canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        canvas.toBlob(b=>b?res(b):rej(new Error("toBlob failed")),"image/jpeg",0.85);
      };
      img.onerror=rej; img.src=dataUrl;
    });
    mimeType="image/jpeg"; ext="jpg";
  }
  const path=`licence_renewals/${(renewal.vehicle_reg||"doc").replace(/[\s/\\]/g,"_").toUpperCase()}_${field}_${Date.now()}.${ext}`;
  const url = await uploadToStorage("cars_parts",path,blob,mimeType);
  const patch = {[`${field}_url`]:url};
  let scanNote = "";
  if(field==="new_licence" && dataUrl){
    try{
      const raw = await decodePDF417fromImage(dataUrl);
      const parsed = parseLicenceDisc(raw);
      if(parsed.expiry_date){
        patch.new_licence_expiry = parsed.expiry_date;
        scanNote = `✅ New expiry read from disc: ${parsed.expiry_date}`;
      } else {
        scanNote = "⚠️ Uploaded, but couldn't read an expiry date off the disc — you can type it in manually below.";
      }
    }catch{
      scanNote = "⚠️ Uploaded, but the barcode wasn't readable — you can type the new expiry in manually below.";
    }
  }
  await onUpdate(renewal.id,patch);
  return { url, patch, scanNote };
}

// Shared by the workshop's own renewal list and the licence agent's queue —
// which side is editable depends on who's looking: the workshop can add/update
// the customer's supporting documents (their own submission), while only the
// agent can attach the payment receipt / new licence disc sent back to the
// customer. workshopName is shown in the title only when passed (the agent's
// cross-workshop queue needs it; a workshop viewing their own renewal doesn't).
export function RenewalDocsModal({renewal, workshopName, viewer="agent", onUpdate, onClose}) {
  const [uploading, setUploading] = useState("");
  const [scanNote, setScanNote] = useState("");

  const uploadOutput = async (field, file) => {
    setUploading(field);
    setScanNote("");
    try{
      const {scanNote:note} = await uploadRenewalOutput(renewal, field, file, onUpdate);
      if(note) setScanNote(note);
    }catch(err){ alert("Upload failed: "+err.message); }
    setUploading("");
  };

  const OutputRow = ({field, label, icon, url}) => (
    <div style={{marginBottom:14}}>
      <FL label={`${icon} ${label}`}/>
      <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"10px 14px",
        background:"var(--surface2)",border:"2px dashed var(--border)",borderRadius:9,cursor:uploading?"wait":"pointer",fontSize:13,fontWeight:600,color:"var(--text2)"}}>
        <input type="file" accept="image/*,application/pdf" style={{display:"none"}}
          onChange={e=>{ const f=e.target.files?.[0]; e.target.value=""; if(f) uploadOutput(field,f); }} disabled={!!uploading}/>
        {uploading===field?"⏳ Uploading…":url?"✅ Uploaded — tap to replace":"📎 Choose PDF or photo"}
      </label>
      {url&&<a href={url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--blue)",marginTop:4,display:"inline-block"}}>🔗 View</a>}
      {field==="new_licence"&&scanNote&&<div style={{fontSize:11,color:"var(--text2)",marginTop:4}}>{scanNote}</div>}
      {field==="new_licence"&&(
        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"var(--text3)"}}>New expiry:</span>
          <input type="date" className="inp" style={{fontSize:12,padding:"4px 8px",width:150}}
            value={renewal.new_licence_expiry||""} onChange={e=>onUpdate(renewal.id,{new_licence_expiry:e.target.value})}/>
          <span style={{fontSize:10,color:"var(--text3)"}}>(auto-filled by scan; editable if it read wrong)</span>
        </div>
      )}
    </div>
  );

  const canEditDocuments = viewer==="workshop";
  const canEditOutputs = viewer==="agent";
  const hasDocs = renewal.documents && Object.keys(renewal.documents).length>0;

  return (
    <Overlay onClose={onClose}>
      <MHead title={`📎 Documents${workshopName?` — ${workshopName}`:""} — ${renewal.vehicle_reg||"Renewal"}`} onClose={onClose}/>
      <div style={{marginBottom:16}}>
        <FL label="📄 Customer's Supporting Documents"/>
        {renewal.document_url&&(
          <a href={renewal.document_url} target="_blank" rel="noreferrer" style={{display:"block",marginTop:4,marginBottom:6,fontSize:13,color:"var(--blue)"}}>🔗 View legacy attached document</a>
        )}
        {canEditDocuments ? (
          <LicenceDocsChecklist documents={renewal.documents||{}} onChange={docs=>onUpdate(renewal.id,{documents:docs})}
            pathPrefix={`licence_renewals/${(renewal.vehicle_reg||"doc").replace(/[\s/\\]/g,"_").toUpperCase()}`}/>
        ) : hasDocs ? (
          <LicenceDocsChecklist documents={renewal.documents} readOnly/>
        ) : !renewal.document_url&&<div style={{fontSize:12,color:"var(--text3)",marginTop:4}}>No documents were attached.</div>}
      </div>
      <div style={{borderTop:"1px solid var(--border)",paddingTop:14}}>
        <div style={{fontSize:11,color:"var(--text3)",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",marginBottom:10}}>Sent back to customer</div>
        {canEditOutputs ? (
          <>
            <OutputRow field="receipt" label="Payment Receipt" icon="🧾" url={renewal.receipt_url}/>
            <OutputRow field="new_licence" label="New Licence Disc" icon="🪪" url={renewal.new_licence_url}/>
          </>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:13}}>
              🧾 Payment Receipt: {renewal.receipt_url ? <a href={renewal.receipt_url} target="_blank" rel="noreferrer" style={{color:"var(--blue)"}}>🔗 View</a> : <span style={{color:"var(--text3)"}}>not yet provided</span>}
            </div>
            <div style={{fontSize:13}}>
              🪪 New Licence Disc: {renewal.new_licence_url ? <a href={renewal.new_licence_url} target="_blank" rel="noreferrer" style={{color:"var(--blue)"}}>🔗 View</a> : <span style={{color:"var(--text3)"}}>not yet provided</span>}
              {renewal.new_licence_expiry&&<span style={{marginLeft:8,color:"var(--green)",fontWeight:600}}>· New expiry: {renewal.new_licence_expiry}</span>}
            </div>
          </div>
        )}
      </div>
      <button className="btn btn-primary" style={{width:"100%",marginTop:16}} onClick={onClose}>Done</button>
    </Overlay>
  );
}
