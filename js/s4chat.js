/* ═══════════════════════════════════════════════════════════════════
   SWITCH4 — SIA (Switch4 Intelligence Assistant)
   Public chatbot: job search, interview coaching, resume review,
   lead capture, schedule calls.

   ── DEPLOYMENT ────────────────────────────────────────────────────
   1. Set BACKEND_URL below to your Render.com backend URL.
   2. Upload this file to your web server at /js/s4chat.js
   3. All 6 HTML pages load it via:
        <script src="/js/s4chat.js"></script>

   ── SECURITY ──────────────────────────────────────────────────────
   ✓ Zero API keys in this file — all AI/JobDiva calls via backend
   ✓ XSS-safe: esc() on all dynamic DOM content
   ✓ Client-side rate limiting (server enforces too)
   ✓ GDPR consent-gated data collection
   ✓ "Delete my data" clears localStorage + prompts ATS removal
   ═══════════════════════════════════════════════════════════════ */

'use strict';
/* ═══════════════════════════════════════════════════════════════════
   SWITCH4 CHATBOT v3 — SECURE + SMART INTERVIEW ENGINE
   Security: zero API keys, esc() on all dynamic content,
             rate limiting, consent-gated data, input length caps
═══════════════════════════════════════════════════════════════════ */
const S4Chat = (() => {

/* ── BACKEND CONFIGURATION ──────────────────────────────────────
   Update BACKEND_URL to your Render.com deployment URL.
   Leave empty string '' to use relative URLs (same-origin).
────────────────────────────────────────────────────────────── */
/* ── BACKEND URL ──────────────────────────────────────────────────────
   LOCAL DEV:   'http://localhost:3001'
   PRODUCTION:  'https://switch4-sia-api.onrender.com'
   
   ⚠ Change this to the Render URL before uploading to Hostinger.
──────────────────────────────────────────────────────────────── */
const BACKEND_URL = 'https://switch4-sia-api.onrender.com';

const API = {
  chat:       `${BACKEND_URL}/api/chat`,
  upload:     `${BACKEND_URL}/api/upload-resume`,
  notify:     `${BACKEND_URL}/api/notify`,
  contact:    `${BACKEND_URL}/api/contact`,
  schedule:   `${BACKEND_URL}/api/schedule-call`,
  jobSearch:  `${BACKEND_URL}/api/jobdiva/search`,
  createCand: `${BACKEND_URL}/api/jobdiva/candidate`,
  createApp:  `${BACKEND_URL}/api/jobdiva/apply`,
};

/* ── XSS SAFETY ─────────────────────────────────────────────── */
function esc(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#x27;').slice(0, 8000);
}
function clean(s, max=2000) {
  if (typeof s !== 'string') return '';
  return s.replace(/<[^>]*>/g,'').replace(/[<>'"&]/g,'').trim().slice(0,max);
}
function isEmail(e){ return typeof e==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)&&e.length<320; }
function isPhone(p){ return !p||/^[+\d\s\-(). ]{7,30}$/.test(p); }

/* ── RATE LIMITER (advisory — server enforces) ──────────────── */
const RL={ts:0,n:0};
function rateOk(){
  const now=Date.now();
  if(now-RL.ts>60000){RL.ts=now;RL.n=0;}
  return ++RL.n<=30;
}

/* ── SAFE MARKDOWN → HTML ───────────────────────────────────── */
function md(t){
  if(typeof t!=='string')return'';
  // Process block elements first
  t=t.replace(/^#{3}\s+(.+)$/gm,'<strong style="font-size:.85rem;color:#0F2340">$1</strong>')
    .replace(/^#{2}\s+(.+)$/gm,'<strong style="font-size:.88rem;color:#0F2340;display:block;margin:.4rem 0 .2rem">$1</strong>')
    .replace(/^#{1}\s+(.+)$/gm,'<strong style="font-size:.92rem;color:#0F2340;display:block;margin:.4rem 0 .2rem">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^>\s+(.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^[-*]\s+(.+)$/gm,'<li>$1</li>')
    .replace(/^\d+\.\s+(.+)$/gm,'<li>$1</li>')
    .replace(/(<li>[\s\S]+?<\/li>)/g,'<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g,'')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>');
  return t;
}

/* ── STATE ──────────────────────────────────────────────────── */
let S={
  open:false, consent:false,
  history:[],          // full conversation [{role,content}]
  candidate:{},        // captured lead
  resumeId:null,
  typing:false,
  scheduledSlot:null,
  targetJob:null,

  // ── INTERVIEW ENGINE STATE ──
  iv:{
    active:false,       // in interview mode?
    phase:'discovery',  // discovery | questions | feedback | summary
    role:'',            // job title
    company:'',         // target company
    level:'',           // exp level
    focus:[],           // areas to focus on
    questions:[],       // generated question list
    qIdx:0,             // current question index
    answers:[],         // [{question,answer,feedback}]
    totalQ:10,          // target number of questions
    scores:{},          // per-dimension scores
  },
};

/* ── STORAGE ────────────────────────────────────────────────── */
function saveH(){ try{localStorage.setItem('s4h',JSON.stringify(S.history.slice(-40)));}catch(e){} }
function loadH(){ try{const h=localStorage.getItem('s4h');if(h)S.history=JSON.parse(h);}catch(e){} }
function saveC(v){ try{localStorage.setItem('s4c',v);}catch(e){} }
function loadC(){ try{return localStorage.getItem('s4c');}catch(e){return null;} }

/* ── DOM ────────────────────────────────────────────────────── */
const $=id=>document.getElementById(id);
const msgs=()=>$('s4cw-msgs');

function scrollDown(){ setTimeout(()=>{const m=msgs();if(m)m.scrollTop=m.scrollHeight;},60); }
function now(){ const d=new Date();return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); }

function addMsg(role,safeHtml){
  const isUser=role==='user';
  const div=document.createElement('div');
  div.className=`s4m ${isUser?'s4u':'s4bot'}`;
  // Wrapper: bot aligns left, user aligns right so bubble hugs right side
  const wrapStyle=isUser
    ?'min-width:0;flex:1;display:flex;flex-direction:column;align-items:flex-end'
    :'min-width:0;flex:1;display:flex;flex-direction:column;align-items:flex-start';
  div.innerHTML=`
    ${!isUser?`<div class="s4mav" style="background:linear-gradient(135deg,#1BA8B8,#2E9B5F);color:#fff;font-weight:800;font-size:10px;letter-spacing:-.5px;flex-shrink:0">S4</div>`:''}
    <div style="${wrapStyle}">
      <div class="s4bbl">${safeHtml}</div>
      <div class="s4ts">${now()}</div>
    </div>
    ${isUser?`<div class="s4mav s4uav" style="background:linear-gradient(135deg,#0F2340,#1BA8B8);color:#fff;font-weight:800;font-size:10px;letter-spacing:-.5px;flex-shrink:0">You</div>`:''}`;
  msgs().appendChild(div);scrollDown();
  return div;
}
function botMsg(html){ return addMsg('assistant',html); }
function userMsg(text){ addMsg('user',esc(text)); }

function showTyping(){
  const d=document.createElement('div');
  d.className='s4m s4bot s4ty';d.id='s4ty';
  d.innerHTML='<div class="s4mav" style="background:linear-gradient(135deg,#1BA8B8,#2E9B5F);color:#fff;font-weight:800;font-size:10px;letter-spacing:-.5px;flex-shrink:0">S4</div><div style="min-width:0;flex:1;display:flex;flex-direction:column;align-items:flex-start"><div class="s4bbl"><div class="s4tdots"><span></span><span></span><span></span></div></div></div>';
  msgs().appendChild(d);scrollDown();S.typing=true;
}
function hideTyping(){ $('s4ty')?.remove();S.typing=false; }

function setQR(items){
  const qr=$('s4cw-qr');qr.innerHTML='';
  items.forEach(t=>{
    const b=document.createElement('button');
    b.className='s4qrb';b.textContent=t;
    b.onclick=()=>{qr.innerHTML='';handleInput(t);};
    qr.appendChild(b);
  });
}
function clearQR(){ $('s4cw-qr').innerHTML=''; }

/* ── INTERVIEW MODE INDICATOR ───────────────────────────────── */
function setMode(label,text,progress){
  const bar=$('s4cw-mode'),fill=$('s4cw-progress-fill'),prog=$('s4cw-progress');
  if(!label){bar.classList.remove('active');prog.style.display='none';return;}
  $('s4cw-mode-badge').textContent=label;
  $('s4cw-mode-text').textContent=text;
  bar.classList.add('active');
  if(progress!=null){prog.style.display='block';fill.style.width=progress+'%';}
  else{prog.style.display='none';}
}

/* ── TOGGLE ─────────────────────────────────────────────────── */
function toggle(){
  S.open=!S.open;
  const w=$('s4cw-w');
  if(S.open){
    w.classList.remove('s4h');
    $('s4cw-n').style.display='none';
    const saved=loadC();
    if(saved==='accepted'){
      S.consent=true;
      $('s4cw-consent').style.display='none';
      if(S.history.length===0){loadH();if(S.history.length===0)setTimeout(welcome,600);else renderHistory();}
    } else if(saved==='declined'){
      $('s4cw-consent').innerHTML='<p style="font-size:.74rem;color:#6b7280;padding:.25rem 0">You declined data collection. You can still <a href="contact.html" style="color:#1BA8B8">contact us directly</a>.</p>';
    }
    setTimeout(()=>$('s4cw-ta')?.focus(),300);
  }else{w.classList.add('s4h');}
}

function renderHistory(){
  msgs().innerHTML='';
  S.history.forEach(m=>{
    if(m.role==='user')userMsg(m.content);
    else botMsg(md(m.content));
  });
  scrollDown();
}

/* ── CONSENT ────────────────────────────────────────────────── */
function acceptConsent(){
  S.consent=true;saveC('accepted');
  $('s4cw-consent').style.display='none';
  setTimeout(welcome,500);
}
function declineConsent(){
  saveC('declined');
  $('s4cw-consent').innerHTML='<p style="font-size:.74rem;color:#6b7280;padding:.25rem 0">Understood. <a href="contact.html" style="color:#1BA8B8">Contact us directly</a> anytime.</p>';
}

/* ── WELCOME ────────────────────────────────────────────────── */
function welcome(){
  botMsg(`Hi there! 👋 I'm <strong>Sia</strong>, Switch4's AI Recruitment Coach.<br><br>
I'm here to help you with:<br>
<strong>🔍 Job Search</strong> — browse & apply to open positions<br>
<strong>📄 Resume Review</strong> — upload for instant feedback &amp; matching<br>
<strong>🎤 Interview Coaching</strong> — full mock interviews with real-time feedback<br>
<strong>💰 Salary Negotiation</strong> — practice getting what you're worth<br>
<strong>🏢 Hiring Support</strong> — if you're an employer looking to build your team<br><br>
What would you like to focus on today?`);
  setQR(['🎤 Run a mock interview','🔍 Search open jobs','📄 Upload my resume','💰 Salary negotiation help','🏢 I want to hire talent']);
}

/* ── SEND ───────────────────────────────────────────────────── */
function send(){
  const ta=$('s4cw-ta');
  const text=clean(ta.value,1500);
  if(!text||S.typing)return;
  ta.value='';ta.style.height='auto';
  handleInput(text);
}

/* ══════════════════════════════════════════════════════════════
   MAIN ROUTER
══════════════════════════════════════════════════════════════ */
async function handleInput(raw){
  clearQR();
  const text=clean(raw,1500);
  if(!text)return;
  if(!rateOk()){botMsg('You\'re sending messages quickly. Please wait a moment. ⏳');return;}

  userMsg(text);
  S.history.push({role:'user',content:text});
  saveH();

  const lo=text.toLowerCase();

  // ── Interview mode: route to engine ────────────────────────
  if(S.iv.active){
    await interviewEngine(text);
    return;
  }

  // ── Intent detection ────────────────────────────────────────
  if(lo.includes('delete')&&(lo.includes('data')||lo.includes('info')||lo.includes('profile'))){
    showDeleteCard();return;
  }

  // Interview triggers
  const ivTriggers=['mock interview','interview prep','prepare for interview','practice interview',
    'interview coaching','interview help','practice my interview','interview training',
    'help me prepare','prepare for my','get ready for interview'];
  if(ivTriggers.some(t=>lo.includes(t))||
     (lo.includes('interview')&&(lo.includes('prep')||lo.includes('practice')||lo.includes('help')||lo.includes('ready')||lo.includes('coach')))){
    startInterviewDiscovery();return;
  }

  // Salary negotiation
  if(lo.includes('salary')&&(lo.includes('negot')||lo.includes('practice')||lo.includes('how much')||lo.includes('counter'))){
    await salaryNegotiationSession(text);return;
  }

  // "Tell me about yourself"
  if(lo.includes('tell me about yourself')||lo.includes('about yourself script')||lo.includes('elevator pitch')){
    await buildElevatorPitch();return;
  }

  // Tough questions (gaps, job changes)
  if((lo.includes('gap')||lo.includes('fired')||lo.includes('laid off')||lo.includes('job change')||lo.includes('left my'))&&
     (lo.includes('explain')||lo.includes('how do i')||lo.includes('what do i say')||lo.includes('address'))){
    await toughQuestionCoach(text);return;
  }

  // Upload / Resume
  if(lo.includes('upload')||lo.includes('resume')||lo.includes(' cv ')||lo.includes('my cv')){
    showTyping();await sleep(500);hideTyping();
    botMsg('Sure! Please upload your resume and I\'ll give you detailed feedback, optimization suggestions, and match it to our current openings.');
    showUploadArea();return;
  }

  // Schedule
  if(lo.includes('schedule')||lo.includes('book a call')||lo.includes('talk to')||(lo.includes('call')&&lo.includes('recruiter'))){
    showTyping();await sleep(600);hideTyping();
    botMsg('I\'d love to connect you with one of our senior recruiters! Here are available time slots:');
    showScheduleCard();return;
  }

  // Job search
  if(lo.includes('job')||lo.includes('open position')||lo.includes('opening')||lo.includes('role')||lo.includes('browse')||lo.includes('search for')){
    await handleJobSearch(text);return;
  }

  // Apply
  if(lo.includes('apply')||lo.includes('interested in applying')||lo.includes('submit my profile')){
    showTyping();await sleep(500);hideTyping();
    botMsg('I\'d be happy to get you connected with the right recruiter! Let me collect a few quick details:');
    showLeadForm();return;
  }

  // Default → LLM
  await askLLM(text,'general');
}

/* ══════════════════════════════════════════════════════════════
   LLM CALL — via secure /api/chat backend (Sia)
══════════════════════════════════════════════════════════════ */
async function callBackend(messages, mode, systemOverride){
  const res = await fetch(API.chat, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.slice(-20),
      mode: mode || 'general',
      sessionId: S.sessionId || null,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Server ${res.status}`);
  const data = await res.json();
  return data.reply || '';
}

async function askLLM(userText, mode='general', systemOverride=''){
  showTyping();
  $('s4cw-send').disabled=true;
  let reply='';
  try{
    reply = await callBackend(S.history.slice(-20), mode, systemOverride);
  }catch(err){
    if(err.name==='TimeoutError')reply='That took a bit long — please try again. You can also call us at **+1-302-208-5058** or email **info@switch4.co**.';
    else reply='I\'m having a connectivity issue right now. Please try again, or reach us at **info@switch4.co**.';
    console.error('Sia error:',err.message);
  }
  hideTyping();
  $('s4cw-send').disabled=false;
  S.history.push({role:'assistant',content:reply});
  saveH();
  botMsg(md(reply));
  if(mode==='general') suggestFollowUps(reply);
}

/* ══════════════════════════════════════════════════════════════
   INTERVIEW COACHING ENGINE
══════════════════════════════════════════════════════════════ */

/* Phase 1: Discovery ───────────────────────────────────────── */
function startInterviewDiscovery(){
  S.iv={...S.iv,active:true,phase:'discovery',qIdx:0,questions:[],answers:[],scores:{}};
  setMode('INTERVIEW PREP','Setting up your coaching session',null);

  botMsg(`🎤 <strong>Let's set up your personalized mock interview!</strong><br><br>
I'll create a realistic interview tailored specifically to your role, experience level, and focus areas — then give you detailed coaching feedback after each answer.<br><br>
To start: <strong>What role or job title are you interviewing for?</strong><br>
<em>(e.g. Registered Nurse – ICU, Software Engineer, VP of Finance, Healthcare Operations Manager)</em>`);
  S.iv.phase='get_role';
}

/* Phase 2: Gather role, company, level, focus ─────────────── */
async function interviewEngine(text){
  const iv=S.iv;
  const lo=text.toLowerCase();

  // Cancel interview
  if(lo==='cancel'||lo==='exit'||lo==='stop'||lo==='quit'||(lo.includes('stop')&&lo.includes('interview'))){
    endInterview(false);return;
  }

  switch(iv.phase){
    case'get_role':
      iv.role=clean(text,200);
      iv.phase='get_company';
      botMsg(`<strong>Excellent!</strong> Preparing for a <strong>${esc(iv.role)}</strong> position.<br><br>
Which company or type of organization are you interviewing with? <em>(e.g. Memorial Hospital, Amazon, a mid-size fintech startup — or just say "not sure")</em>`);
      break;

    case'get_company':
      iv.company=clean(text,200);
      iv.phase='get_level';
      botMsg(`Got it — interviewing at <strong>${esc(iv.company)}</strong>.<br><br>
<strong>What's your experience level?</strong><br>
<em>Entry level (0–2 yrs) / Mid-level (3–5 yrs) / Senior (6–10 yrs) / Leadership / Career changer</em>`);
      break;

    case'get_level':
      iv.level=clean(text,100);
      iv.phase='get_focus';
      botMsg(`<strong>${esc(iv.level)}</strong> — noted!<br><br>
<strong>What areas would you like to focus on most?</strong> <em>(Select all that apply, or say "all")</em><br><br>
🧠 Behavioral questions (STAR method)<br>
💡 Technical / clinical questions<br>
👥 Leadership &amp; team management<br>
😬 Difficult questions (gaps, terminations, salary)<br>
🏥 Role-specific scenarios<br>
💰 Salary &amp; offer negotiation`);
      setQR(['All of the above','Behavioral questions','Technical questions','Difficult questions','Role-specific scenarios']);
      break;

    case'get_focus':
      clearQR();
      iv.focus=clean(text,300);
      iv.phase='generating';
      await generateInterviewQuestions();
      break;

    case'questioning':
      await processInterviewAnswer(text);
      break;

    case'summary':
      // User responding after summary — back to general chat
      iv.active=false;setMode(null);
      await askLLM(text,'general');
      break;
  }
}

/* Generate tailored question list via LLM ──────────────────── */
async function generateInterviewQuestions(){
  const iv=S.iv;
  showTyping();

  const systemPrompt=`You are an expert interview coach with 20 years of experience. Generate a precise list of ${iv.totalQ} interview questions for the role described. Return ONLY a JSON array of objects, no other text. Each object: {"q":"question text","type":"behavioral|technical|situational|roleplay","dimension":"communication|leadership|clinical|problem-solving|adaptability|culture|motivation|technical|salary"}`;

  const userPrompt=`Role: ${iv.role}
Company/Org: ${iv.company}
Candidate level: ${iv.level}
Focus areas: ${iv.focus}

Generate ${iv.totalQ} progressive interview questions. Mix behavioral (STAR-format), technical/clinical, situational, and difficult questions. For healthcare roles, include clinical scenario questions. Make them realistic and appropriately challenging for the level specified. Return ONLY the JSON array.`;

  try{
    const raw=await callBackend([{role:'user',content:userPrompt}],'interview_generate',systemPrompt);
    const responseText=raw||'';
    const jsonMatch=responseText.match(/\[[\s\S]+\]/);
    if(jsonMatch){
      try{
        iv.questions=JSON.parse(jsonMatch[0]).slice(0,iv.totalQ);
      }catch(e){iv.questions=getFallbackQuestions(iv.role);}
    }else{iv.questions=getFallbackQuestions(iv.role);}
  }catch(e){
    iv.questions=getFallbackQuestions(iv.role);
  }

  hideTyping();
  iv.phase='questioning';
  iv.qIdx=0;

  const isHealthcare=/nurs|rn|bsn|lpn|cna|healthcare|clinical|patient|medical|hospital|allied|therapist|physician|doctor/i.test(iv.role);

  botMsg(`✅ <strong>Your personalized interview is ready!</strong><br><br>
I've prepared <strong>${iv.questions.length} questions</strong> tailored for a <strong>${esc(iv.role)}</strong> role at <strong>${esc(iv.company)}</strong>.<br><br>
📋 <strong>How this works:</strong><br>
• I'll ask each question one at a time<br>
• Answer as you would in a real interview<br>
• I'll give you <strong>detailed feedback</strong> after each answer<br>
• You can ask me for tips, sample answers, or to rephrase at any time<br>
• At the end, you'll get a <strong>comprehensive coaching summary</strong><br><br>
${isHealthcare?'🏥 I\'ve included clinical scenarios relevant to your healthcare role.<br><br>':''}<strong>Ready? Let's begin!</strong> <em>(Type "skip" to move on, "hint" for guidance, "sample" for a strong example answer)</em>`);

  await sleep(800);
  askNextQuestion();
}

/* Ask the next question ────────────────────────────────────── */
function askNextQuestion(){
  const iv=S.iv;
  if(iv.qIdx>=iv.questions.length){
    compileSummary();return;
  }
  const q=iv.questions[iv.qIdx];
  const pct=Math.round((iv.qIdx/iv.questions.length)*100);
  setMode('INTERVIEW','Question '+(iv.qIdx+1)+' of '+iv.questions.length,pct);

  const typeLabels={behavioral:'🧠 Behavioral',technical:'💡 Technical',situational:'🎯 Situational',roleplay:'🎭 Scenario'};
  const typeLabel=typeLabels[q.type]||'❓ Question';

  botMsg(`<strong>${typeLabel} — Question ${iv.qIdx+1}/${iv.questions.length}</strong><br><br><em>"${esc(q.q)}"</em>`);
  setQR(['💡 Give me a hint','📝 Show me a strong answer','⏩ Skip this question']);
}

/* Process a candidate answer ───────────────────────────────── */
async function processInterviewAnswer(text){
  const iv=S.iv;
  clearQR();
  const lo=text.toLowerCase();

  // Special commands
  if(lo==='hint'||lo==='give me a hint'||lo==='💡 give me a hint'){
    await giveHint();return;
  }
  if(lo==='sample'||lo==='show me a strong answer'||lo==='📝 show me a strong answer'){
    await showSampleAnswer();return;
  }
  if(lo==='skip'||lo==='skip this question'||lo==='⏩ skip this question'){
    botMsg('⏩ No problem — let\'s move to the next question.');
    iv.qIdx++;await sleep(400);askNextQuestion();return;
  }

  // Too short — prompt for more
  if(text.trim().split(/\s+/).length<10){
    botMsg(`Your answer is quite brief. In a real interview, you'd want to elaborate more. Try to give a <strong>structured, detailed response</strong> — aim for 2–4 minutes when speaking.<br><br>Can you expand on that? Or type <em>"hint"</em> for guidance on how to structure your answer.`);
    return;
  }

  // Send answer to LLM for feedback
  const q=iv.questions[iv.qIdx];
  showTyping();

  const feedbackPrompt=`You are an expert interview coach. The candidate is interviewing for: ${iv.role} at ${iv.company} (${iv.level} level).

Question asked: "${q.q}"
Question type: ${q.type}
Candidate's answer: "${text}"

Give detailed, constructive coaching feedback. Be specific and actionable. Format your response EXACTLY as JSON:
{
  "score": <number 1-10>,
  "dimension": "${q.dimension||'communication'}",
  "strengths": ["specific strength 1", "specific strength 2"],
  "improvements": ["specific improvement 1", "specific improvement 2"],
  "betterPhrasing": "A stronger version of their answer, showing ideal structure and content",
  "tip": "One memorable coaching tip they can apply immediately",
  "encouragement": "Brief warm encouragement (1 sentence)"
}`;

  let feedback=null;
  try{
    const raw=await callBackend([{role:'user',content:feedbackPrompt}],'interview_feedback');
    const jsonMatch=(raw||'').match(/\{[\s\S]+\}/);
    if(jsonMatch)feedback=JSON.parse(jsonMatch[0]);
  }catch(e){ feedback=null; }

  hideTyping();

  // Store answer + feedback
  iv.answers.push({question:q.q,type:q.type,answer:text,feedback,score:feedback?.score||6});
  if(feedback?.dimension)iv.scores[feedback.dimension]=(iv.scores[feedback.dimension]||[]).concat(feedback.score||6);

  // Render feedback card
  if(feedback){
    renderFeedbackCard(feedback,iv.qIdx+1);
  }else{
    botMsg(`✅ <strong>Answer recorded!</strong> Let's keep the momentum going.`);
  }

  iv.qIdx++;
  await sleep(1200);

  if(iv.qIdx>=iv.questions.length){
    botMsg('🎉 <strong>That was the last question!</strong> Excellent work making it through the full interview. Let me compile your comprehensive coaching report now…');
    await sleep(1000);
    compileSummary();
  }else{
    setQR(['Next question ➡️','Ask for feedback details','Repeat this question']);
    const nextBtn=document.querySelector('.s4qrb');
    if(nextBtn)nextBtn.onclick=()=>{clearQR();askNextQuestion();};
    // Also handle "next question" as text
    const repeatBtn=document.querySelectorAll('.s4qrb')[2];
    if(repeatBtn)repeatBtn.onclick=()=>{clearQR();iv.qIdx--;askNextQuestion();};
    const detailBtn=document.querySelectorAll('.s4qrb')[1];
    if(detailBtn)detailBtn.onclick=()=>{clearQR();askFeedbackDetail();};
  }
}

/* Render a feedback card in the chat ───────────────────────── */
function renderFeedbackCard(fb,qNum){
  const score=fb.score||6;
  const scoreColor=score>=8?'#16a34a':score>=6?'#d97706':'#dc2626';

  const div=document.createElement('div');
  div.className='s4m s4bot';
  div.innerHTML=`
    <div class="s4mav" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;font-weight:700;font-size:10px">S4</div>
    <div style="flex:1;min-width:0">
      <div class="s4fb-card">
        <div class="s4fb-head">
          <span>Coaching Feedback — Q${qNum}</span>
          <span style="margin-left:auto;font-size:1rem;font-weight:700;color:${scoreColor}">${score}/10</span>
        </div>
        ${fb.strengths?.length?`<div class="s4fb-good">✅ <strong>What worked:</strong><br>${fb.strengths.map(s=>`• ${esc(s)}`).join('<br>')}</div>`:''}
        ${fb.improvements?.length?`<div class="s4fb-improve">💡 <strong>Improve this:</strong><br>${fb.improvements.map(i=>`• ${esc(i)}`).join('<br>')}</div>`:''}
        ${fb.betterPhrasing?`<div class="s4fb-tip"><strong>Stronger phrasing:</strong> "${esc(fb.betterPhrasing.slice(0,300))}${fb.betterPhrasing.length>300?'…':''}"</div>`:''}
        ${fb.encouragement?`<div style="margin-top:.5rem;font-size:.74rem;color:#64748b;font-style:italic">${esc(fb.encouragement)}</div>`:''}
      </div>
    </div>`;
  msgs().appendChild(div);scrollDown();
  addMsg('assistant',`<strong>💡 Tip:</strong> ${esc(fb.tip||'Keep practicing — each answer gets stronger!')}`);
}

/* Give a hint for the current question ─────────────────────── */
async function giveHint(){
  const q=S.iv.questions[S.iv.qIdx];
  showTyping();
  const hintPrompt=`You are an interview coach. Give a brief, practical hint for how to approach this interview question: "${q.q}". Include the recommended structure (e.g. STAR method if behavioral) and 2-3 key points to cover. Be concise but genuinely helpful — 3-5 sentences max.`;
  try{
    const raw=await callBackend([{role:'user',content:hintPrompt}],'interview_hint');
    hideTyping();
    botMsg(`💡 <strong>Hint for this question:</strong><br><br>${md(raw||'Use the STAR method: Situation, Task, Action, Result. Be specific and quantify your impact where possible.')}`);
  }catch(e){
    hideTyping();
    botMsg('💡 <strong>Hint:</strong> Use the <strong>STAR method</strong> — describe the Situation, your Task, the Action you took, and the Result. Be specific and quantify your impact where possible.');
  }
  setQR(['Ready to answer now','Show me a sample answer']);
}

/* Show a sample strong answer ──────────────────────────────── */
async function showSampleAnswer(){
  const q=S.iv.questions[S.iv.qIdx];
  showTyping();
  const samplePrompt=`You are an expert interview coach. Write a strong, realistic sample answer for this interview question for a candidate applying for ${S.iv.role} at ${S.iv.company} (${S.iv.level} level).

Question: "${q.q}"

Write a genuinely excellent answer that:
- Uses appropriate structure (STAR for behavioral, logical for technical/situational)
- Is specific and concrete with realistic details
- Demonstrates the right competencies for the role and level
- Would impress an interviewer
- Is 150-250 words when spoken

Format clearly with the answer text. Then add one line: "Key strengths demonstrated: [list them]"`;

  try{
    const raw=await callBackend([{role:'user',content:samplePrompt}],'interview_sample');
    hideTyping();
    botMsg(`📝 <strong>Sample Strong Answer:</strong><br><br>${md(raw||'')}<br><br><em>Now try your own version — use this as inspiration, not a script!</em>`);
  }catch(e){
    hideTyping();
    botMsg('Let me give you guidance instead: Use the STAR method with a specific real example. Start with context (where/when), your specific role (Task), exactly what you did (Action — use "I" not "we"), and the measurable result.');
  }
  setQR(['Ready to answer','Next question ➡️']);
}

/* Ask for feedback detail ──────────────────────────────────── */
async function askFeedbackDetail(){
  const lastAnswer=S.iv.answers[S.iv.answers.length-1];
  if(!lastAnswer){askNextQuestion();return;}
  showTyping();
  const detailPrompt=`The candidate for ${S.iv.role} answered this interview question:
Q: "${lastAnswer.question}"
A: "${lastAnswer.answer}"

Give them deeper, more detailed coaching on how to significantly improve this answer. Be like a experienced coach — frank, specific, and genuinely useful. Include: what a great answer looks like, common mistakes to avoid, and an improved version.`;

  try{
    const res=await fetch(API.chat,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:detailPrompt}],mode:'interview_detail',maxTokens:600}),signal:AbortSignal.timeout(20000)});
    const data=await res.json();
    hideTyping();
    botMsg(md(data.reply||''));
  }catch(e){hideTyping();botMsg('Let\'s move to the next question and keep building momentum!');}
  setQR(['Next question ➡️']);
  document.querySelector('.s4qrb')&&(document.querySelector('.s4qrb').onclick=()=>{clearQR();askNextQuestion();});
}

/* Compile end-of-interview summary ─────────────────────────── */
async function compileSummary(){
  const iv=S.iv;
  setMode('INTERVIEW SUMMARY','Compiling your coaching report',100);
  showTyping();

  // Calculate scores
  const allScores=iv.answers.map(a=>a.score||6);
  const avgScore=allScores.length?Math.round(allScores.reduce((a,b)=>a+b,0)/allScores.length*10)/10:6;

  // Dimension scores
  const dimAvgs={};
  Object.entries(iv.scores).forEach(([dim,scores])=>{
    dimAvgs[dim]=Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10;
  });

  const summaryPrompt=`You are a senior interview coach. Write a comprehensive coaching summary report for this interview session.

Role: ${iv.role} at ${iv.company}
Level: ${iv.level}
Focus areas: ${iv.focus}
Questions answered: ${iv.answers.length}
Average score: ${avgScore}/10

Answer summary:
${iv.answers.map((a,i)=>`Q${i+1} (${a.type}): "${a.question.slice(0,80)}..." — Score: ${a.score}/10
Strengths: ${a.feedback?.strengths?.join(', ')||'N/A'}
Improvements: ${a.feedback?.improvements?.join(', ')||'N/A'}`).join('\n')}

Write a professional, encouraging, and genuinely useful coaching report. Include:
1. Overall performance summary (2-3 sentences, warm but honest)
2. Top 3 genuine strengths demonstrated
3. Top 3 priority areas for improvement (specific and actionable)
4. Personalized 7-day practice plan (concrete daily actions)
5. Final encouragement and next steps

Be like a world-class coach — specific, warm, and transformatively helpful.`;

  let summaryText='';
  try{
    summaryText=await callBackend([{role:'user',content:summaryPrompt}],'interview_summary');
  }catch(e){summaryText=generateFallbackSummary(iv,avgScore);}

  hideTyping();

  // Render score card
  renderScoreCard(avgScore,dimAvgs,iv.answers.length);

  // Render summary
  botMsg(md(summaryText));

  // End interview mode
  setTimeout(()=>{
    setMode(null);
    iv.active=false;
    botMsg(`<strong>Your session is saved!</strong> What would you like to do next?`);
    setQR(['🔁 Run another mock interview','📄 Upload my resume','📅 Book a real recruiter call','🔍 Browse open jobs']);
  },1500);

  S.history.push({role:'assistant',content:summaryText});saveH();
}

/* Render the score card visual ─────────────────────────────── */
function renderScoreCard(avg,dims,total){
  const grade=avg>=9?'Exceptional 🌟':avg>=8?'Strong 💪':avg>=7?'Good 👍':avg>=6?'Developing 📈':'Needs Work 🔧';
  const dimEntries=Object.entries(dims).slice(0,4);

  const div=document.createElement('div');
  div.className='s4m s4bot';
  div.innerHTML=`
    <div class="s4mav" style="background:linear-gradient(135deg,#0ea5e9,#06b6d4);color:#fff;font-weight:700;font-size:10px">S4</div>
    <div style="flex:1;min-width:0">
      <div class="s4score-card">
        <div class="s4score-head">Your Interview Report</div>
        <div class="s4score-num">${avg}<span style="font-size:1rem">/10</span></div>
        <div class="s4score-label">${grade} · ${total} Questions</div>
        ${dimEntries.map(([dim,score])=>`
          <div class="s4score-row">
            <div class="s4score-row-head">${dim.charAt(0).toUpperCase()+dim.slice(1)}</div>
            <div class="s4score-bar"><div class="s4score-fill" style="width:${score*10}%"></div></div>
            <div class="s4score-pct">${score}/10</div>
          </div>`).join('')}
      </div>
    </div>`;
  msgs().appendChild(div);scrollDown();
}

function endInterview(showMsg=true){
  S.iv.active=false;S.iv.phase='discovery';
  setMode(null);
  if(showMsg)botMsg('Interview session ended. Ready when you want to try again! What else can I help you with?');
  setQR(['Start a new interview','Browse jobs','Talk to a recruiter']);
}

/* ── FALLBACK QUESTIONS (when LLM fails) ─────────────────────── */
function getFallbackQuestions(role){
  const isHealthcare=/nurs|rn|bsn|lpn|cna|healthcare|clinical|patient|medical|hospital|therapist/i.test(role);
  const isTech=/engineer|developer|software|it |tech|data|cloud|devops|architect/i.test(role);
  const isLeader=/manager|director|vp |vice president|lead|head of|chief/i.test(role);

  const base=[
    {q:'Tell me about yourself and what draws you to this role.',type:'behavioral',dimension:'motivation'},
    {q:'Describe a significant challenge you faced at work and how you handled it.',type:'behavioral',dimension:'problem-solving'},
    {q:'Give me an example of a time you had to work with a difficult team member or colleague.',type:'behavioral',dimension:'communication'},
    {q:'Tell me about your greatest professional achievement.',type:'behavioral',dimension:'leadership'},
    {q:'How do you prioritize when you have multiple urgent tasks competing for your attention?',type:'situational',dimension:'adaptability'},
    {q:'Why are you leaving your current role, and why is this position the right next step?',type:'behavioral',dimension:'motivation'},
    {q:'Describe a time you made a mistake at work. What happened and what did you learn?',type:'behavioral',dimension:'adaptability'},
    {q:'Where do you see yourself in 3–5 years, and how does this role fit that vision?',type:'behavioral',dimension:'motivation'},
    {q:'Tell me about a time you had to influence someone without having direct authority over them.',type:'behavioral',dimension:'leadership'},
    {q:'What\'s your approach to continuous learning and staying current in your field?',type:'behavioral',dimension:'motivation'},
  ];

  if(isHealthcare){
    base.splice(4,0,
      {q:'Describe a situation where a patient or family member was extremely upset. How did you handle it?',type:'situational',dimension:'clinical'},
      {q:'Walk me through how you ensure safe handoffs and accurate patient documentation.',type:'technical',dimension:'clinical'},
      {q:'Tell me about a time you identified a patient safety issue. What steps did you take?',type:'situational',dimension:'clinical'},
    );
  }else if(isTech){
    base.splice(4,0,
      {q:'Walk me through how you would architect a solution to handle 1 million concurrent users.',type:'technical',dimension:'technical'},
      {q:'Describe your approach to code reviews and maintaining code quality in a team.',type:'technical',dimension:'technical'},
      {q:'Tell me about the most complex technical problem you\'ve solved.',type:'technical',dimension:'problem-solving'},
    );
  }else if(isLeader){
    base.splice(4,0,
      {q:'How do you build high-performing teams? What\'s your approach to hiring and developing talent?',type:'behavioral',dimension:'leadership'},
      {q:'Tell me about a time you had to make a difficult business decision with incomplete information.',type:'situational',dimension:'leadership'},
      {q:'How do you handle an underperforming team member?',type:'behavioral',dimension:'leadership'},
    );
  }

  return base.slice(0,10);
}

function generateFallbackSummary(iv,avg){
  return `## Your Interview Coaching Summary\n\n**Overall Performance: ${avg}/10**\n\nYou completed all ${iv.answers.length} questions — that takes real commitment and is exactly the right approach to interview prep. Each practice session builds the mental muscle memory that makes real interviews feel natural.\n\n**Your Strengths:**\n- You engaged fully with each question\n- You showed willingness to learn and grow\n- Your effort throughout demonstrates genuine motivation\n\n**Priority Improvements:**\n- Structure answers more consistently using STAR (Situation, Task, Action, Result)\n- Add more quantifiable outcomes to your answers ("increased by X%", "reduced time by Y hours")\n- Practice speaking for 2–3 minutes per answer — depth signals expertise\n\n**Your 7-Day Plan:**\nDay 1-2: Record yourself answering 3 questions, watch back critically\nDay 3-4: Prepare 5 STAR stories from your strongest experiences\nDay 5-6: Research ${iv.company} deeply — mission, recent news, culture\nDay 7: Do one more full mock interview with a friend or record yourself\n\nYou're building real interview skills. Book a call with one of our Switch4 recruiters for personalized coaching specific to your target employer.`;
}

/* ══════════════════════════════════════════════════════════════
   SALARY NEGOTIATION COACHING
══════════════════════════════════════════════════════════════ */
async function salaryNegotiationSession(text){
  showTyping();await sleep(500);hideTyping();

  botMsg(`💰 <strong>Salary Negotiation Coaching</strong><br><br>
Smart move — most candidates leave significant money on the table by not negotiating effectively. I'll help you practice.<br><br>
To give you the most useful coaching: <strong>What role are you negotiating for, and do you have a target salary in mind?</strong>`);

  S.history.push({role:'assistant',content:'Salary negotiation coaching started.'});
  setQR(['I have an offer in hand','I\'m in final interview stage','General negotiation tips','Counter-offer strategies']);
}

/* ══════════════════════════════════════════════════════════════
   "TELL ME ABOUT YOURSELF" BUILDER
══════════════════════════════════════════════════════════════ */
async function buildElevatorPitch(){
  showTyping();await sleep(500);hideTyping();
  botMsg(`<strong>"Tell me about yourself" — Let's build yours</strong><br><br>
This is the most important 90 seconds of any interview. A great answer is:<br>
📍 <strong>Present</strong> — your current role and key strength<br>
📍 <strong>Past</strong> — relevant experience that proves your value<br>
📍 <strong>Future</strong> — why you want this specific role<br><br>
<strong>Tell me about your current (or most recent) role and what you do there.</strong> I'll craft a strong "Tell me about yourself" script for you.`);
  S.history.push({role:'assistant',content:'Elevator pitch builder started.'});
  // Now the LLM handles the rest naturally
}

/* ══════════════════════════════════════════════════════════════
   TOUGH QUESTION COACH
══════════════════════════════════════════════════════════════ */
async function toughQuestionCoach(text){
  await askLLM(text,'tough_questions');
}

/* ══════════════════════════════════════════════════════════════
   JOB SEARCH
══════════════════════════════════════════════════════════════ */
async function handleJobSearch(query){
  showTyping();
  let jobs=[];
  try{
    const res=await fetch(API.jobSearch,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:clean(query,200),resumeId:S.resumeId}),signal:AbortSignal.timeout(10000)});
    if(res.ok)jobs=(await res.json()).jobs||[];
  }catch(e){console.warn('Job search error:',e.message);}
  if(!jobs.length)jobs=demoJobs(query);
  hideTyping();
  if(!jobs.length){
    botMsg('No exact matches right now, but our team updates listings continuously. Want me to <strong>capture your profile</strong> so a recruiter can reach out when the right role opens?');
    setQR(['Yes, submit my profile','Tell me about Switch4 services','Contact a recruiter']);
    return;
  }
  botMsg(`I found <strong>${Math.min(jobs.length,4)} open position${jobs.length>1?'s':''}</strong> matching your search. Here they are:`);
  jobs.slice(0,4).forEach(renderJobCard);
  setQR(['Apply to one of these','Upload resume for matching','Browse more roles','Talk to a recruiter']);
}

function renderJobCard(job){
  const div=document.createElement('div');div.className='s4m s4bot';
  div.innerHTML=`
    <div class="s4mav" style="background:linear-gradient(135deg,#1BA8B8,#2E9B5F);color:#fff;font-weight:700;font-size:10px">S4</div>
    <div style="flex:1;min-width:0">
      <div class="s4jc">
        <div class="s4jt">${esc(job.title)}</div>
        <div class="s4jm">📍 ${esc(job.location)} · ${esc(job.type)} · ${esc(job.industry)}</div>
        ${job.salary?`<div class="s4jm">💰 ${esc(job.salary)}</div>`:''}
        <div class="s4jtags">${(job.tags||[]).map(t=>`<span class="s4tag">${esc(t)}</span>`).join('')}</div>
        ${job.match?`<div class="s4jmbar"><div class="s4jmb"><div class="s4jmf" style="width:${Math.min(100,+job.match||0)}%"></div></div><span class="s4jmp">${+job.match||0}% match</span></div>`:''}
        <button class="s4jab" onclick="S4Chat.applyJob(${JSON.stringify(esc(job.id))},${JSON.stringify(esc(job.title))})">Apply Now →</button>
      </div>
    </div>`;
  msgs().appendChild(div);scrollDown();
}

function applyJob(id,title){
  clearQR();S.targetJob={id,title};
  botMsg(`Great choice! Let me collect your details to submit an application for <strong>${esc(title)}</strong>.`);
  showLeadForm();
}

function demoJobs(q){
  // Industry mix: Healthcare 40%, IT 25%, Finance 15%, Engineering 10%, Other 10%
  const all=[
    // ── Healthcare (40%) ────────────────────────────────────
    {id:'d1', title:'Registered Nurse (RN) – ICU',           location:'Dallas, TX',      type:'Contract',  industry:'Healthcare',    salary:'$42–58/hr',    tags:['RN','ICU','Critical Care'],            match:88},
    {id:'d2', title:'BSN Registered Nurse – Med/Surg',        location:'Houston, TX',     type:'Permanent', industry:'Healthcare',    salary:'$65K–85K',     tags:['BSN','Med-Surg','Hospital'],            match:85},
    {id:'d3', title:'Travel Nurse – Emergency Department',    location:'Phoenix, AZ',     type:'Contract',  industry:'Healthcare',    salary:'$50–70/hr',    tags:['RN','ED','Travel Nurse'],               match:83},
    {id:'d4', title:'LPN – Long Term Care',                   location:'Chicago, IL',     type:'Permanent', industry:'Healthcare',    salary:'$48K–62K',     tags:['LPN','LTC','Geriatrics'],               match:80},
    {id:'d5', title:'Allied Health – Physical Therapist',     location:'Denver, CO',      type:'Permanent', industry:'Healthcare',    salary:'$75K–95K',     tags:['PT','Allied Health','Orthopedic'],      match:79},
    {id:'d6', title:'Healthcare Operations Director',          location:'Atlanta, GA',     type:'Permanent', industry:'Healthcare',    salary:'$110K–145K',   tags:['Operations','Epic','Leadership'],       match:77},
    {id:'d7', title:'Medical Billing Specialist',             location:'Remote',          type:'Full-Time', industry:'Healthcare',    salary:'$45K–60K',     tags:['Revenue Cycle','ICD-10','Billing'],     match:72},
    {id:'d8', title:'Radiology Technologist',                 location:'Seattle, WA',     type:'Permanent', industry:'Healthcare',    salary:'$68K–88K',     tags:['Radiology','ARRT','Imaging'],           match:71},
    // ── Information Technology (25%) ─────────────────────────
    {id:'d9', title:'Senior Software Engineer',               location:'Remote',          type:'Full-Time', industry:'Technology',    salary:'$140K–175K',   tags:['React','Node.js','AWS'],                match:76},
    {id:'d10',title:'DevOps / Cloud Engineer',                location:'Austin, TX',      type:'Full-Time', industry:'Technology',    salary:'$130K–165K',   tags:['AWS','Kubernetes','CI/CD'],             match:74},
    {id:'d11',title:'Data Engineer',                          location:'New York, NY',    type:'Full-Time', industry:'Technology',    salary:'$125K–155K',   tags:['Python','Spark','dbt','Snowflake'],     match:72},
    {id:'d12',title:'Cybersecurity Analyst',                  location:'Washington, DC',  type:'Permanent', industry:'Technology',    salary:'$95K–125K',    tags:['SIEM','SOC','CISSP'],                   match:70},
    {id:'d13',title:'Product Manager – SaaS',                 location:'San Francisco, CA',type:'Full-Time',industry:'Technology',   salary:'$135K–165K',   tags:['Product','Agile','B2B SaaS'],           match:68},
    // ── Finance & Accounting (15%) ───────────────────────────
    {id:'d14',title:'VP of Finance',                          location:'Chicago, IL',     type:'Permanent', industry:'Finance',       salary:'$180K–220K',   tags:['FP&A','M&A','GAAP'],                   match:71},
    {id:'d15',title:'Senior Financial Analyst',               location:'Dallas, TX',      type:'Permanent', industry:'Finance',       salary:'$85K–110K',    tags:['FP&A','Excel','Forecasting'],           match:68},
    {id:'d16',title:'Accounting Manager',                     location:'Miami, FL',       type:'Permanent', industry:'Finance',       salary:'$90K–115K',    tags:['CPA','Month-End Close','GAAP'],         match:66},
    // ── Engineering & Manufacturing (10%) ────────────────────
    {id:'d17',title:'Principal Mechanical Engineer',          location:'Seattle, WA',     type:'Full-Time', industry:'Engineering',   salary:'$115K–145K',   tags:['CAD','FEA','SolidWorks'],               match:74},
    {id:'d18',title:'Electrical Engineer – Automation',       location:'Detroit, MI',     type:'Full-Time', industry:'Engineering',   salary:'$95K–125K',    tags:['PLC','SCADA','Allen-Bradley'],          match:70},
    // ── Supply Chain & Other (10%) ───────────────────────────
    {id:'d19',title:'Supply Chain Manager',                   location:'Houston, TX',     type:'Full-Time', industry:'Supply Chain',  salary:'$90K–120K',    tags:['SAP','Logistics','S&OP'],               match:68},
    {id:'d20',title:'Executive Search – CFO',                 location:'New York, NY',    type:'Permanent', industry:'Finance',       salary:'$250K–350K',   tags:['CFO','Executive','PE-backed'],          match:65},
  ];
  const lo=(q||'').toLowerCase();
  const f=all.filter(j=>
    !lo||j.title.toLowerCase().includes(lo)||
    j.industry.toLowerCase().includes(lo)||
    j.tags.some(t=>t.toLowerCase().includes(lo))
  );
  return f.length?f:all.slice(0,6);
}


function showUploadArea(){
  const div=document.createElement('div');div.className='s4m s4bot';
  div.innerHTML=`
    <div class="s4mav" style="background:linear-gradient(135deg,#1BA8B8,#2E9B5F);color:#fff;font-weight:700;font-size:11px">S4</div>
    <div style="flex:1;min-width:0">
      <div class="s4up" id="s4upz" onclick="document.getElementById('s4ufi').click()"
        ondragover="event.preventDefault();this.classList.add('s4drag')"
        ondragleave="this.classList.remove('s4drag')"
        ondrop="S4Chat.drop(event)">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" style="margin:0 auto .4rem;display:block"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p><strong>Click to upload</strong> or drag &amp; drop</p>
        <p style="margin-top:.2rem;font-size:.66rem">PDF, DOC, DOCX, TXT · max 5MB · sent securely to our server</p>
        <input type="file" id="s4ufi" accept=".pdf,.doc,.docx,.txt" onchange="S4Chat.fileSelect(this.files[0])"/>
      </div>
    </div>`;
  msgs().appendChild(div);scrollDown();
}

function drop(e){
  e.preventDefault();$('s4upz')?.classList.remove('s4drag');
  const f=e.dataTransfer?.files?.[0];if(f)fileSelect(f);
}

async function fileSelect(file){
  if(!file)return;
  if(file.size>5*1024*1024){botMsg('That file is a bit large (max 5MB). Please try a compressed version.');return;}
  const ext='.'+file.name.split('.').pop().toLowerCase();
  if(!['.pdf','.doc','.docx','.txt'].includes(ext)){botMsg('Please upload a PDF, DOC, DOCX, or TXT file.');return;}
  botMsg(`📄 Uploading <strong>${esc(file.name)}</strong> securely…`);showTyping();
  const fd=new FormData();fd.append('resume',file);
  try{
    const res=await fetch(API.upload,{method:'POST',body:fd,signal:AbortSignal.timeout(30000)});
    if(!res.ok)throw new Error(`${res.status}`);
    const data=await res.json();
    S.resumeId=data.resumeId;hideTyping();
    botMsg(`✅ <strong>Resume uploaded!</strong><br><br>${md(data.analysis||'Your resume has been received.')}`);
    setTimeout(()=>{botMsg('Let me match your profile to current openings…');handleJobSearch('');},900);
    setTimeout(()=>{botMsg('To complete your candidate profile:');showLeadForm();},3000);
  }catch(err){
    hideTyping();
    botMsg('Upload failed — please try again, or email your resume directly to <strong>info@switch4.co</strong>.');
    console.error('Upload:',err.message);
  }
}

/* ══════════════════════════════════════════════════════════════
   LEAD CAPTURE → /api/jobdiva/candidate
══════════════════════════════════════════════════════════════ */
function showLeadForm(){
  const div=document.createElement('div');div.className='s4m s4bot';
  div.innerHTML=`
    <div class="s4mav" style="background:linear-gradient(135deg,#1BA8B8,#2E9B5F);color:#fff;font-weight:700;font-size:11px">S4</div>
    <div style="flex:1;min-width:0">
      <div class="s4fc">
        <div class="s4fctitle">Your Contact Details</div>
        <input class="s4fi" id="s4fn" placeholder="Full Name *" type="text" maxlength="120"/>
        <input class="s4fi" id="s4fe" placeholder="Email Address *" type="email" maxlength="320"/>
        <input class="s4fi" id="s4fp" placeholder="Phone Number" type="tel" maxlength="30"/>
        <input class="s4fi" id="s4fr" placeholder="Role you're looking for" type="text" maxlength="200"/>
        <button class="s4fs" onclick="S4Chat.submitLead()">Submit My Profile →</button>
        <p class="s4fn">🔒 Your info is used only for recruitment. <span style="cursor:pointer;color:#1BA8B8;text-decoration:underline" onclick="S4Chat.handleInput('delete my data')">Delete my data</span></p>
      </div>
    </div>`;
  msgs().appendChild(div);scrollDown();
}

async function submitLead(){
  const name=clean($('s4fn')?.value||'',120);
  const email=clean($('s4fe')?.value||'',320);
  const phone=clean($('s4fp')?.value||'',30);
  const role=clean($('s4fr')?.value||'',200);
  if(name.length<2){botMsg('Please enter your full name.');return;}
  if(!isEmail(email)){botMsg('Please enter a valid email address.');return;}
  const parts=name.split(' ');
  showTyping();
  try{
    const res=await fetch(API.createCand,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:parts[0],lastName:parts.slice(1).join(' '),email,phone,role,resumeId:S.resumeId,targetJobId:S.targetJob?.id}),signal:AbortSignal.timeout(15000)});
    const data=await res.json().catch(()=>({}));
    const cid=data.candidateId||null;
    if(cid&&S.targetJob?.id)fetch(API.createApp,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId:cid,jobId:S.targetJob.id})}).catch(()=>{});
  }catch(e){console.warn('Create candidate:',e.message);}
  fetch(API.notify,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,phone,role,targetJob:S.targetJob,resumeId:S.resumeId,source:'chatbot'})}).catch(()=>{});
  hideTyping();
  S.candidate={name,email,phone,role};saveH();
  botMsg(`🎉 <strong>Profile submitted, ${esc(parts[0])}!</strong><br><br>A Switch4 recruiter will be in touch at <strong>${esc(email)}</strong> within 1 business day.<br><br>In the meantime — want to run a <strong>mock interview</strong> to get ready?`);
  setQR(['Yes, start a mock interview','Browse more jobs','Schedule a recruiter call']);
}

/* ══════════════════════════════════════════════════════════════
   SCHEDULE
══════════════════════════════════════════════════════════════ */
function showScheduleCard(){
  const today=new Date();const slots=[];
  for(let d=1;d<=7&&slots.length<6;d++){
    const dt=new Date(today);dt.setDate(today.getDate()+d);
    if(dt.getDay()===0||dt.getDay()===6)continue;
    const lbl=dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    slots.push(`${lbl} – 10:00 AM`,`${lbl} – 2:00 PM`);
  }
  const div=document.createElement('div');div.className='s4m s4bot';
  div.innerHTML=`
    <div class="s4mav" style="background:linear-gradient(135deg,#1BA8B8,#2E9B5F);color:#fff;font-weight:700;font-size:11px">S4</div>
    <div style="flex:1;min-width:0">
      <div class="s4fc">
        <div class="s4fctitle">📅 Pick a Time Slot (Eastern)</div>
        <div class="s4sslots" id="s4slots">${slots.map(s=>`<button class="s4slb" onclick="S4Chat.pickSlot(this,'${esc(s)}')">${esc(s)}</button>`).join('')}</div>
        <div id="s4sched-f" style="display:none;margin-top:.6rem">
          <input class="s4fi" id="s4sn" placeholder="Your Name *" type="text" maxlength="120"/>
          <input class="s4fi" id="s4se" placeholder="Email *" type="email" maxlength="320"/>
          <button class="s4fs" onclick="S4Chat.confirmSchedule()">Confirm Booking →</button>
        </div>
        <p class="s4fn">A calendar invite will be sent to your email.</p>
      </div>
    </div>`;
  msgs().appendChild(div);scrollDown();
}

function pickSlot(btn,slot){
  document.querySelectorAll('.s4slb').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');S.scheduledSlot=slot;
  $('s4sched-f').style.display='block';scrollDown();
}

async function confirmSchedule(){
  const name=clean($('s4sn')?.value||'',120);
  const email=clean($('s4se')?.value||'',320);
  if(!name||!isEmail(email)||!S.scheduledSlot){botMsg('Please fill in your name, email, and select a time.');return;}
  showTyping();
  try{await fetch(API.schedule,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,slot:S.scheduledSlot}),signal:AbortSignal.timeout(10000)});}catch(e){}
  hideTyping();
  botMsg(`✅ <strong>Booked!</strong> Your call is set for <strong>${esc(S.scheduledSlot)} EST</strong>.<br>A calendar invite goes to <strong>${esc(email)}</strong>. We look forward to speaking with you, ${esc(name)}! 🎉`);
  setQR(['Run a mock interview to prepare','Upload my resume','Browse open jobs']);
}

/* ══════════════════════════════════════════════════════════════
   DELETE DATA
══════════════════════════════════════════════════════════════ */
function showDeleteCard(){
  const div=document.createElement('div');div.className='s4m s4bot';
  div.innerHTML=`
    <div class="s4mav" style="background:linear-gradient(135deg,#1BA8B8,#2E9B5F);color:#fff;font-weight:700;font-size:11px">S4</div>
    <div style="flex:1;min-width:0">
      <div class="s4dcard">
        <p><strong>Delete your data?</strong><br>This clears your chat history and contact details from this browser. For full ATS removal, email <strong>info@switch4.co</strong> with subject "Delete My Data" — we'll process it within 30 days per GDPR/CCPA.</p>
        <div style="display:flex;gap:.5rem">
          <button class="s4dbtn" onclick="S4Chat.confirmDelete()">Clear local data</button>
          <button style="padding:.42rem .95rem;border-radius:9px;border:1px solid #d1d5db;background:#fff;color:#6b7280;font-size:.73rem;cursor:pointer;font-family:inherit" onclick="S4Chat.handleInput('continue')">Cancel</button>
        </div>
      </div>
    </div>`;
  msgs().appendChild(div);scrollDown();
}

function confirmDelete(){
  try{localStorage.removeItem('s4h');localStorage.removeItem('s4c');}catch(e){}
  Object.assign(S,{history:[],candidate:{},resumeId:null,consent:false,iv:{active:false,phase:'discovery',role:'',company:'',level:'',focus:[],questions:[],qIdx:0,answers:[],totalQ:10,scores:{}}});
  msgs().innerHTML='';setMode(null);
  $('s4cw-consent').style.display='block';
  $('s4cw-consent').innerHTML=`<p style="font-size:.72rem;color:#374151;line-height:1.55;margin:0 0 .6rem">👋 Before we begin — this assistant may collect your name, email, and resume to help match you with opportunities. See our <a href="privacy.html" style="color:#1BA8B8">Privacy Policy</a>.</p><div class="s4cbtns"><button class="s4ca" onclick="S4Chat.acceptConsent()">✓ I understand &amp; agree</button><button class="s4cd" onclick="S4Chat.declineConsent()">Decline</button></div>`;
  botMsg('✅ Local data cleared.<br>For ATS removal: email <strong>info@switch4.co</strong> with subject "Delete My Data".');
}

/* ══════════════════════════════════════════════════════════════
   QUICK ACTIONS
══════════════════════════════════════════════════════════════ */
function qa(action){
  clearQR();
  const map={
    upload:'I want to upload my resume',
    jobs:'Show me open jobs',
    interview:'I want to run a mock interview and get coaching',
    schedule:'I want to schedule a call with a recruiter',
  };
  handleInput(map[action]||action);
}

function clearHistory(){
  if(!confirm('Start a new conversation?'))return;
  try{localStorage.removeItem('s4h');}catch(e){}
  S.history=[];S.iv={active:false,phase:'discovery',role:'',company:'',level:'',focus:[],questions:[],qIdx:0,answers:[],totalQ:10,scores:{}};
  msgs().innerHTML='';clearQR();setMode(null);welcome();
}

function suggestFollowUps(reply){
  const lo=reply.toLowerCase();
  if(lo.includes('interview'))setQR(['Start mock interview','Browse jobs','Upload resume']);
  else if(lo.includes('resume')||lo.includes('cv'))setQR(['Upload resume','Browse jobs','Schedule call']);
  else if(lo.includes('salary'))setQR(['Practice negotiation','Interview coaching','Browse jobs']);
  else if(lo.includes('healthcare')||lo.includes('nurse'))setQR(['Healthcare mock interview','Browse healthcare jobs','Upload resume']);
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/* ── INIT ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded',()=>{
  const ta=$('s4cw-ta');
  if(ta){
    ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,130)+'px';});
    ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
  }
  setTimeout(()=>{
    const n=$('s4cw-n');const w=$('s4cw-w');
    if(n&&w&&w.classList.contains('s4h')){
      Object.assign(n.style,{display:'flex',width:'auto',height:'auto',padding:'2px 6px',fontSize:'9px',borderRadius:'999px'});
      n.textContent='👋';
    }
  },10000);
});

return{toggle,acceptConsent,declineConsent,send,handleInput,qa,clearHistory,
  confirmDelete,applyJob,pickSlot,confirmSchedule,drop,fileSelect,submitLead,
  showPrepCard:()=>{}};
})();
