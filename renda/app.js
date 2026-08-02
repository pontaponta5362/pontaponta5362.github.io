"use strict";
(() => {
  // ================= utils =================
  const $ = id => document.getElementById(id);
  const now = () => performance.now();
  const DEV = new URLSearchParams(location.search).has('dev');

  function chipGroup(el, onChange){
    el.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if(!b) return;
      el.querySelectorAll('.chip').forEach(c => c.classList.remove('sel'));
      b.classList.add('sel');
      if(onChange) onChange(+b.dataset.v);
    });
  }
  function reflash(el, cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function fmtDate(ts){
    const d = new Date(ts);
    const z = n => (n < 10 ? '0' : '') + n;
    return (d.getMonth()+1) + '/' + d.getDate() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  // ================= storage =================
  let DB = { bests:{}, runs:[], settings:{} };
  try{
    const raw = localStorage.getItem('renda.v2');
    if(raw){ const p = JSON.parse(raw); DB = Object.assign(DB, p); }
  }catch(e){}
  function save(){ try{ localStorage.setItem('renda.v2', JSON.stringify(DB)); }catch(e){} }
  function addRun(mode, metrics){
    DB.runs.push(Object.assign({ m:mode, t:Date.now() }, metrics));
    if(DB.runs.length > 200) DB.runs = DB.runs.slice(-200);
    save();
  }
  function updBest(key, v, higher){
    const cur = DB.bests[key];
    if(cur == null || (higher !== false ? v > cur : v < cur)){ DB.bests[key] = v; save(); return true; }
    return false;
  }

  // ================= countdown =================
  // bigEl に 3,2,1,GO! を表示してから cb() を呼ぶ。返り値はキャンセル関数。
  function countdown(bigEl, midEl, cb){
    const seq = ['3','2','1'];
    let i = 0;
    bigEl.textContent = seq[0];
    bigEl.classList.add('counting');
    if(midEl) midEl.textContent = '力を抜いて構えて…';
    const iv = setInterval(() => {
      i++;
      if(i < seq.length){
        bigEl.textContent = seq[i];
      } else {
        clearInterval(iv);
        bigEl.textContent = 'GO!';
        setTimeout(() => bigEl.classList.remove('counting'), 250);
        cb();
      }
    }, 700);
    return () => { clearInterval(iv); bigEl.classList.remove('counting'); };
  }

  // ================= tabs =================
  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if(!b) return;
    document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('main section').forEach(s => s.classList.remove('active'));
    $('sec-' + b.dataset.tab).classList.add('active');
    if(b.dataset.tab !== 'bpm') bpStop();
    if(b.dataset.tab === 'rec') renderRecords();
  });

  // ================= help =================
  const HELP = {
    speed: ['速度計測のつかいかた',
      '<b>1.</b> 計測時間を選ぶ（まずは5秒がおすすめ）<br>' +
      '<b>2.</b> 大きなゾーンをタップすると 3・2・1 のカウントダウン<br>' +
      '<b>3.</b> GO! と同時に全力連打！<br><br>' +
      '結果は<b>打/秒</b>と<b>16分換算BPM</b>（そのBPMの16分連打を叩ける目安）で表示。自己ベストは自動保存されます。<br><br>' +
      '<b>コツ:</b> 指先だけを細かく振動させるイメージ。腕全体で押すと遅くなります。'],
    alt: ['交互連打のつかいかた',
      '<b>1.</b> 左右どちらかのゾーンをタップするとカウントダウン<br>' +
      '<b>2.</b> GO! から左→右→左→右…と交互に連打<br><br>' +
      '<b>交互率</b>は「ちゃんと交互に叩けた割合」。100%が理想です。<b>左右バランス</b>が偏る人は苦手な側の手を意識しましょう。<br><br>' +
      '<b>コツ:</b> プロセカやガルパの親指プレイの基礎練になります。最初はゆっくり正確に。'],
    bpm: ['BPM追従のつかいかた',
      '<b>1.</b> BPMと音符（16分など）を設定<br>' +
      '<b>2.</b> スタートを押すとノーツが右から流れてきます<br>' +
      '<b>3.</b> ノーツが<b>左の判定線に重なる瞬間</b>にタップ！<br><br>' +
      '大きい青丸が拍（クリック音の位置）、小さい丸がその間の刻みです。タップごとに ◎○✕ とズレのms表示が出ます。<br><br>' +
      '<b>オートアップ</b>をONにすると10秒ごとに+5BPMずつ上がるので、限界BPMを探すのに便利。<br><br>' +
      '<b>音が出ないときは:</b> マナーモードを解除して音量を確認してください。'],
    endu: ['持久力のつかいかた',
      '<b>1.</b> 30秒か60秒を選んでゾーンをタップ<br>' +
      '<b>2.</b> GO! から最後まで叩き続ける！<br><br>' +
      '終わると1秒ごとの速度グラフと<b>スタミナ維持率</b>（終盤5秒÷序盤5秒）が出ます。<br><br>' +
      '<b>目安:</b> 維持率90%以上なら優秀、80%未満は力みすぎか序盤の飛ばしすぎ。8割の力で一定ペースを目指すのが上達の近道です。'],
    rec: ['記録について',
      '各モードの計測結果は<b>この端末のブラウザに自動保存</b>されます（サーバーには送信されません）。<br><br>' +
      'グラフで速度計測の成長が見られます。ブラウザのデータを消すと記録も消えるので注意。<br><br>' +
      'ホーム画面に追加しておくと、いつでもすぐ練習できます。']
  };
  document.addEventListener('click', e => {
    const q = e.target.closest('.qbtn[data-help]');
    if(q){
      const h = HELP[q.dataset.help];
      $('helpTitle').textContent = h[0];
      $('helpBody').innerHTML = h[1];
      $('helpOverlay').hidden = false;
    }
  });
  $('helpClose').addEventListener('click', () => { $('helpOverlay').hidden = true; });
  $('helpOverlay').addEventListener('click', e => { if(e.target === $('helpOverlay')) $('helpOverlay').hidden = true; });

  // ================= generic line chart (SVG) =================
  function lineChart(holder, tipEl, values, labels, tipFmt){
    const W = holder.clientWidth || 320, H = 180;
    const padL = 30, padR = 10, padT = 10, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    const n = values.length;
    const maxV = Math.max(4, Math.ceil(Math.max.apply(null, values) / 2) * 2);
    const x = i => padL + (n <= 1 ? iw / 2 : i / (n - 1) * iw);
    const y = v => padT + ih - v / maxV * ih;
    const pts = values.map((v, i) => ({ px:x(i), py:y(v), i:i, v:v }));

    let s = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" role="img">';
    for(let g = 0; g <= 4; g++){
      const v = maxV / 4 * g, gy = y(v);
      s += '<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="var(--grid)" stroke-width="1"/>';
      s += '<text x="'+(padL-6)+'" y="'+(gy+4)+'" text-anchor="end" font-size="10" fill="var(--muted)">'+v+'</text>';
    }
    const xstep = Math.max(1, Math.ceil(n / 7));
    for(let i = 0; i < n; i += xstep){
      s += '<text x="'+x(i)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+labels[i]+'</text>';
    }
    s += '<line x1="'+padL+'" y1="'+(padT+ih)+'" x2="'+(W-padR)+'" y2="'+(padT+ih)+'" stroke="var(--axis)" stroke-width="1"/>';
    let d = '';
    pts.forEach((p, i) => { d += (i ? 'L' : 'M') + p.px.toFixed(1) + ' ' + p.py.toFixed(1); });
    s += '<path d="'+d+'" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    const lastP = pts[pts.length - 1];
    s += '<circle cx="'+lastP.px+'" cy="'+lastP.py+'" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/>';
    s += '<line class="cross" x1="0" y1="'+padT+'" x2="0" y2="'+(padT+ih)+'" stroke="var(--ink2)" stroke-width="1" stroke-dasharray="3 3" style="display:none"/>';
    s += '<circle class="dot" r="4" fill="var(--s1)" stroke="#fff" stroke-width="1.5" style="display:none"/>';
    s += '</svg>';
    holder.innerHTML = s;

    const svg = holder.querySelector('svg');
    function showTip(clientX){
      const r = svg.getBoundingClientRect();
      const sx = (clientX - r.left) * (W / r.width);
      let best = pts[0];
      for(const p of pts) if(Math.abs(p.px - sx) < Math.abs(best.px - sx)) best = p;
      const cross = svg.querySelector('.cross'), dot = svg.querySelector('.dot');
      cross.setAttribute('x1', best.px); cross.setAttribute('x2', best.px);
      cross.style.display = ''; dot.style.display = '';
      dot.setAttribute('cx', best.px); dot.setAttribute('cy', best.py);
      tipEl.style.display = 'block';
      tipEl.style.left = (best.px / W * r.width) + 'px';
      tipEl.style.top = (best.py / H * r.height) + 'px';
      tipEl.textContent = tipFmt(best.i, best.v);
    }
    function hideTip(){
      tipEl.style.display = 'none';
      const c = svg.querySelector('.cross'), d2 = svg.querySelector('.dot');
      if(c) c.style.display = 'none'; if(d2) d2.style.display = 'none';
    }
    svg.addEventListener('pointerdown', e => { e.preventDefault(); showTip(e.clientX); });
    svg.addEventListener('pointermove', e => { if(e.buttons || e.pointerType === 'mouse') showTip(e.clientX); });
    svg.addEventListener('pointerup', hideTip);
    svg.addEventListener('pointerleave', hideTip);
    svg.style.touchAction = 'none';
  }

  // =========================================================
  // Mode 1: 速度計測
  // =========================================================
  const sp = { state:'idle', t0:0, count:0, dur:5, raf:0, cancel:null };
  function spShowBest(){
    const b = DB.bests['sp' + sp.dur];
    $('spBest').textContent = b != null ? b.toFixed(1) : '–';
  }
  chipGroup($('spDur'), v => { sp.dur = v; spReset(); });

  $('spZone').addEventListener('pointerdown', e => {
    e.preventDefault();
    if(sp.state === 'idle'){
      sp.state = 'count';
      sp.cancel = countdown($('spBig'), $('spMid'), () => {
        sp.state = 'running'; sp.t0 = now(); sp.count = 0;
        $('spZone').classList.add('running');
        $('spMid').textContent = '';
        sp.raf = requestAnimationFrame(spTick);
      });
    } else if(sp.state === 'running'){
      reflash($('spZone'), 'flash');
      sp.count++;
      $('spBig').textContent = sp.count;
    } else if(sp.state === 'done'){
      spReset();
    }
  });

  function spTick(){
    const el = (now() - sp.t0) / 1000;
    if(el >= sp.dur){ spFinish(); return; }
    $('spMid').textContent = '残り ' + (sp.dur - el).toFixed(1) + ' 秒';
    sp.raf = requestAnimationFrame(spTick);
  }
  function spFinish(){
    sp.state = 'done';
    $('spZone').classList.remove('running');
    const tps = sp.count / sp.dur;
    $('spBig').textContent = '終了！';
    $('spMid').textContent = 'タップでもう一回';
    $('spTps').textContent = tps.toFixed(1);
    $('spBpm').textContent = Math.round(tps * 15);
    const isBest = updBest('sp' + sp.dur, Math.round(tps * 10) / 10);
    spShowBest();
    addRun('speed', { dur: sp.dur, tps: Math.round(tps * 10) / 10 });
    $('spMsg').innerHTML = sp.count + ' 打 / ' + sp.dur + '秒。16分連打なら <span class="best">BPM ' +
      Math.round(tps * 15) + '</span> 相当です。' + (isBest ? ' 🏆 <span class="best">自己ベスト更新！</span>' : '');
  }
  function spReset(){
    cancelAnimationFrame(sp.raf);
    if(sp.cancel) sp.cancel();
    sp.state = 'idle'; sp.count = 0;
    $('spZone').classList.remove('running');
    $('spBig').innerHTML = 'タップで<br>スタート';
    $('spMid').textContent = '3・2・1のあと計測開始';
    $('spTps').textContent = '–'; $('spBpm').textContent = '–'; $('spMsg').textContent = '';
    spShowBest();
  }
  spShowBest();

  // =========================================================
  // Mode 2: 交互連打
  // =========================================================
  const al = { state:'idle', t0:0, dur:10, L:0, R:0, alt:0, last:null, raf:0, cancel:null };
  chipGroup($('altDur'), v => { al.dur = v; altReset(); });

  function altTap(side, zone, flashCls){
    if(al.state === 'idle'){
      al.state = 'count';
      $('altOver').hidden = false;
      al.cancel = countdown($('altOverTxt'), null, () => {
        setTimeout(() => { $('altOver').hidden = true; }, 250);
        al.state = 'running'; al.t0 = now();
        al.raf = requestAnimationFrame(altTick);
      });
      return;
    }
    if(al.state !== 'running') return;
    reflash(zone, flashCls);
    if(side === 'L') al.L++; else al.R++;
    if(al.last !== null && al.last !== side) al.alt++;
    al.last = side;
    $('altL').textContent = al.L; $('altR').textContent = al.R;
  }
  $('zoneL').addEventListener('pointerdown', e => { e.preventDefault(); altTap('L', $('zoneL'), 'flashL'); });
  $('zoneR').addEventListener('pointerdown', e => { e.preventDefault(); altTap('R', $('zoneR'), 'flashR'); });

  function altTick(){
    const el = (now() - al.t0) / 1000;
    if(el >= al.dur){ altFinish(); return; }
    $('altTime').textContent = '残り ' + (al.dur - el).toFixed(1) + ' 秒';
    al.raf = requestAnimationFrame(altTick);
  }
  function altFinish(){
    al.state = 'done';
    const total = al.L + al.R;
    const tps = total / al.dur;
    const rate = total > 1 ? Math.round(al.alt / (total - 1) * 100) : 0;
    $('altTime').textContent = '終了！ゾーンタップでもう一回';
    $('altTps').textContent = tps.toFixed(1);
    $('altRate').textContent = rate + '%';
    const balL = total ? Math.round(al.L / total * 100) : 50;
    $('altBal').innerHTML = balL + '<small> : ' + (100 - balL) + '</small>';
    const isBest = updBest('altRate', rate);
    addRun('alt', { dur: al.dur, tps: Math.round(tps * 10) / 10, rate: rate });
    let advice;
    if(rate >= 95) advice = '完璧な交互連打！このままBPM追従で速度を上げましょう。';
    else if(rate >= 80) advice = 'ほぼ交互に叩けています。片側連打が混ざる瞬間を意識してみて。';
    else advice = '片手に偏りがち。ゆっくりでいいので「左右左右」のリズムを体に入れましょう。';
    $('altMsg').textContent = total + ' 打（左' + al.L + ' / 右' + al.R + '）。' + advice + (isBest ? ' 🏆 交互率の自己ベスト！' : '');
  }
  function altReset(){
    cancelAnimationFrame(al.raf);
    if(al.cancel) al.cancel();
    $('altOver').hidden = true;
    al.state = 'idle'; al.L = 0; al.R = 0; al.alt = 0; al.last = null;
    $('altL').textContent = '0'; $('altR').textContent = '0';
    $('altTime').textContent = 'どちらかをタップでスタート';
    $('altTps').textContent = '–'; $('altRate').textContent = '–'; $('altBal').textContent = '–';
    $('altMsg').textContent = '';
  }
  document.querySelectorAll('#sec-alt .halfzone').forEach(z => {
    z.addEventListener('pointerdown', () => { if(al.state === 'done') altReset(); });
  });

  // =========================================================
  // Mode 3: BPM追従
  // =========================================================
  const bp = {
    running:false, bpm:140, div:4, ctx:null, nextBeat:0, timer:0,
    taps:[], notes:[], count:0, autoTimer:0, raf:0, beatCount:0,
    hits:{ p:0, g:0, m:0 }, offsets:[], lastAudioT:0, lastAdvance:0
  };
  const bpTargetTps = () => bp.bpm / 60 * bp.div;

  function bpUpdateTargetUI(){
    $('bpVal').textContent = bp.bpm;
    $('bpTarget').textContent = bpTargetTps().toFixed(1);
  }
  chipGroup($('bpDiv'), v => { bp.div = v; bpUpdateTargetUI(); });
  document.querySelector('.stepper').addEventListener('click', e => {
    const b = e.target.closest('button[data-d]'); if(!b) return;
    bp.bpm = Math.min(300, Math.max(60, bp.bpm + (+b.dataset.d)));
    bpUpdateTargetUI();
  });

  function click(t, accent){
    if(!$('bpSound').checked) return;
    const o = bp.ctx.createOscillator(), g = bp.ctx.createGain();
    o.frequency.value = accent ? 1320 : 880;
    g.gain.setValueAtTime(accent ? 0.5 : 0.32, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(bp.ctx.destination);
    o.start(t); o.stop(t + 0.06);
  }

  // 停止・復帰対策: オーディオが止まっていたら再開し、拍の基準を張り直す
  function ensureCtxRunning(){
    if(bp.ctx && bp.ctx.state !== 'running'){
      bp.ctx.resume().catch(() => {});
    }
  }
  function bpResync(){
    if(!bp.ctx) return;
    const t = bp.ctx.currentTime;
    if(bp.nextBeat < t - 0.2 || bp.nextBeat > t + 3){
      bp.notes.length = 0;
      bp.nextBeat = t + 0.5;
    }
  }
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && bp.running){ ensureCtxRunning(); bpResync(); }
  });

  function scheduler(){
    const spb = 60 / bp.bpm;
    if(bp.nextBeat < bp.ctx.currentTime - 0.2) bpResync(); // タイマー詰まりからの復帰
    while(bp.nextBeat < bp.ctx.currentTime + 1.6){
      click(bp.nextBeat, bp.beatCount % 4 === 0);
      for(let k = 0; k < bp.div; k++){
        bp.notes.push({ t: bp.nextBeat + spb * k / bp.div, beat: k === 0 });
      }
      bp.nextBeat += spb;
      bp.beatCount++;
    }
    const cut = bp.ctx.currentTime - 0.35;
    while(bp.notes.length && bp.notes[0].t < cut) bp.notes.shift();
  }

  async function bpStart(){
    if(!bp.ctx){
      bp.ctx = new (window.AudioContext || window.webkitAudioContext)();
      bp.ctx.onstatechange = () => { if(bp.running && bp.ctx.state === 'running') bpResync(); };
    }
    // iOSのマナーモード対策: 「再生用」オーディオとして宣言 + 無音再生でアンロック
    try{ if('audioSession' in navigator) navigator.audioSession.type = 'playback'; }catch(err){}
    try{ await bp.ctx.resume(); }catch(err){}
    try{
      const buf = bp.ctx.createBuffer(1, 1, 22050);
      const src = bp.ctx.createBufferSource();
      src.buffer = buf; src.connect(bp.ctx.destination); src.start(0);
    }catch(err){}
    bp.running = true; bp.taps = []; bp.notes = []; bp.count = 0; bp.beatCount = 0;
    bp.hits = { p:0, g:0, m:0 }; bp.offsets = [];
    bp.lastAudioT = 0; bp.lastAdvance = now();
    $('bpCount').textContent = '0';
    $('cntP').textContent = '0'; $('cntG').textContent = '0'; $('cntM').textContent = '0';
    $('bpHit').textContent = 'ノーツが左の判定線に重なる瞬間にタップ';
    $('bpHit').style.color = 'var(--muted)';
    $('bpSummary').textContent = '';
    $('bpZoneHint').textContent = '';
    bp.nextBeat = bp.ctx.currentTime + 0.6;
    bp.timer = setInterval(scheduler, 25);
    if($('bpAuto').checked){
      bp.autoTimer = setInterval(() => {
        bp.bpm = Math.min(300, bp.bpm + 5);
        bpUpdateTargetUI();
      }, 10000);
    }
    bp.raf = requestAnimationFrame(bpLoop);
    const btn = $('bpBtn'); btn.textContent = '■ ストップ'; btn.classList.add('stop');
  }

  function bpStop(){
    if(!bp.running) return;
    bp.running = false;
    clearInterval(bp.timer); clearInterval(bp.autoTimer);
    cancelAnimationFrame(bp.raf);
    $('bpHit').textContent = '';
    const cv = $('bpLane');
    const c2 = cv.getContext('2d'); c2.clearRect(0, 0, cv.width, cv.height);
    const btn = $('bpBtn'); btn.textContent = '▶ スタート'; btn.classList.remove('stop');
    $('bpZoneHint').textContent = 'スタートを押してからここを連打';
    // 今回のまとめ
    const judged = bp.hits.p + bp.hits.g + bp.hits.m;
    if(judged >= 8){
      const acc = Math.round(bp.hits.p / judged * 100);
      const avgOff = Math.round(bp.offsets.reduce((s, x) => s + x, 0) / bp.offsets.length);
      $('bpSummary').innerHTML = '今回: ' + bp.count + '打 / PERFECT率 <b>' + acc + '%</b> / 平均ズレ <b>' +
        (avgOff >= 0 ? '+' : '') + avgOff + 'ms</b>（+は遅れ気味、−は走り気味）';
      addRun('bpm', { bpm: bp.bpm, div: bp.div, taps: bp.count, acc: acc, off: avgOff });
      updBest('bpmAcc', acc);
    }
  }
  $('bpBtn').addEventListener('click', () => bp.running ? bpStop() : bpStart());

  $('bpZone').addEventListener('pointerdown', e => {
    e.preventDefault();
    if(!bp.running) return;
    ensureCtxRunning();
    reflash($('bpZone'), 'flash');
    bp.count++; $('bpCount').textContent = bp.count;
    bp.taps.push(now());
    const tt = bp.ctx.currentTime;
    let bestN = null, bestD = Infinity;
    for(const n2 of bp.notes){
      const d = Math.abs(n2.t - tt);
      if(d < bestD){ bestD = d; bestN = n2; }
    }
    if(bestN && bestD < 0.5){
      const dms = Math.round((tt - bestN.t) * 1000);
      const a = Math.abs(dms), hit = $('bpHit');
      bp.offsets.push(dms);
      if(a <= 45){ hit.textContent = '◎ PERFECT'; hit.style.color = 'var(--good)'; bp.hits.p++; }
      else if(a <= 100){ hit.textContent = (dms < 0 ? '○ 早め −' : '○ 遅れ ＋') + a + 'ms'; hit.style.color = 'var(--warn)'; bp.hits.g++; }
      else { hit.textContent = (dms < 0 ? '✕ 早すぎ −' : '✕ 遅すぎ ＋') + a + 'ms'; hit.style.color = 'var(--bad)'; bp.hits.m++; }
      $('cntP').textContent = bp.hits.p; $('cntG').textContent = bp.hits.g; $('cntM').textContent = bp.hits.m;
    }
  });

  function drawLane(){
    const cv = $('bpLane');
    const dpr = window.devicePixelRatio || 1;
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if(cv.width !== Math.round(cw * dpr)){ cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const c2 = cv.getContext('2d');
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, cw, ch);
    const J = 46;
    const pxPerSec = (cw - J - 12) / 1.4;
    const tnow = bp.ctx.currentTime;
    const cy = ch / 2;
    let glow = false;
    for(const n2 of bp.notes){ if(Math.abs(n2.t - tnow) < 0.04){ glow = true; break; } }
    c2.strokeStyle = glow ? '#ffffff' : '#c3c2b7';
    c2.lineWidth = glow ? 3 : 2;
    c2.beginPath(); c2.moveTo(J, 6); c2.lineTo(J, ch - 6); c2.stroke();
    for(const n2 of bp.notes){
      const x = J + (n2.t - tnow) * pxPerSec;
      if(x > cw + 12) continue;
      const past = tnow - n2.t;
      c2.globalAlpha = past > 0 ? Math.max(0, 1 - past / 0.3) : 1;
      c2.beginPath();
      c2.arc(x, cy, n2.beat ? 9 : 5, 0, Math.PI * 2);
      c2.fillStyle = n2.beat ? '#3987e5' : '#898781';
      c2.fill();
      c2.globalAlpha = 1;
    }
  }

  function bpLoop(){
    // ウォッチドッグ: オーディオ時計が0.6秒以上止まっていたら復帰させる
    const at = bp.ctx.currentTime;
    if(at !== bp.lastAudioT){ bp.lastAudioT = at; bp.lastAdvance = now(); }
    else if(now() - bp.lastAdvance > 600){ ensureCtxRunning(); bpResync(); bp.lastAdvance = now(); }

    const t = now(), win = 2000;
    bp.taps = bp.taps.filter(x => t - x <= win);
    const span = bp.taps.length ? Math.min(win, t - bp.taps[0] + 1) : win;
    const actual = bp.taps.length ? bp.taps.length / (span / 1000) : 0;
    $('bpActual').textContent = actual.toFixed(1);
    drawLane();
    bp.raf = requestAnimationFrame(bpLoop);
  }
  bpUpdateTargetUI();

  // =========================================================
  // Mode 4: 持久力
  // =========================================================
  const en = { state:'idle', t0:0, dur:30, count:0, buckets:[], raf:0, cancel:null };
  chipGroup($('enDur'), v => { en.dur = v; enReset(); });
  if(DEV){
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.v = '5'; b.textContent = '5秒(dev)';
    $('enDur').appendChild(b);
  }

  $('enZone').addEventListener('pointerdown', e => {
    e.preventDefault();
    if(en.state === 'idle'){
      en.state = 'count';
      $('enResult').hidden = true;
      en.cancel = countdown($('enBig'), $('enMid'), () => {
        en.state = 'running'; en.t0 = now();
        en.buckets = new Array(en.dur).fill(0);
        en.count = 0;
        $('enZone').classList.add('running');
        $('enMid').textContent = '';
        en.raf = requestAnimationFrame(enTick);
      });
    } else if(en.state === 'running'){
      reflash($('enZone'), 'flash');
      const el = (now() - en.t0) / 1000;
      const i = Math.min(en.buckets.length - 1, Math.floor(el));
      en.buckets[i]++; en.count++;
      $('enBig').textContent = en.count;
    } else if(en.state === 'done'){
      enReset();
    }
  });

  function enTick(){
    const el = (now() - en.t0) / 1000;
    if(el >= en.dur){ enFinish(); return; }
    $('enTime').textContent = '残り ' + Math.ceil(en.dur - el) + ' 秒';
    const i = Math.floor(el);
    const cur = i > 0 ? en.buckets[i-1] : en.buckets[0];
    $('enMid').textContent = '現在速度 ' + cur + ' 打/秒';
    en.raf = requestAnimationFrame(enTick);
  }
  function enFinish(){
    en.state = 'done';
    $('enZone').classList.remove('running');
    $('enTime').textContent = '終了！';
    $('enBig').textContent = '終了！';
    $('enMid').textContent = '合計 ' + en.count + ' 打。ゾーンタップでもう一回';
    const b = en.buckets;
    const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
    const first = avg(b.slice(0, 5)), last = avg(b.slice(-5));
    const keep = first > 0 ? Math.round(last / first * 100) : 0;
    $('enFirst').textContent = first.toFixed(1);
    $('enLast').textContent = last.toFixed(1);
    $('enKeep').textContent = keep + '%';
    const isBest = updBest('en' + en.dur, en.count);
    addRun('endu', { dur: en.dur, total: en.count, keep: keep });
    let msg;
    if(keep >= 90) msg = '素晴らしいスタミナ！速度がほぼ落ちていません。';
    else if(keep >= 75) msg = '標準的な落ち方です。終盤に力が入っていないか意識してみて。';
    else msg = '終盤に大きく失速。序盤に飛ばしすぎ or 力みすぎの可能性大。8割の速度で一定を目指しましょう。';
    $('enMsg').textContent = msg + (isBest ? ' 🏆 総打数の自己ベスト！' : '');
    $('enResult').hidden = false;
    lineChart($('enChart'), $('enTip'), b, b.map((_, i) => (i + 1) + 's'),
      (i, v) => (i + 1) + '秒目: ' + v + ' 打/秒');
    $('enResult').scrollIntoView({ behavior:'smooth', block:'nearest' });
  }
  function enReset(){
    cancelAnimationFrame(en.raf);
    if(en.cancel) en.cancel();
    en.state = 'idle'; en.count = 0; en.buckets = [];
    $('enZone').classList.remove('running');
    $('enBig').innerHTML = 'タップで<br>スタート';
    $('enMid').textContent = 'ペース配分が鍵。8割の力で一定に';
    $('enTime').textContent = '';
    $('enResult').hidden = true;
  }

  // =========================================================
  // 記録タブ
  // =========================================================
  const MODENAME = { speed:'速度計測', alt:'交互連打', bpm:'BPM追従', endu:'持久力' };
  function runLabel(r){
    if(r.m === 'speed') return r.tps.toFixed(1) + ' 打/秒（' + r.dur + '秒）';
    if(r.m === 'alt') return '交互率' + r.rate + '% / ' + r.tps.toFixed(1) + ' 打/秒';
    if(r.m === 'bpm') return 'BPM' + r.bpm + ' PERFECT率' + r.acc + '%';
    if(r.m === 'endu') return r.total + '打 / 維持率' + r.keep + '%（' + r.dur + '秒）';
    return '';
  }
  function renderRecords(){
    let bestSp = null, bestSpDur = null;
    [3, 5, 10].forEach(d => {
      const v = DB.bests['sp' + d];
      if(v != null && (bestSp == null || v > bestSp)){ bestSp = v; bestSpDur = d; }
    });
    $('rcSpeed').textContent = bestSp != null ? bestSp.toFixed(1) : '–';
    $('rcSpeedK').textContent = bestSp != null ? '速度ベスト(打/秒・' + bestSpDur + '秒)' : '速度ベスト(打/秒)';
    $('rcAlt').textContent = DB.bests['altRate'] != null ? DB.bests['altRate'] + '%' : '–';
    let bestEn = null, bestEnDur = null;
    [30, 60, 5].forEach(d => {
      const v = DB.bests['en' + d];
      if(v != null && (bestEn == null || v > bestEn)){ bestEn = v; bestEnDur = d; }
    });
    $('rcEndu').textContent = bestEn != null ? bestEn : '–';
    $('rcEnduK').textContent = bestEn != null ? '持久ベスト(総打数・' + bestEnDur + '秒)' : '持久ベスト(総打数)';
    const lastBpm = DB.runs.filter(r => r.m === 'bpm').slice(-1)[0];
    $('rcBpm').textContent = lastBpm ? lastBpm.acc + '%' : '–';

    const spRuns = DB.runs.filter(r => r.m === 'speed').slice(-30);
    if(spRuns.length >= 2){
      $('rcChartCard').hidden = false;
      lineChart($('rcChart'), $('rcTip'),
        spRuns.map(r => r.tps),
        spRuns.map((r, i) => i + 1),
        (i, v) => fmtDate(spRuns[i].t) + '： ' + v + ' 打/秒（' + spRuns[i].dur + '秒）');
    } else {
      $('rcChartCard').hidden = true;
    }

    const hist = DB.runs.slice(-12).reverse();
    if(hist.length){
      $('rcHistory').innerHTML = hist.map(r =>
        '<div class="hrow"><span><span class="hmode">' + MODENAME[r.m] + '</span>　' + runLabel(r) +
        '</span><span class="hdate">' + fmtDate(r.t) + '</span></div>').join('');
    } else {
      $('rcHistory').innerHTML = '<div class="empty">まだ記録がありません。各モードで計測すると自動で保存されます。</div>';
    }
  }
  $('rcClear').addEventListener('click', () => {
    if(confirm('自己ベストと履歴をすべて削除します。よろしいですか？')){
      DB = { bests:{}, runs:[], settings:{} };
      save(); renderRecords(); spShowBest();
    }
  });

  // ================= misc =================
  document.addEventListener('contextmenu', e => {
    if(e.target.closest('.tapzone, .halfzone, .lane')) e.preventDefault();
  });
  document.addEventListener('dblclick', e => {
    if(e.target.closest('.tapzone, .halfzone, .lane')) e.preventDefault();
  });
  if('serviceWorker' in navigator && location.protocol === 'https:'){
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
