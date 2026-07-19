"""Injects a visible fake cursor into a Playwright page so clicks/moves are
visible in a screen recording (the real OS cursor isn't rendered inside a
headless/automated browser context)."""

_JS = r"""
(() => {
  if (window.__tutCursor) return;

  let styled = false;
  function ensureStyle() {
    if (styled || !document.documentElement) return;
    const style = document.createElement('style');
    style.textContent = `
      #__tut_cursor {
        position: fixed; z-index: 2147483647; width: 22px; height: 22px;
        border-radius: 50%; background: rgba(255,64,64,.85);
        border: 2px solid #fff; box-shadow: 0 0 6px rgba(0,0,0,.5);
        pointer-events: none; left: -100px; top: -100px;
        transition: left .35s cubic-bezier(.4,0,.2,1), top .35s cubic-bezier(.4,0,.2,1);
      }
      #__tut_cursor.pulse::after {
        content: ''; position: absolute; inset: -10px; border-radius: 50%;
        border: 2px solid rgba(255,64,64,.9); animation: __tut_pulse .5s ease-out;
      }
      @keyframes __tut_pulse {
        from { transform: scale(.4); opacity: 1; }
        to   { transform: scale(1.8); opacity: 0; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    styled = true;
  }

  // DOM isn't necessarily ready when this init script first runs (it also
  // fires on the blank pre-navigation document), so style/element creation
  // is deferred until the first actual moveTo/pulse call, by which point
  // the real page has loaded.
  function ensure() {
    ensureStyle();
    if (!document.documentElement) return null;
    let el = document.getElementById('__tut_cursor');
    if (!el) {
      el = document.createElement('div');
      el.id = '__tut_cursor';
      document.documentElement.appendChild(el);
    }
    return el;
  }

  window.__tutCursor = {
    moveTo(x, y) {
      const el = ensure();
      if (!el) return;
      el.style.left = (x - 11) + 'px';
      el.style.top = (y - 11) + 'px';
    },
    pulse() {
      const el = ensure();
      if (!el) return;
      el.classList.remove('pulse');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('pulse');
    },
  };
})();
"""


def install_cursor(page):
    """Call once right after creating the page, before the first navigation.
    Re-injects automatically on every subsequent navigation."""
    page.add_init_script(_JS)


def move_to(page, x, y, settle_ms=350):
    page.evaluate("([x,y]) => window.__tutCursor && window.__tutCursor.moveTo(x,y)", [x, y])
    page.wait_for_timeout(settle_ms)


def pulse(page, x=None, y=None, settle_ms=250):
    if x is not None and y is not None:
        page.evaluate("([x,y]) => window.__tutCursor && window.__tutCursor.moveTo(x,y)", [x, y])
    page.evaluate("() => window.__tutCursor && window.__tutCursor.pulse()")
    page.wait_for_timeout(settle_ms)
