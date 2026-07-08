import { useEffect, useRef, useState } from "react";
import { Overlay } from "../shared.jsx";
import { api } from "../../lib/api.js";

const BTN_SIZE=52;
const DRAG_THRESHOLD=5;

function posKey(uid){ return `ws_feedback_pos_${uid||"anon"}`; }

function clampPos(p){
  const maxX=Math.max(4,window.innerWidth-BTN_SIZE-4);
  const maxY=Math.max(4,window.innerHeight-BTN_SIZE-4);
  return {x:Math.min(Math.max(p.x,4),maxX), y:Math.min(Math.max(p.y,4),maxY)};
}

// Position is stored as fractions of the viewport (0–1) so a spot picked on
// one device (e.g. desktop) still lands somewhere sane on another (e.g. phone).
const toPct=(p)=>({xPct:p.x/window.innerWidth, yPct:p.y/window.innerHeight});
const fromPct=(p)=>clampPos({x:p.xPct*window.innerWidth, y:p.yPct*window.innerHeight});

function loadLocalPos(uid){
  try{
    const raw=localStorage.getItem(posKey(uid));
    if(!raw) return null;
    const p=JSON.parse(raw);
    if(typeof p?.xPct==="number"&&typeof p?.yPct==="number") return fromPct(p);
  }catch{ /* ignore */ }
  return null;
}

function savePos(uid,pxPos){
  const pct=toPct(pxPos);
  try{ localStorage.setItem(posKey(uid),JSON.stringify(pct)); }catch{ /* ignore */ }
  if(uid){ api.patch("users","id",uid,{feedback_btn_pos:pct}).catch(()=>{ /* ignore */ }); }
}

// Floating feedback button — mounted once at the top of WorkshopPage so it's present on
// every workshop page/tab. Captures which page the user was on automatically so reports
// arrive with context instead of a bare message. Draggable — the dragged position is
// remembered per user (localStorage) so it stays out of the way of page-specific
// controls (mobile nav, pagination, sidebar sign-out, etc).
export function WorkshopFeedbackButton({page,userCtx,onSubmit}) {
  const [open,setOpen]=useState(false);
  const [type,setType]=useState("idea");
  const [message,setMessage]=useState("");
  const [sending,setSending]=useState(false);
  const [pos,setPos]=useState(()=>loadLocalPos(userCtx?.id));
  const drag=useRef({dragging:false,moved:false});

  // Reconcile with the server copy so a position dragged on one device shows up
  // on another — localStorage above gives an instant paint, this corrects it.
  useEffect(()=>{
    const uid=userCtx?.id;
    if(!uid) return;
    let cancelled=false;
    api.fresh("users",`id=eq.${uid}&select=feedback_btn_pos`).then(rows=>{
      if(cancelled) return;
      const pct=rows?.[0]?.feedback_btn_pos;
      if(pct&&typeof pct.xPct==="number"&&typeof pct.yPct==="number"){
        const px=fromPct(pct);
        setPos(px);
        try{ localStorage.setItem(posKey(uid),JSON.stringify(pct)); }catch{ /* ignore */ }
      }
    }).catch(()=>{ /* ignore */ });
    return ()=>{ cancelled=true; };
  },[userCtx?.id]);

  if(!onSubmit) return null;

  const send=async()=>{
    if(!message.trim()||sending) return;
    setSending(true);
    try{
      await onSubmit({page:page||"",type,message:message.trim(),user_name:userCtx?.name||"",user_role:userCtx?.role||""});
      setMessage(""); setType("idea"); setOpen(false);
    } finally { setSending(false); }
  };

  const onPointerDown=(e)=>{
    const rect=e.currentTarget.getBoundingClientRect();
    drag.current={dragging:true,moved:false,startX:e.clientX,startY:e.clientY,startLeft:rect.left,startTop:rect.top};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove=(e)=>{
    const d=drag.current;
    if(!d.dragging) return;
    const dx=e.clientX-d.startX, dy=e.clientY-d.startY;
    if(!d.moved&&(Math.abs(dx)>DRAG_THRESHOLD||Math.abs(dy)>DRAG_THRESHOLD)) d.moved=true;
    if(d.moved) setPos(clampPos({x:d.startLeft+dx,y:d.startTop+dy}));
  };
  const onPointerUp=(e)=>{
    const d=drag.current;
    if(d.dragging&&d.moved){
      setPos(cur=>{
        if(cur) savePos(userCtx?.id,cur);
        return cur;
      });
    } else if(d.dragging&&!d.moved){
      setOpen(true);
    }
    drag.current.dragging=false;
    try{ e.currentTarget.releasePointerCapture(e.pointerId); }catch{ /* ignore */ }
  };

  return (
    <>
      <button
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        title="Send feedback — drag to move" className={pos?"":"ws-feedback-btn"}
        style={pos
          ?{position:"fixed",left:pos.x,top:pos.y,right:"auto",bottom:"auto",zIndex:500,width:BTN_SIZE,height:BTN_SIZE,borderRadius:"50%",
            background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",border:"none",touchAction:"none",
            boxShadow:"0 4px 16px rgba(0,0,0,.3)",cursor:"grab",fontSize:22,
            display:"flex",alignItems:"center",justifyContent:"center"}
          :{position:"fixed",right:18,bottom:18,zIndex:500,width:BTN_SIZE,height:BTN_SIZE,borderRadius:"50%",
            background:"linear-gradient(135deg,#f97316,#ea580c)",color:"#fff",border:"none",touchAction:"none",
            boxShadow:"0 4px 16px rgba(0,0,0,.3)",cursor:"grab",fontSize:22,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
        💬
      </button>
      {open&&(
        <Overlay onClose={()=>setOpen(false)}>
          <div className="card" style={{maxWidth:420,width:"100%",padding:20}}>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:4}}>💬 Send Feedback</h3>
            <p style={{fontSize:12,color:"var(--text3)",marginBottom:14}}>
              Found a bug, or have an idea to make this easier to use? Goes straight to the developer.
            </p>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[["bug","🐛 Bug"],["idea","💡 Idea"],["other","💬 Other"]].map(([v,l])=>(
                <button key={v} onClick={()=>setType(v)} type="button"
                  style={{flex:1,padding:"7px 0",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",
                    border:`1px solid ${type===v?"var(--accent)":"var(--border)"}`,
                    background:type===v?"var(--accent)":"var(--surface2)",
                    color:type===v?"#fff":"var(--text2)"}}>
                  {l}
                </button>
              ))}
            </div>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={4} autoFocus
              placeholder="What happened, or what would help?"
              style={{width:"100%",padding:10,borderRadius:8,border:"1px solid var(--border)",
                background:"var(--surface2)",color:"var(--text)",fontSize:13,resize:"vertical",fontFamily:"inherit"}}/>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>📍 Page: {page||"—"}</div>
            <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"flex-end"}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setOpen(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={!message.trim()||sending} onClick={send}>
                {sending?"Sending…":"Send"}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
