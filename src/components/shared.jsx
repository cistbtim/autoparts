import { useState, useEffect, Component } from "react";
import { toLogoUrl, extractDriveId } from "../lib/helpers.js";
import { tSt } from "../lib/i18n.js";

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
      onError={e=>e.target.style.display="none"}/>
  );
  return null;
};

export const Overlay = ({onClose,children,wide}) => (
  <div className="overlay" onClick={onClose}>
    <div className={`modal${wide?" modal-wide":""}`} onClick={e=>e.stopPropagation()}>{children}</div>
  </div>
);

export const MHead = ({title,sub,onClose}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
    <div><h2 style={{fontSize:18,fontWeight:700}}>{title}</h2>{sub&&<p style={{fontSize:12,color:"var(--text3)",marginTop:3}}>{sub}</p>}</div>
    <button className="btn btn-ghost btn-sm" onClick={onClose} style={{flexShrink:0}}>✕</button>
  </div>
);

export const FL = ({label,req}) => <span className="lbl">{label}{req&&" *"}</span>;
export const FG = ({children,cols="1fr 1fr"}) => <div style={{display:"grid",gridTemplateColumns:cols,gap:12,marginBottom:14}}>{children}</div>;
export const FD = ({children}) => <div style={{marginBottom:14}}>{children}</div>;

// Reliable Google Drive image with multi-format fallback:
// tries thumbnail sz=w800 → sz=w400 → uc?export=view → hide
export function DriveImg({url, alt, style, onClick}) {
  const id = extractDriveId(url);
  const urls = id ? [
    `https://drive.google.com/thumbnail?id=${id}&sz=w800`,
    `https://drive.google.com/thumbnail?id=${id}&sz=w400`,
    `https://drive.google.com/uc?export=view&id=${id}`,
  ] : (url ? [url] : []);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  if (!urls.length || failed) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt||""}
      style={style}
      onClick={onClick}
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

export function ImgLightbox({url, onClose}) {
  const getSizes = (u) => {
    if(!u) return [u];
    const m = u.match(/thumbnail[?]id=([^&]+)/);
    if(m) return [
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`,
      `https://drive.google.com/thumbnail?id=${m[1]}&sz=w200`,
    ];
    return [u];
  };
  const sizes = getSizes(url);
  const [tryIdx, setTryIdx] = useState(0);
  const [status, setStatus] = useState("loading");
  const src = sizes[tryIdx] || url;

  const handleError = () => {
    if(tryIdx < sizes.length-1){
      setTryIdx(i=>i+1);
    } else {
      setStatus("error");
    }
  };

  return (
    <div onClick={onClose}
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
          <div style={{fontSize:11,opacity:.4,wordBreak:"break-all",maxWidth:360}}>{url}</div>
        </div>
      )}

      <img key={src} src={src} alt="part photo"
        style={{maxWidth:"90%",maxHeight:"90%",objectFit:"contain",
          display:status==="ok"?"block":"none",borderRadius:8}}
        onLoad={()=>setStatus("ok")}
        onError={handleError}
        onClick={e=>e.stopPropagation()}/>

      <div onClick={e=>{e.stopPropagation();onClose();}}
        style={{position:"fixed",top:14,right:14,background:"rgba(255,255,255,.15)",
          border:"1px solid rgba(255,255,255,.3)",color:"#fff",borderRadius:"50%",
          width:38,height:38,display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:18,fontWeight:700,zIndex:100000}}>✕</div>
    </div>
  );
}
