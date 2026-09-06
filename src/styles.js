export const CSS = `
:root{--bg:#080b12;--surface:#0f1420;--surface2:#161c2d;--surface3:#1d2540;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);--accent:#f97316;--accent2:#fb923c;--text:#f1f5f9;--text2:#94a3b8;--text3:#475569;--green:#34d399;--red:#f87171;--blue:#60a5fa;--yellow:#fbbf24;--purple:#a78bfa;--radius:14px;--radius-sm:8px;--shadow:0 4px 24px rgba(0,0,0,0.4);--shadow-lg:0 8px 48px rgba(0,0,0,0.6);--glow:0 0 20px rgba(249,115,22,0.15);--sidebar-bg:#2b2e3b}
[data-theme="light"]{--bg:#f0ede8;--surface:#ffffff;--surface2:#f5f2ee;--surface3:#e8e4de;--border:rgba(0,0,0,0.08);--border2:rgba(0,0,0,0.14);--text:#1c1c1e;--text2:#48484a;--text3:#8e8e93;--green:#16a34a;--red:#dc2626;--blue:#2563eb;--yellow:#d97706;--purple:#7c3aed;--shadow:0 2px 16px rgba(0,0,0,0.07);--shadow-lg:0 8px 40px rgba(0,0,0,0.12);--glow:0 0 20px rgba(249,115,22,0.1)}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;overscroll-behavior-y:none}
button{font-family:inherit}svg text{font-family:'DM Sans',sans-serif}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--surface3);border-radius:99px}
.ws-tabs{scrollbar-width:thin}.ws-tabs::-webkit-scrollbar{height:6px}.ws-tabs::-webkit-scrollbar-thumb{background:var(--surface3);border-radius:99px}
.kanban-scroll::-webkit-scrollbar{height:10px}.kanban-scroll::-webkit-scrollbar-track{background:var(--surface2);border-radius:99px;margin:0 4px}.kanban-scroll::-webkit-scrollbar-thumb{background:rgba(249,115,22,.45);border-radius:99px}.kanban-scroll::-webkit-scrollbar-thumb:hover{background:rgba(249,115,22,.85)}
input,select,textarea{outline:none;font-family:'DM Sans',sans-serif}input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}
.btn{cursor:pointer;border:none;border-radius:var(--radius-sm);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;transition:all .18s;display:inline-flex;align-items:center;gap:6px;justify-content:center}
.btn:disabled{opacity:.4;cursor:not-allowed!important;transform:none!important}
.btn-primary{background:var(--accent);color:#fff;padding:10px 20px;box-shadow:0 4px 12px rgba(249,115,22,0.3)}.btn-primary:hover{background:var(--accent2);transform:translateY(-1px)}
.btn-ghost{background:var(--surface2);color:var(--text2);padding:10px 20px;border:1px solid var(--border2)}.btn-ghost:hover{background:var(--surface3);color:var(--text)}
.btn-success{background:rgba(52,211,153,.15);color:var(--green);padding:7px 14px;border:1px solid rgba(52,211,153,.25)}.btn-success:hover{background:rgba(52,211,153,.25)}
.btn-danger{background:rgba(248,113,113,.12);color:var(--red);padding:7px 14px;border:1px solid rgba(248,113,113,.2)}.btn-danger:hover{background:rgba(248,113,113,.2)}
.btn-info{background:rgba(96,165,250,.12);color:var(--blue);padding:7px 14px;border:1px solid rgba(96,165,250,.2)}.btn-info:hover{background:rgba(96,165,250,.2)}
.btn-purple{background:rgba(167,139,250,.12);color:var(--purple);padding:7px 14px;border:1px solid rgba(167,139,250,.2)}.btn-purple:hover{background:rgba(167,139,250,.2)}
.btn-sm{padding:6px 12px;font-size:13px}.btn-xs{padding:4px 10px;font-size:12px}
.inp{width:100%;background:var(--surface2);border:1.5px solid var(--border);color:var(--text);border-radius:var(--radius-sm);padding:10px 13px;font-size:14px;font-family:'DM Sans',sans-serif;transition:border .18s}
.inp:focus{border-color:var(--accent)}.inp::placeholder{color:var(--text3)}
select.inp{cursor:pointer}textarea.inp{resize:vertical;min-height:72px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.card-hover:hover{border-color:var(--border2)}
.kb-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:box-shadow .18s,transform .15s,border-color .18s}
.kb-card:hover{box-shadow:0 8px 28px rgba(0,0,0,.4);transform:translateY(-2px);border-color:var(--border2)}
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.tbl{width:100%;border-collapse:collapse}
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;position:relative;
  background:
    linear-gradient(to right,var(--surface) 30%,rgba(0,0,0,0)) left,
    linear-gradient(to left,var(--surface) 30%,rgba(0,0,0,0)) right,
    radial-gradient(farthest-side at 0 50%,rgba(249,115,22,.45),rgba(0,0,0,0)) left,
    radial-gradient(farthest-side at 100% 50%,rgba(249,115,22,.45),rgba(0,0,0,0)) right;
  background-repeat:no-repeat;background-color:var(--surface);
  background-size:26px 100%,26px 100%,12px 100%,12px 100%;
  background-attachment:local,local,scroll,scroll;
  scrollbar-width:auto;scrollbar-color:rgba(249,115,22,.6) var(--surface2);}
.tbl-wrap::-webkit-scrollbar{height:10px}
.tbl-wrap::-webkit-scrollbar-track{background:var(--surface2);border-radius:99px}
.tbl-wrap::-webkit-scrollbar-thumb{background:rgba(249,115,22,.6);border-radius:99px}
.tbl-wrap::-webkit-scrollbar-thumb:hover{background:rgba(249,115,22,.9)}
.mob-cards{display:none;flex-direction:column;gap:10px}
.desk-table{display:block}
@media(max-width:640px){.mob-cards{display:flex!important}.desk-table{display:none!important}}
@media(max-width:640px){
  .tbl-wrap{border-radius:0 0 var(--radius) var(--radius)}
  .tbl th,.tbl td{padding:8px 10px;font-size:12px;white-space:nowrap}
}
.tbl th{padding:11px 14px;text-align:left;font-size:11px;color:var(--text);font-weight:700;text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid var(--border);white-space:nowrap}
.tbl td{padding:13px 14px;font-size:14px;border-bottom:1px solid var(--border);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}.tbl tr:hover td{background:rgba(236,72,153,.1)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:200;padding:0}
@media(min-width:640px){.overlay{align-items:center;padding:20px}}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius) var(--radius) 0 0;padding:24px;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;animation:slideUp .2s ease}
@media(min-width:640px){.modal{border-radius:var(--radius);animation:fadeUp .18s ease}}
.modal-wide{max-width:820px}
.tabs{display:flex;background:var(--surface2);border-radius:var(--radius-sm);padding:3px;gap:2px;overflow-x:auto}
.tab{background:none;border:none;cursor:pointer;color:var(--text3);padding:7px 14px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;border-radius:6px;transition:all .18s;white-space:nowrap;flex-shrink:0}
.tab.on{background:var(--surface);color:var(--accent);box-shadow:0 1px 4px rgba(0,0,0,.3)}.tab:hover:not(.on){color:var(--text2)}
.lang{background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text2);padding:4px 10px;cursor:pointer;font-size:12px;font-family:'DM Sans',sans-serif;font-weight:500;transition:all .18s;min-height:36px;min-width:36px;display:inline-flex;align-items:center;justify-content:center}
.lang.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.auth-tab{flex:1;padding:10px;background:none;border:none;cursor:pointer;color:var(--text3);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;border-bottom:2px solid transparent;transition:all .18s}
.auth-tab.on{color:var(--accent);border-bottom-color:var(--accent)}
.part-img{width:63px;height:63px;border-radius:10px;object-fit:contain;background:#fff;border:1px solid var(--border);flex-shrink:0;cursor:zoom-in}
.part-emoji{width:63px;height:63px;border-radius:10px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0}
.lbl{font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px;display:block}
.divider{border:none;border-top:1px solid var(--border);margin:14px 0}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface3);border:1px solid var(--border2);color:var(--text);padding:11px 22px;border-radius:99px;font-size:14px;font-weight:500;z-index:999;white-space:nowrap;box-shadow:var(--shadow-lg);animation:fadeUp .25s ease}
/* landscape hint removed — app works in portrait mode */
.mobile-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--border);padding:6px 4px;z-index:100;gap:1px}
.show-mobile{display:none}
@media(max-width:767px){
  .mobile-nav{display:flex}.sidebar{display:none!important}
  .main-content{margin-left:0!important;padding:12px!important;padding-bottom:76px!important}
  .demo-banner{bottom:76px!important}
  .page-header{flex-direction:column;align-items:flex-start;gap:10px}
  .grid-4{grid-template-columns:1fr 1fr!important}
  .hide-mobile{display:none!important}
  .show-mobile{display:block!important}
  .toast{bottom:80px}
  .ws-feedback-btn{bottom:82px!important;left:18px!important;right:auto!important}
  .modal{border-radius:var(--radius) var(--radius) 0 0;max-height:88vh}
  .tbl th,.tbl td{padding:9px 10px;font-size:13px}
  /* Workshop header: tighter, single-column, full-width toolbar on phones */
  .ws-head{margin-bottom:8px!important;gap:6px!important}
  .ws-head h1{font-size:17px!important}
  .ws-head p{font-size:11px!important;margin-top:1px!important}
  .ws-head-side{width:100%;align-items:stretch!important;gap:6px!important}
  .ws-toolbar{width:100%;flex-wrap:wrap}
  .ws-toolbar>button.btn-primary{flex:1 1 auto;min-height:40px;padding:8px 10px!important}
  .ws-subnav-m{margin-bottom:10px!important}
  .ws-subnav-m select{padding:9px 12px;font-size:14px}
  /* Edit Part modal: info fields + photo side-by-side on desktop squeezed the
     photo column's buttons into ~210px on phones — stack instead */
  .pm-info-photo{flex-direction:column!important}
  .pm-photo-col{width:100%!important}
  /* FG (shared 2/3-column field-group grid, used across every modal in the app)
     doesn't fit multiple columns on a phone screen — fields overflow off the
     right edge instead of wrapping. Stack to one column. */
  .fg-grid{grid-template-columns:1fr!important}
}
.mob-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 2px;background:none;border:none;cursor:pointer;color:var(--text3);font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;border-radius:8px;transition:all .18s;position:relative}
.mob-nav-btn.on{color:var(--accent)}.mob-nav-btn .mi{font-size:18px;line-height:1}
.mob-badge{position:absolute;top:3px;right:calc(50% - 16px);background:var(--accent);color:#fff;border-radius:99px;min-width:15px;height:15px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;padding:0 3px}
.drawer-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;backdrop-filter:blur(2px)}
.drawer{position:fixed;top:0;left:0;bottom:0;width:82vw;max-width:300px;background:var(--surface);z-index:201;display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .25s cubic-bezier(.4,0,.2,1);overflow-y:auto;box-shadow:6px 0 32px rgba(0,0,0,.35)}
.drawer.open{transform:translateX(0)}
.drawer-backdrop.open{display:block}
.ws-more-sheet{position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-radius:20px 20px 0 0;z-index:202;transform:translateY(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);max-height:82vh;overflow-y:auto;box-shadow:0 -8px 40px rgba(0,0,0,.28)}
.ws-more-sheet.open{transform:translateY(0)}
.ws-more-handle{display:flex;justify-content:center;padding:12px 0 6px}
.ws-more-handle span{width:38px;height:4px;background:var(--border2);border-radius:99px;display:block}
.ws-more-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:10px 16px 16px}
.ws-more-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:13px 4px;background:var(--surface2);border:1.5px solid var(--border);border-radius:14px;cursor:pointer;font-size:11px;font-weight:600;color:var(--text2);font-family:'DM Sans',sans-serif;transition:all .15s;line-height:1.3;text-align:center;min-height:68px;width:100%}
.ws-more-item.on{background:var(--accent-soft,rgba(99,102,241,.12));border-color:var(--accent);color:var(--accent)}
.ws-more-item:active{transform:scale(.93)}
.ws-more-actions{display:flex;gap:8px;padding:4px 16px 24px}
.ws-more-sep{height:1px;background:var(--border);margin:0 16px 2px}
.stat-card{position:relative;overflow:hidden;padding:20px 22px;border-radius:var(--radius)}
.stat-card::after{content:'';position:absolute;inset:0;background:radial-gradient(circle at top right,var(--gc,transparent) 0%,transparent 70%);pointer-events:none}
.chk{width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex-shrink:0}
.inv-table{width:100%;border-collapse:collapse;font-size:13px}
.inv-table th{background:var(--surface2);padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em}
.inv-table td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes kanbanBar{0%{left:-30%}100%{left:100%}}
@keyframes skelPulse{0%,100%{opacity:.35}50%{opacity:.8}}
@keyframes pulseWarn{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes wsSubFlash{0%{opacity:1}50%{opacity:0}100%{opacity:1}}
.wsFlash{animation:wsSubFlash 2.5s ease-in-out infinite}
@keyframes raceCar{0%{transform:translateX(-180px)}100%{transform:translateX(420px)}}
@keyframes roadScroll{from{transform:translateX(0)}to{transform:translateX(-40px)}}
.fu{animation:fadeUp .2s ease}
.cp-btn{background:none;border:1px solid var(--border);border-radius:5px;color:var(--text3);cursor:pointer;font-size:11px;padding:2px 7px;font-family:"DM Sans",sans-serif;transition:all .18s;white-space:nowrap;flex-shrink:0}
.cp-btn:hover{background:var(--surface3);color:var(--text)}
.sidebar{background:var(--sidebar-bg)!important;border-right:1px solid rgba(255,255,255,.06)!important;--surface:rgba(255,255,255,.05);--surface2:rgba(255,255,255,.07);--surface3:rgba(255,255,255,.13);--border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.13);--text:rgba(255,255,255,.92);--text2:rgba(255,255,255,.7);--text3:rgba(255,255,255,.38)}
.sidebar .lang{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.7)}.sidebar .lang.on{background:var(--accent);border-color:var(--accent);color:#fff}
.sidebar .btn-ghost{background:rgba(255,255,255,.07);color:rgba(255,255,255,.65);border-color:rgba(255,255,255,.1)}.sidebar .btn-ghost:hover{background:rgba(255,255,255,.12);color:#fff}
.tbl th{background:var(--sidebar-bg);color:rgba(255,255,255,.78);border-bottom:none}
.tbl thead th:first-child{box-shadow:inset 10px 0 8px -8px rgba(249,115,22,.55)}
.tbl thead th:last-child{box-shadow:inset -10px 0 8px -8px rgba(249,115,22,.55)}
.inp-wrap{position:relative;width:100%}.inp-wrap .inp-icon{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--text3);pointer-events:none;display:flex;align-items:center;justify-content:center}
.status-bar{position:fixed;bottom:0;left:240px;right:0;height:28px;background:var(--surface);border-top:1px solid var(--border);display:flex;align-items:center;padding:0 16px;gap:16px;font-size:10.5px;color:var(--text3);letter-spacing:.03em;z-index:40}
@media(max-width:767px){.status-bar{left:0;bottom:66px}}
`;
