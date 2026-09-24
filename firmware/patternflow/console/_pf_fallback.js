// The console's fallback window.PF. console_pages.py build stamps it into
// every page right after the chrome's <script src>, minus these comment
// lines, so it must stay one line of ES5. It defines nothing when
// /pf-console.js loaded; when it did not, a page's own PF calls still work
// (no toasts, no lane, no connection state) instead of the page dying.
// poll() behaves as the chrome's does: runs never overlap, now() is a no-op
// while one is in flight or after stop(), set() reschedules a waiting poll.
// status() and watchStatus() share one poller, so they never race either.
// Number() is 0 and Object(p) is p for any promise: inflight() and hold().
if(!window.PF)(function(){var W=window,U='/api/status',L=[],M=2e9,S,Z,P=W.PF={state:'live',dirty:!1,v:null,get:G,inflight:Number,hold:Object,say:function(t,k,e){e&&(e.textContent=t)},busy:function(b,p){function f(){b.disabled=!1}b.disabled=!0;p.then(f,f);return p},poll:function(s,m,c,o){var t,f,g=1;function R(){g&&!f&&(f=1,clearTimeout(t),(s.call?s():G(s)).then(function(d){c(d,null)},function(e){c(null,e)}).then(K,K))}function K(){f=0;clearTimeout(t);g&&(t=setTimeout(R,m))}o&&o.first===!1?K():R();return{stop:function(){g=0;clearTimeout(t)},set:function(n){m=n;f||K()},now:R}},status:function(c){c&&L.push(c);S?c&&c(S):Z?Z.now():Z=P.poll(U,M,D)},watchStatus:function(m){P.status();Z.set(M=Math.min(m,M))},waitForDevice:function(o){o=o||{};return new Promise(function(y,n){var h=P.poll(U,2e3,function(s){s&&!(o.build&&s.build==o.build)&&(h.stop(),y(s))});setTimeout(function(){h.stop();n(Error('timeout'))},o.timeout||9e4)})}};function G(u,o){return fetch(u,o).then(function(r){if(!r.ok)throw Error(r.status);return o&&o.text?r.text():r.json()})}function D(s){if(s){S=W.pfStatus=s;L.forEach(function(f){f(s)})}}})()
