// Floating accessibility widget — shared across all pages
(function(){
  var STORAGE_KEY = 'a11yPrefs';
  var FONT_STEPS = [100,110,120,130,140,150];
  var defaults = {fontStep:0, contrast:false, underline:false, readable:false, reduceMotion:false};
  var prefs = Object.assign({}, defaults);

  try{
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    prefs = Object.assign(prefs, saved);
  }catch(err){}

  var panelEl, fsLabelEl;

  function apply(){
    document.documentElement.style.fontSize = FONT_STEPS[prefs.fontStep] + '%';
    document.documentElement.classList.toggle('a11y-contrast', !!prefs.contrast);
    document.documentElement.classList.toggle('a11y-underline', !!prefs.underline);
    document.documentElement.classList.toggle('a11y-readable', !!prefs.readable);
    document.documentElement.classList.toggle('a11y-reduce-motion', !!prefs.reduceMotion);
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); }catch(err){}
    updateUI();
  }

  function updateUI(){
    if(!panelEl) return;
    var toggles = panelEl.querySelectorAll('[data-toggle]');
    for(var i=0;i<toggles.length;i++){
      var key = toggles[i].getAttribute('data-toggle');
      toggles[i].classList.toggle('on', !!prefs[key]);
    }
    if(fsLabelEl) fsLabelEl.textContent = FONT_STEPS[prefs.fontStep] + '%';
  }

  function buildWidget(){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'a11y-btn';
    btn.setAttribute('aria-label', 'אפשרויות נגישות');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="5" r="2" fill="currentColor"/>' +
      '<rect x="7" y="9" width="10" height="2.4" rx="1.2" fill="currentColor"/>' +
      '<rect x="10.8" y="9" width="2.4" height="11" rx="1.2" fill="currentColor"/>' +
      '<path d="M8.5 20.5l2.2-6.5h2.6l2.2 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
      '</svg>';

    var panel = document.createElement('div');
    panel.className = 'a11y-panel';
    panel.id = 'a11yPanel';
    panel.innerHTML =
      '<h4>נגישות <button type="button" class="close" aria-label="סגירת תפריט נגישות">✕</button></h4>' +
      '<div class="a11y-row">' +
        '<span class="lbl">גודל טקסט</span>' +
        '<div class="a11y-steps">' +
          '<button type="button" data-fs="-1" aria-label="הקטנת טקסט">A-</button>' +
          '<span id="a11yFsLabel">100%</span>' +
          '<button type="button" data-fs="1" aria-label="הגדלת טקסט">A+</button>' +
        '</div>' +
      '</div>' +
      '<div class="a11y-row"><span class="lbl">ניגודיות גבוהה</span><button type="button" class="a11y-toggle" data-toggle="contrast" aria-label="הפעלת ניגודיות גבוהה"></button></div>' +
      '<div class="a11y-row"><span class="lbl">הדגשת קישורים</span><button type="button" class="a11y-toggle" data-toggle="underline" aria-label="הדגשת קישורים"></button></div>' +
      '<div class="a11y-row"><span class="lbl">גופן קריא</span><button type="button" class="a11y-toggle" data-toggle="readable" aria-label="גופן קריא יותר"></button></div>' +
      '<div class="a11y-row"><span class="lbl">הפחתת אנימציות</span><button type="button" class="a11y-toggle" data-toggle="reduceMotion" aria-label="הפחתת אנימציות ותנועה"></button></div>' +
      '<button type="button" class="a11y-reset">איפוס כל ההגדרות</button>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    panelEl = panel;
    fsLabelEl = panel.querySelector('#a11yFsLabel');

    btn.addEventListener('click', function(){
      var open = panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.querySelector('.close').addEventListener('click', function(){
      panel.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });

    var fsBtns = panel.querySelectorAll('[data-fs]');
    for(var i=0;i<fsBtns.length;i++){
      fsBtns[i].addEventListener('click', function(e){
        var dir = Number(e.currentTarget.getAttribute('data-fs'));
        prefs.fontStep = Math.min(FONT_STEPS.length - 1, Math.max(0, prefs.fontStep + dir));
        apply();
      });
    }
    var toggleBtns = panel.querySelectorAll('[data-toggle]');
    for(var j=0;j<toggleBtns.length;j++){
      toggleBtns[j].addEventListener('click', function(e){
        var key = e.currentTarget.getAttribute('data-toggle');
        prefs[key] = !prefs[key];
        apply();
      });
    }
    panel.querySelector('.a11y-reset').addEventListener('click', function(){
      prefs = Object.assign({}, defaults);
      apply();
    });

    document.addEventListener('click', function(e){
      if(panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)){
        panel.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    apply();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
