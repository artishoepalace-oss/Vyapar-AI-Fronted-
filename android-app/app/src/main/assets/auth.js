(function(){
  "use strict";

  const API_BASE = "https://vypar-backend.onrender.com";
  const TOKEN_KEY = "vyapar_ai_auth_token_v1";
  const REFRESH_TOKEN_KEY = "vyapar_ai_auth_refresh_token_v1";
  const ACCOUNT_KEY = "vyapar_ai_account_cache_v1";
  const AUTH_METHOD_KEY = "vyapar_ai_auth_method_v2";

  function preferredLightTheme(){
    try{
      const data = JSON.parse(localStorage.getItem("vyapar_ai_prod_v1") || "{}");
      const theme = data?.settings?.theme;
      if(theme === "light") return true;
      if(theme === "dark") return false;
    }catch(_){}
    try{return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches)}catch(_){return false}
  }

  const style = document.createElement("style");
  style.id = "vyaparAuthExact637";
  style.textContent = `
    #vyaparOtpGate{
      --auth-bg:#f8fafc;
      --auth-card:#ffffff;
      --auth-soft:#f1f5f9;
      --auth-soft-hover:#e2e8f0;
      --auth-border:#e2e8f0;
      --auth-text:#0b2545;
      --auth-body:#334155;
      --auth-muted:#64748b;
      --auth-subtle:#94a3b8;
      --auth-accent:#0f8f83;
      --auth-primary:#0b2545;
      --auth-primary-hover:#152f4c;
      --auth-ring:rgba(15,143,131,.22);
      --auth-error:#b4233d;
      --auth-error-bg:#fff1f2;
      --auth-success:#0c765f;
      --auth-success-bg:#ecfdf5;
      position:fixed;
      inset:0;
      z-index:2147483647;
      overflow:auto;
      background:var(--auth-bg);
      color:var(--auth-body);
      font-family:Inter,Roboto,system-ui,-apple-system,"Segoe UI",Arial,sans-serif;
      -webkit-font-smoothing:antialiased;
      color-scheme:light;
      scrollbar-width:none;
    }
    #vyaparOtpGate::-webkit-scrollbar{display:none;width:0;height:0}
    #vyaparOtpGate.auth-dark{
      --auth-bg:#08131f;
      --auth-card:#0e1d2b;
      --auth-soft:#132638;
      --auth-soft-hover:#193047;
      --auth-border:#24394c;
      --auth-text:#f1f5f9;
      --auth-body:#e2e8f0;
      --auth-muted:#9fb0c1;
      --auth-subtle:#75899b;
      --auth-accent:#36c3b2;
      --auth-primary:#176d83;
      --auth-primary-hover:#1c8098;
      --auth-ring:rgba(54,195,178,.22);
      --auth-error:#ff91a3;
      --auth-error-bg:rgba(190,24,93,.12);
      --auth-success:#70deb8;
      --auth-success-bg:rgba(16,185,129,.10);
      color-scheme:dark;
    }
    #vyaparOtpGate *{box-sizing:border-box}
    #vyaparOtpGate button,#vyaparOtpGate input{font:inherit}
    #vyaparOtpGate .auth-page{
      min-height:100%;
      width:100%;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:16px;
    }
    #vyaparOtpGate .auth-card{
      width:100%;
      max-width:448px;
      background:var(--auth-card);
      border:1px solid var(--auth-border);
      border-radius:16px;
      box-shadow:0 20px 55px rgba(15,23,42,.12);
      padding:32px;
    }
    #vyaparOtpGate.auth-dark .auth-card{box-shadow:0 22px 60px rgba(0,0,0,.32)}
    #vyaparOtpGate .auth-logo-wrap{text-align:center;margin-bottom:20px}
    #vyaparOtpGate .auth-logo{
      display:block;
      height:80px;
      width:auto;
      max-width:180px;
      margin:0 auto;
      object-fit:contain;
    }
    #vyaparOtpGate .auth-title{
      margin:8px 0 0;
      color:var(--auth-text);
      text-align:center;
      font-size:24px;
      line-height:1.25;
      font-weight:800;
      letter-spacing:-.02em;
    }
    #vyaparOtpGate .auth-subtitle{
      margin:6px 0 0;
      color:var(--auth-muted);
      text-align:center;
      font-size:14px;
      line-height:1.45;
    }
    #vyaparOtpGate .auth-section{display:block}
    #vyaparOtpGate .auth-section.hidden,#vyaparOtpGate .auth-form.hidden{display:none!important}
    #vyaparOtpGate .auth-space-5>*+*{margin-top:20px}
    #vyaparOtpGate .auth-space-4>*+*{margin-top:16px}
    #vyaparOtpGate .auth-space-3>*+*{margin-top:12px}
    #vyaparOtpGate .auth-method-tabs{
      display:flex;
      padding:4px;
      background:var(--auth-soft);
      border-radius:12px;
      font-size:14px;
      font-weight:650;
    }
    #vyaparOtpGate .auth-method-tab{
      flex:1;
      min-height:40px;
      padding:8px 10px;
      border:0;
      border-radius:8px;
      background:transparent;
      color:var(--auth-muted);
      cursor:pointer;
      touch-action:manipulation;
      transition:background-color .15s ease,color .15s ease,box-shadow .15s ease;
    }
    #vyaparOtpGate .auth-method-tab.active{
      background:var(--auth-card);
      color:var(--auth-text);
      box-shadow:0 2px 7px rgba(15,23,42,.08);
    }
    #vyaparOtpGate .auth-label{
      display:block;
      margin-bottom:4px;
      color:var(--auth-muted);
      font-size:12px;
      line-height:1.35;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.055em;
    }
    #vyaparOtpGate .auth-label-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px}
    #vyaparOtpGate .auth-label-row .auth-label{margin:0}
    #vyaparOtpGate .auth-forgot{
      min-height:28px;
      padding:2px 0;
      border:0;
      background:transparent;
      color:var(--auth-accent);
      font-size:12px;
      font-weight:650;
      cursor:pointer;
    }
    #vyaparOtpGate .auth-input{
      width:100%;
      min-height:44px;
      padding:10px 14px;
      border:1px solid var(--auth-border);
      border-radius:8px;
      outline:none;
      background:var(--auth-card);
      color:var(--auth-body);
      font-size:16px;
      transition:border-color .15s ease,box-shadow .15s ease,background-color .15s ease;
    }
    #vyaparOtpGate.auth-dark .auth-input{background:#0b1824}
    #vyaparOtpGate .auth-input::placeholder{color:var(--auth-subtle)}
    #vyaparOtpGate .auth-input:focus{border-color:var(--auth-accent);box-shadow:0 0 0 3px var(--auth-ring)}
    #vyaparOtpGate .auth-otp-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;min-width:0;align-items:stretch}
    #vyaparOtpGate .auth-otp-row .auth-input{min-width:0;width:100%}
    #vyaparOtpGate .auth-small-btn{
      flex:none;
      min-height:44px;
      padding:9px 12px;
      border:1px solid var(--auth-border);
      border-radius:8px;
      background:var(--auth-soft);
      color:var(--auth-text);
      font-size:12px;
      font-weight:700;
      white-space:nowrap;
      cursor:pointer;
      touch-action:manipulation;
    }
    #vyaparOtpGate .auth-small-btn:hover{background:var(--auth-soft-hover)}
    #vyaparOtpGate .auth-primary{
      width:100%;
      min-height:44px;
      padding:10px 14px;
      border:0;
      border-radius:8px;
      background:var(--auth-primary);
      color:#fff;
      font-size:14px;
      font-weight:700;
      box-shadow:0 6px 14px rgba(15,23,42,.12);
      cursor:pointer;
      touch-action:manipulation;
      transition:background-color .15s ease,opacity .15s ease;
    }
    #vyaparOtpGate .auth-primary:hover{background:var(--auth-primary-hover)}
    #vyaparOtpGate .auth-divider{position:relative;display:flex;align-items:center;justify-content:center;margin:16px 0}
    #vyaparOtpGate .auth-divider::before{content:"";width:100%;border-top:1px solid var(--auth-border)}
    #vyaparOtpGate .auth-divider span{position:absolute;padding:0 12px;background:var(--auth-card);color:var(--auth-subtle);font-size:12px;text-transform:uppercase;letter-spacing:.055em}
    #vyaparOtpGate .auth-google{
      width:100%;
      min-height:44px;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:12px;
      padding:10px 14px;
      border:1px solid var(--auth-border);
      border-radius:8px;
      background:var(--auth-card);
      color:var(--auth-body);
      font-size:14px;
      font-weight:650;
      box-shadow:0 2px 6px rgba(15,23,42,.05);
      cursor:pointer;
      touch-action:manipulation;
    }
    #vyaparOtpGate .auth-google:hover{background:var(--auth-soft)}
    #vyaparOtpGate .auth-google svg{width:20px;height:20px;flex:none}
    #vyaparOtpGate .auth-switch{text-align:center;color:var(--auth-muted);font-size:12px;line-height:1.5}
    #vyaparOtpGate .auth-switch button{
      min-height:30px;
      padding:2px 3px;
      border:0;
      background:transparent;
      color:var(--auth-accent);
      font-size:12px;
      font-weight:750;
      cursor:pointer;
    }
    #vyaparOtpGate .auth-check{display:flex;align-items:flex-start;gap:8px;padding-top:4px}
    #vyaparOtpGate .auth-check input{width:16px;height:16px;margin:2px 0 0;accent-color:var(--auth-accent);flex:none}
    #vyaparOtpGate .auth-check label{color:var(--auth-muted);font-size:12px;line-height:1.45}
    #vyaparOtpGate .auth-check a{color:var(--auth-accent);text-decoration:none}
    #vyaparOtpGate .auth-message{display:none;margin-top:14px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.4}
    #vyaparOtpGate .auth-message.error{display:block;color:var(--auth-error);background:var(--auth-error-bg);border:1px solid rgba(180,35,61,.22)}
    #vyaparOtpGate .auth-message.success{display:block;color:var(--auth-success);background:var(--auth-success-bg);border:1px solid rgba(12,118,95,.22)}
    #vyaparOtpGate .auth-help{margin-top:14px;text-align:center;color:var(--auth-subtle);font-size:10px;line-height:1.5}
    #vyaparOtpGate .gupta-legacy-signature{display:block;margin-top:5px;color:var(--auth-text);font-size:11px;font-weight:800;font-style:italic;letter-spacing:.02em}
    #vyaparOtpGate .auth-loading-overlay{position:fixed;inset:0;z-index:4;display:none;align-items:center;justify-content:center;padding:20px;background:var(--auth-bg);background:color-mix(in srgb,var(--auth-bg) 90%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
    #vyaparOtpGate.auth-loading .auth-loading-overlay{display:flex}
    #vyaparOtpGate .auth-loading-card{width:min(300px,88vw);padding:22px 20px;border:1px solid var(--auth-border);border-radius:18px;background:var(--auth-card);box-shadow:0 18px 46px rgba(15,23,42,.16);text-align:center;color:var(--auth-text)}
    #vyaparOtpGate .auth-loading-spinner{width:34px;height:34px;margin:0 auto 12px;border-radius:50%;border:3px solid var(--auth-border);border-top-color:var(--auth-accent);animation:authSpin .72s linear infinite}
    #vyaparOtpGate .auth-loading-card strong{display:block;font-size:15px}
    #vyaparOtpGate .auth-loading-card span{display:block;margin-top:5px;color:var(--auth-muted);font-size:12px}
    @keyframes authSpin{to{transform:rotate(360deg)}}
    #vyaparOtpGate button:disabled{opacity:.55;cursor:wait}
    #vyaparOtpGate .password-setup-copy{margin:0 0 16px;color:var(--auth-muted);font-size:13px;text-align:center;line-height:1.5}
    @media(max-width:520px){
      #vyaparOtpGate .auth-page{align-items:flex-start;padding:calc(10px + env(safe-area-inset-top)) 10px calc(14px + env(safe-area-inset-bottom))}
      #vyaparOtpGate .auth-card{max-width:100%;padding:22px 18px 20px;border-radius:18px;box-shadow:0 12px 32px rgba(15,23,42,.11)}
      #vyaparOtpGate .auth-logo{height:70px;max-width:158px}
      #vyaparOtpGate .auth-logo-wrap{margin-bottom:16px}
      #vyaparOtpGate .auth-title{font-size:24px}
      #vyaparOtpGate .auth-subtitle{font-size:13px}
      #vyaparOtpGate .auth-input,#vyaparOtpGate .auth-primary,#vyaparOtpGate .auth-google{min-height:50px}
      #vyaparOtpGate .auth-method-tab{min-height:44px;font-size:13px}
      #vyaparOtpGate .auth-otp-row{grid-template-columns:1fr}
      #vyaparOtpGate .auth-small-btn{min-height:44px;min-width:118px;justify-self:end;padding:9px 14px}
      #vyaparOtpGate .auth-forgot,#vyaparOtpGate .auth-switch button{color:#1677d2!important;background:transparent!important;border:0!important;box-shadow:none!important}
    }
    @media(max-width:360px){
      #vyaparOtpGate .auth-card{padding:18px 16px}
      #vyaparOtpGate .auth-otp-row{align-items:stretch}
      #vyaparOtpGate .auth-small-btn{padding-left:10px;padding-right:10px}
    }
    @media(prefers-reduced-motion:reduce){#vyaparOtpGate *{transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.appendChild(style);

  const googleSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.23v3.14C3.2 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.59H1.23C.44 8.16 0 9.99 0 12s.44 3.84 1.23 5.41l4.05-3.14z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.2 2.7 1.23 6.59l4.05 3.14c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>`;

  const gate = document.createElement("div");
  gate.id = "vyaparOtpGate";
  gate.classList.toggle("auth-dark", !preferredLightTheme());
  gate.innerHTML = `
    <div class="auth-page">
      <main class="auth-card" aria-labelledby="page-title">
        <div class="auth-logo-wrap">
          <img src="logo.png" alt="Vyapar AI Logo" class="auth-logo">
          <h1 id="page-title" class="auth-title">Welcome Back</h1>
          <p id="page-subtitle" class="auth-subtitle">Sign in to manage your smart business growth</p>
        </div>

        <section id="login-section" class="auth-section auth-space-5">
          <div class="auth-method-tabs" role="tablist" aria-label="Authentication method">
            <button id="tab-login-pass" class="auth-method-tab active" type="button" role="tab" aria-selected="true">Login with Password</button>
            <button id="tab-login-otp" class="auth-method-tab" type="button" role="tab" aria-selected="false">Login with OTP</button>
          </div>

          <form id="form-login-pass" class="auth-form auth-space-4" novalidate>
            <div>
              <label class="auth-label" for="login-email">Email Address</label>
              <input id="login-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="name@company.com">
            </div>
            <div>
              <div class="auth-label-row">
                <label class="auth-label" for="login-password">Password</label>
                <button id="forgot-password" class="auth-forgot" type="button">Forgot password?</button>
              </div>
              <input id="login-password" class="auth-input" type="password" autocomplete="current-password" placeholder="••••••••">
            </div>
            <button id="login-password-submit" class="auth-primary" type="submit">Login with Password</button>
          </form>

          <form id="form-login-otp" class="auth-form auth-space-4 hidden" novalidate>
            <div>
              <label class="auth-label" for="login-otp-email">Email Address</label>
              <div class="auth-otp-row">
                <input id="login-otp-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="name@company.com">
                <button id="login-send-otp" class="auth-small-btn" type="button">Get OTP</button>
              </div>
            </div>
            <div>
              <label class="auth-label" for="login-otp-code">Enter OTP</label>
              <input id="login-otp-code" class="auth-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code">
            </div>
            <button id="login-otp-submit" class="auth-primary" type="submit">Login with OTP</button>
          </form>

          <div class="auth-divider"><span>Or continue with</span></div>
          <button id="google-login" class="auth-google" type="button">${googleSvg}<span>Sign in with Google</span></button>
          <p class="auth-switch">Don't have an account? <button id="show-signup" type="button">Create account</button></p>
        </section>

        <section id="signup-section" class="auth-section auth-space-4 hidden">
          <button id="google-signup" class="auth-google" type="button">${googleSvg}<span>Sign up with Google</span></button>
          <div class="auth-divider"><span>Or register with email</span></div>

          <form id="form-signup" class="auth-form auth-space-3" novalidate>
            <div>
              <label class="auth-label" for="signup-name">Full Name</label>
              <input id="signup-name" class="auth-input" type="text" autocomplete="name" placeholder="John Doe">
            </div>
            <div>
              <label class="auth-label" for="signup-email">Email Address</label>
              <div class="auth-otp-row">
                <input id="signup-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="name@company.com">
                <button id="signup-send-otp" class="auth-small-btn" type="button">Send OTP</button>
              </div>
            </div>
            <div>
              <label class="auth-label" for="signup-otp">Verify Email OTP</label>
              <input id="signup-otp" class="auth-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Enter 6-digit code">
            </div>
            <div>
              <label class="auth-label" for="signup-password">Create Password</label>
              <input id="signup-password" class="auth-input" type="password" autocomplete="new-password" placeholder="At least 8 characters">
            </div>
            <div class="auth-check">
              <input id="signup-terms" type="checkbox">
              <label for="signup-terms">I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</label>
            </div>
            <button id="signup-submit" class="auth-primary" type="submit">Create Account</button>
          </form>
          <p class="auth-switch">Already have an account? <button id="show-login" type="button">Sign In</button></p>
        </section>

        <section id="password-setup-section" class="auth-section hidden">
          <p id="password-setup-copy" class="password-setup-copy">Email verified. Create a password to finish setup.</p>
          <form id="form-password-setup" class="auth-form auth-space-4" novalidate>
            <div>
              <label class="auth-label" for="setup-password">Create Password</label>
              <input id="setup-password" class="auth-input" type="password" autocomplete="new-password" placeholder="At least 8 characters">
            </div>
            <div>
              <label class="auth-label" for="setup-password-confirm">Confirm Password</label>
              <input id="setup-password-confirm" class="auth-input" type="password" autocomplete="new-password" placeholder="Repeat password">
            </div>
            <button id="setup-password-submit" class="auth-primary" type="submit">Save Password & Continue</button>
          </form>
        </section>

        <div id="auth-message" class="auth-message" role="status" aria-live="polite"></div>
        <div class="auth-help">Vyapar AI 6.5.9</div>
      </main>
      <div class="auth-loading-overlay" role="status" aria-live="polite" aria-label="Opening Vyapar AI">
        <div class="auth-loading-card"><div class="auth-loading-spinner" aria-hidden="true"></div><strong>Login successful</strong><span>Opening home…</span></div>
      </div>
    </div>`;
  document.body.prepend(gate);

  const $ = id => document.getElementById(id);
  const els = {
    title:$("page-title"), subtitle:$("page-subtitle"),
    loginSection:$("login-section"), signupSection:$("signup-section"), setupSection:$("password-setup-section"),
    passTab:$("tab-login-pass"), otpTab:$("tab-login-otp"),
    passForm:$("form-login-pass"), otpForm:$("form-login-otp"), signupForm:$("form-signup"), setupForm:$("form-password-setup"),
    loginEmail:$("login-email"), loginPassword:$("login-password"), loginOtpEmail:$("login-otp-email"), loginOtpCode:$("login-otp-code"),
    signupName:$("signup-name"), signupEmail:$("signup-email"), signupOtp:$("signup-otp"), signupPassword:$("signup-password"), signupTerms:$("signup-terms"),
    setupPassword:$("setup-password"), setupConfirm:$("setup-password-confirm"), setupCopy:$("password-setup-copy"),
    googleLogin:$("google-login"), googleSignup:$("google-signup"), message:$("auth-message")
  };

  let pendingAuthData = null;
  let pendingAuthMethod = null;

  function applyTheme(){
    const light = document.body.classList.contains("theme-light") || document.documentElement.classList.contains("theme-light") || preferredLightTheme();
    gate.classList.toggle("auth-dark", !light);
  }
  applyTheme();
  const themeObserver=new MutationObserver(applyTheme);
  themeObserver.observe(document.body,{attributes:true,attributeFilter:["class"]});
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:["class"]});

  function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim()); }
  function cleanOtp(v){ return String(v || "").replace(/\D/g,"").slice(0,6); }
  function clearMessage(){ els.message.textContent=""; els.message.className="auth-message"; }
  function showMessage(text,type="error"){
    els.message.textContent=text || "";
    els.message.className="auth-message " + type;
  }
  async function readResponse(response){
    const text=await response.text();
    let data={};
    try{ data=text?JSON.parse(text):{}; }
    catch(_){ const e=new Error("The server returned an invalid response"); e.status=response.status; throw e; }
    if(!response.ok || data.success===false){ const e=new Error(data.message||"Request failed"); e.status=response.status; throw e; }
    return data;
  }
  function accessTokenFrom(data){ return String(data?.token || data?.accessToken || data?.access_token || data?.data?.token || data?.data?.accessToken || data?.data?.access_token || "").trim(); }
  function refreshTokenFrom(data){ return String(data?.refreshToken || data?.refresh_token || data?.data?.refreshToken || data?.data?.refresh_token || "").trim(); }
  function currentAccessToken(){ return String(localStorage.getItem(TOKEN_KEY) || "").trim(); }
  function storeSessionTokens(data){
    const accessToken=accessTokenFrom(data), refreshToken=refreshTokenFrom(data);
    if(accessToken)localStorage.setItem(TOKEN_KEY,accessToken);
    if(refreshToken)localStorage.setItem(REFRESH_TOKEN_KEY,refreshToken);
    return accessToken;
  }
  function clearSessionTokens(){ localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(REFRESH_TOKEN_KEY); }

  let refreshPromise=null;
  async function refreshAccessToken(){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      const refreshToken=String(localStorage.getItem(REFRESH_TOKEN_KEY)||"").trim();
      const accessToken=currentAccessToken();
      if(!refreshToken&&!accessToken)return "";
      try{
        const headers={"Content-Type":"application/json","Accept":"application/json"};
        if(accessToken)headers.Authorization="Bearer "+accessToken;
        const response=await fetch(API_BASE+"/auth/refresh",{method:"POST",headers,body:JSON.stringify(refreshToken?{refreshToken}:{})});
        if(!response.ok)return "";
        const text=await response.text(); let data={};
        try{data=text?JSON.parse(text):{}}catch(_){return ""}
        if(data.success===false)return "";
        const nextToken=storeSessionTokens(data); if(!nextToken)return "";
        const refreshedUser=data.user||data?.data?.user||null;
        const refreshedSubscription=data.subscription||data?.data?.subscription||null;
        if(refreshedUser||refreshedSubscription){
          let cached={}; try{cached=JSON.parse(localStorage.getItem(ACCOUNT_KEY)||"{}")||{}}catch(_){}
          localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:refreshedUser||cached.user||null,subscription:refreshedSubscription||cached.subscription||null}));
        }
        return nextToken;
      }catch(_){return ""}
    })();
    try{return await refreshPromise}finally{refreshPromise=null}
  }

  async function authFetch(input,init={}){
    const baseRequest=new Request(input,init);
    const headers=new Headers(baseRequest.headers);
    const token=currentAccessToken();
    if(token&&!headers.has("Authorization"))headers.set("Authorization","Bearer "+token);
    const firstRequest=new Request(baseRequest,{headers});
    const retryTemplate=firstRequest.clone();
    let response=await fetch(firstRequest);
    const inputUrl=String(firstRequest.url||input);
    if(response.status!==401||/\/auth\/(?:login|register|request-otp|verify-otp|google|refresh)(?:\?|$)/.test(inputUrl))return response;
    const nextToken=await refreshAccessToken();
    if(!nextToken)return response;
    const retryHeaders=new Headers(retryTemplate.headers);
    retryHeaders.set("Authorization","Bearer "+nextToken);
    return fetch(new Request(retryTemplate,{headers:retryHeaders}));
  }
  window.vyaparAuthFetch=authFetch;
  window.vyaparRefreshAuthToken=refreshAccessToken;

  function saveSession(data,method){
    const token=storeSessionTokens(data);
    if(!token)throw new Error("Login response did not include a secure token");
    localStorage.setItem(AUTH_METHOD_KEY,method||"account");
    localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user||data?.data?.user||null,subscription:data.subscription||data?.data?.subscription||null}));
  }
  function completeLogin(data,method){
    saveSession(data,method);
    showMessage("Login successful. Opening home…","success");
    gate.classList.add("auth-loading");
    setTimeout(()=>location.reload(),420);
  }
  function needsPasswordSetup(data){ return Boolean((data?.user||data?.data?.user)?.password_configured===false); }

  function showLogin(){
    clearMessage();
    els.loginSection.classList.remove("hidden");
    els.signupSection.classList.add("hidden");
    els.setupSection.classList.add("hidden");
    els.title.textContent="Welcome Back";
    els.subtitle.textContent="Sign in to manage your smart business growth";
  }
  function showSignup(){
    clearMessage();
    els.loginSection.classList.add("hidden");
    els.signupSection.classList.remove("hidden");
    els.setupSection.classList.add("hidden");
    els.title.textContent="Create an Account";
    els.subtitle.textContent="Start your smart business growth journey";
  }
  function switchLoginMode(mode){
    const otp=mode==="otp";
    els.passForm.classList.toggle("hidden",otp);
    els.otpForm.classList.toggle("hidden",!otp);
    els.passTab.classList.toggle("active",!otp);
    els.otpTab.classList.toggle("active",otp);
    els.passTab.setAttribute("aria-selected",String(!otp));
    els.otpTab.setAttribute("aria-selected",String(otp));
    if(otp && els.loginEmail.value.trim() && !els.loginOtpEmail.value.trim())els.loginOtpEmail.value=els.loginEmail.value.trim();
    clearMessage();
  }
  function showPasswordSetup(data,method,recovery){
    saveSession(data,method);
    pendingAuthData=data;
    pendingAuthMethod=method;
    els.loginSection.classList.add("hidden");
    els.signupSection.classList.add("hidden");
    els.setupSection.classList.remove("hidden");
    els.title.textContent=recovery?"Recreate your password":"Create your password";
    els.subtitle.textContent=recovery?"Email verified. Set a new password to continue.":"Email verified. Create a password to finish setup.";
    els.setupCopy.textContent=els.subtitle.textContent;
    els.setupPassword.value="";
    els.setupConfirm.value="";
    clearMessage();
  }

  els.passTab.addEventListener("click",()=>switchLoginMode("password"));
  els.otpTab.addEventListener("click",()=>switchLoginMode("otp"));
  $("show-signup").addEventListener("click",showSignup);
  $("show-login").addEventListener("click",showLogin);
  $("forgot-password").addEventListener("click",()=>{
    if(els.loginEmail.value.trim())els.loginOtpEmail.value=els.loginEmail.value.trim();
    switchLoginMode("otp");
    showMessage("Use Email OTP to securely recover access.","success");
  });

  els.passForm.addEventListener("submit",async event=>{
    event.preventDefault(); clearMessage();
    const email=els.loginEmail.value.trim().toLowerCase();
    const password=els.loginPassword.value;
    if(!validEmail(email))return showMessage("Enter a valid email address");
    if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");
    const button=$("login-password-submit");
    button.disabled=true; button.textContent="Signing in…";
    try{
      const data=await readResponse(await fetch(API_BASE+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})}));
      completeLogin(data,"password");
    }catch(error){showMessage(error.message||"Unable to sign in")}
    finally{button.disabled=false;button.textContent="Login with Password"}
  });

  $("login-send-otp").addEventListener("click",async function(){
    clearMessage();
    const email=els.loginOtpEmail.value.trim().toLowerCase();
    if(!validEmail(email))return showMessage("Enter a valid email address");
    this.disabled=true;this.textContent="Sending…";
    try{
      const data=await readResponse(await fetch(API_BASE+"/auth/request-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})}));
      showMessage(data.message||"Verification code sent","success");
      els.loginOtpCode.focus();
    }catch(error){showMessage(error.message||"Unable to send verification code")}
    finally{this.disabled=false;this.textContent="Get OTP"}
  });

  els.otpForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();
    const email=els.loginOtpEmail.value.trim().toLowerCase();
    const code=cleanOtp(els.loginOtpCode.value);
    if(!validEmail(email))return showMessage("Enter a valid email address");
    if(code.length!==6)return showMessage("Enter the 6-digit verification code");
    const button=$("login-otp-submit");button.disabled=true;button.textContent="Verifying…";
    try{
      const data=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code})}));
      if(needsPasswordSetup(data))showPasswordSetup(data,"otp",true);
      else completeLogin(data,"otp");
    }catch(error){showMessage(error.message||"Verification failed")}
    finally{button.disabled=false;button.textContent="Login with OTP"}
  });

  $("signup-send-otp").addEventListener("click",async function(){
    clearMessage();
    const name=els.signupName.value.trim();
    const email=els.signupEmail.value.trim().toLowerCase();
    if(name.length<2)return showMessage("Enter your full name");
    if(!validEmail(email))return showMessage("Enter a valid email address");
    this.disabled=true;this.textContent="Sending…";
    try{
      const data=await readResponse(await fetch(API_BASE+"/auth/request-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})}));
      showMessage(data.message||"Verification code sent","success");
      els.signupOtp.focus();
    }catch(error){showMessage(error.message||"Unable to send verification code")}
    finally{this.disabled=false;this.textContent="Send OTP"}
  });

  els.signupForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();
    const name=els.signupName.value.trim();
    const email=els.signupEmail.value.trim().toLowerCase();
    const code=cleanOtp(els.signupOtp.value);
    const password=els.signupPassword.value;
    if(name.length<2)return showMessage("Enter your full name");
    if(!validEmail(email))return showMessage("Enter a valid email address");
    if(code.length!==6)return showMessage("Enter the 6-digit verification code");
    if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");
    if(!els.signupTerms.checked)return showMessage("Accept the Terms and Privacy Policy to continue");
    const button=$("signup-submit");button.disabled=true;button.textContent="Creating account…";
    try{
      const verified=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code,name})}));
      saveSession(verified,"otp");
      const updated=await readResponse(await authFetch(API_BASE+"/auth/password",{method:"PUT",headers:{"Content-Type":"application/json","Authorization":"Bearer "+currentAccessToken()},body:JSON.stringify({password})}));
      completeLogin({...verified,user:updated.user||verified.user,subscription:updated.subscription||verified.subscription},"password");
    }catch(error){showMessage(error.message||"Unable to create account")}
    finally{button.disabled=false;button.textContent="Create Account"}
  });

  els.setupForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();
    const password=els.setupPassword.value, confirm=els.setupConfirm.value;
    if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");
    if(password!==confirm)return showMessage("Passwords do not match");
    const token=currentAccessToken();
    if(!token)return showMessage("Secure session missing. Verify your email again.");
    const button=$("setup-password-submit");button.disabled=true;button.textContent="Saving…";
    try{
      const updated=await readResponse(await authFetch(API_BASE+"/auth/password",{method:"PUT",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({password})}));
      completeLogin({...pendingAuthData,token,user:updated.user||pendingAuthData?.user||null,subscription:updated.subscription||pendingAuthData?.subscription||null},pendingAuthMethod||"password");
    }catch(error){showMessage(error.message||"Unable to save password")}
    finally{button.disabled=false;button.textContent="Save Password & Continue"}
  });

  function setGoogleBusy(busy,label){
    [els.googleLogin,els.googleSignup].forEach(button=>{
      if(!button)return;
      button.disabled=busy;
      const span=button.querySelector("span");
      if(span&&label)span.textContent=label;
    });
  }
  function resetGoogleLabels(){
    const loginSpan=els.googleLogin?.querySelector("span"); if(loginSpan)loginSpan.textContent="Sign in with Google";
    const signupSpan=els.googleSignup?.querySelector("span"); if(signupSpan)signupSpan.textContent="Sign up with Google";
    setGoogleBusy(false);
  }
  function startGoogle(){
    clearMessage();
    if(window.AndroidApp&&typeof window.AndroidApp.startGoogleSignIn==="function"){
      setGoogleBusy(true,"Opening Google…");
      try{window.AndroidApp.startGoogleSignIn()}catch(_){resetGoogleLabels();showMessage("Could not open Google sign-in")}
      return;
    }
    showMessage("Google sign-in is available in the Android app. On web, use Password or Email OTP.");
  }
  els.googleLogin.addEventListener("click",startGoogle);
  els.googleSignup.addEventListener("click",startGoogle);

  window.onNativeGoogleSignInResult=async function(payload){
    let result=payload;
    if(typeof payload==="string"){
      try{result=JSON.parse(payload)}catch(_){result={success:false,message:"Google sign-in returned an invalid response"}}
    }
    if(!result||result.success===false||!result.idToken){resetGoogleLabels();return showMessage(result?.message||"Google sign-in was cancelled")}
    showMessage("Google account verified. Finishing sign in…","success");
    try{
      const data=await readResponse(await fetch(API_BASE+"/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:result.idToken})}));
      if(needsPasswordSetup(data))showPasswordSetup(data,"google",false);
      else completeLogin(data,"google");
    }catch(error){resetGoogleLabels();showMessage(error.message||"Google login is unavailable")}
  };

  function hasCachedLocalAccess(){
    try{if(JSON.parse(localStorage.getItem(ACCOUNT_KEY)||"null")?.user)return true}catch(_){}
    try{const s=JSON.parse(localStorage.getItem("vyapar_ai_prod_v1")||"{}");return Boolean(s.sales?.length||s.stocks?.length||s.monthly?.length||s.daily?.length)}catch(_){return false}
  }
  async function restoreSession(){
    const token=currentAccessToken();
    if(!token)return;
    els.subtitle.textContent="Checking your saved session…";
    try{
      const data=await readResponse(await authFetch(API_BASE+"/auth/me",{headers:{Authorization:"Bearer "+token}}));
      localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user,subscription:data.subscription}));
      gate.remove();
    }catch(error){
      const rejected=error&&(error.status===401||error.status===403);
      if(rejected){
        clearSessionTokens();localStorage.removeItem(ACCOUNT_KEY);showLogin();showMessage("Your session expired. Sign in again.");return;
      }
      if(hasCachedLocalAccess()){console.warn("Session check unavailable; opening cached local app.",error);gate.remove();return;}
      showLogin();showMessage("Server is temporarily unavailable. Check your internet connection and try again.");
    }
  }

  switchLoginMode("password");
  showLogin();
  restoreSession();
})();
