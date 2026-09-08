(function(){
  "use strict";

  if(window.__vyaparAuth867Ready)return;
  window.__vyaparAuth867Ready=true;
  document.getElementById("vyaparOtpGate")?.remove();

  const API_BASE="https://vypar-backend.onrender.com";
  const TOKEN_KEY="vyapar_ai_auth_token_v1";
  const REFRESH_TOKEN_KEY="vyapar_ai_auth_refresh_token_v1";
  const ACCOUNT_KEY="vyapar_ai_account_cache_v1";
  const AUTH_METHOD_KEY="vyapar_ai_auth_method_v2";

  const gate=document.createElement("div");
  gate.id="vyaparOtpGate";
  if(localStorage.getItem(TOKEN_KEY))gate.style.setProperty('visibility','hidden','important');
  gate.innerHTML=`
    <div class="auth-page">
      <main class="auth-card" aria-labelledby="page-title">
        <button id="auth-back-login" class="auth-back hidden" type="button" aria-label="Back to sign in">←</button>
        <div class="auth-brand-row">
          <div class="auth-logo-box"><img src="assets/images/logo.png" alt="Vyapar AI Logo" class="auth-logo"></div>
          <h1 id="page-title" class="auth-title">Welcome Back</h1>
        </div>
        <p id="page-subtitle" class="auth-subtitle">Sign in to manage your smart business.</p>

        <section id="login-section" class="auth-section auth-space-5">
          <div class="auth-method-tabs" role="tablist" aria-label="Sign in method">
            <button id="tab-login-pass" class="auth-method-tab" type="button" role="tab" aria-selected="false">Password</button>
            <button id="tab-login-otp" class="auth-method-tab active" type="button" role="tab" aria-selected="true">Email OTP</button>
          </div>

          <form id="form-login-pass" class="auth-form auth-space-4 hidden" novalidate>
            <div><label class="auth-label" for="login-email">Email Address</label><input id="login-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"></div>
            <div>
              <div class="auth-label-row"><label class="auth-label" for="login-password">Password</label><button id="forgot-password" class="auth-forgot" type="button">Forgot password?</button></div>
              <input id="login-password" class="auth-input" type="password" autocomplete="current-password" placeholder="Enter password">
            </div>
            <button id="login-password-submit" class="auth-primary" type="submit">Sign in</button>
          </form>

          <form id="form-login-otp" class="auth-form auth-space-4" novalidate>
            <div>
              <label class="auth-label" for="login-otp-email">Email Address</label>
              <div class="auth-otp-row"><input id="login-otp-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"><button id="login-send-otp" class="auth-small-btn" type="button">Get OTP</button></div>
            </div>
            <div><label class="auth-label" for="login-otp-code">Enter OTP</label><input id="login-otp-code" class="auth-input auth-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit OTP code"></div>
            <button id="login-otp-submit" class="auth-primary" type="submit">Verify &amp; Sign in</button>
          </form>

          <div class="auth-divider"><span>or continue with</span></div>
          <button id="google-login" class="auth-google" type="button"><span class="auth-google-mark" aria-hidden="true">G</span><span>Sign in with Google</span></button>
          <p class="auth-switch">Don't have an account? <button id="show-signup" type="button">Create account</button></p>
        </section>

        <section id="signup-section" class="auth-section auth-space-4 hidden">
          <div class="auth-method-tabs auth-signup-tabs" role="tablist" aria-label="Create account method">
            <button id="tab-signup-pass" class="auth-method-tab active" type="button" role="tab" aria-selected="true">Password</button>
            <button id="tab-signup-otp" class="auth-method-tab" type="button" role="tab" aria-selected="false">Email OTP</button>
          </div>

          <form id="form-signup" class="auth-form auth-space-3" novalidate>
            <div><label class="auth-label" for="signup-name">Your Name</label><input id="signup-name" class="auth-input" type="text" autocomplete="name" placeholder="Enter your name"></div>
            <div><label class="auth-label" for="signup-email">Email Address</label><div class="auth-otp-row"><input id="signup-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"><button id="signup-send-otp" class="auth-small-btn" type="button">Get OTP</button></div></div>
            <div><label class="auth-label" for="signup-password">Create Password</label><input id="signup-password" class="auth-input" type="password" autocomplete="new-password" placeholder="Minimum 8 characters"></div>
            <div><label class="auth-label" for="signup-password-confirm">Confirm Password</label><input id="signup-password-confirm" class="auth-input" type="password" autocomplete="new-password" placeholder="Enter password again"></div>
            <div id="signup-password-otp-wrap" class="hidden"><label class="auth-label" for="signup-otp">Enter OTP</label><input id="signup-otp" class="auth-input auth-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit OTP code"></div>
            <button id="signup-submit" class="auth-primary" type="submit">Send verification OTP</button>
          </form>

          <form id="form-signup-otp" class="auth-form auth-space-3 hidden" novalidate>
            <div><label class="auth-label" for="signup-otp-name">Your Name</label><input id="signup-otp-name" class="auth-input" type="text" autocomplete="name" placeholder="Enter your name"></div>
            <div><label class="auth-label" for="signup-otp-email">Email Address</label><div class="auth-otp-row"><input id="signup-otp-email" class="auth-input" type="email" autocomplete="email" inputmode="email" placeholder="Enter email"><button id="signup-otp-send" class="auth-small-btn" type="button">Get OTP</button></div></div>
            <div><label class="auth-label" for="signup-otp-code">Enter OTP</label><input id="signup-otp-code" class="auth-input auth-otp-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit OTP code"></div>
            <button id="signup-otp-submit" class="auth-primary" type="submit">Verify &amp; Create Account</button>
          </form>

          <div class="auth-divider"><span>or continue with</span></div>
          <button id="google-signup" class="auth-google" type="button"><span class="auth-google-mark" aria-hidden="true">G</span><span>Continue with Google</span></button>
          <p class="auth-terms-copy">By creating an account, you agree to the <a href="pages/legal/terms.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="pages/legal/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>
          <p class="auth-switch">Already have an account? <button id="show-login" type="button">Sign in</button></p>
        </section>

        <section id="password-setup-section" class="auth-section hidden">
          <p id="password-setup-copy" class="password-setup-copy">Email verified. Create a password to finish setup.</p>
          <form id="form-password-setup" class="auth-form auth-space-4" novalidate>
            <div><label class="auth-label" for="setup-password">Create Password</label><input id="setup-password" class="auth-input" type="password" autocomplete="new-password" placeholder="Minimum 8 characters"></div>
            <div><label class="auth-label" for="setup-password-confirm">Confirm Password</label><input id="setup-password-confirm" class="auth-input" type="password" autocomplete="new-password" placeholder="Enter password again"></div>
            <button id="setup-password-submit" class="auth-primary" type="submit">Save Password &amp; Continue</button>
          </form>
        </section>
        <div id="auth-message" class="auth-message" role="status" aria-live="polite"></div>
      </main>
      <div class="auth-loading-overlay" role="status" aria-live="polite" aria-label="Opening Vyapar AI"><div class="auth-loading-card"><div class="auth-loading-spinner" aria-hidden="true"></div><strong>Login successful</strong><span>Opening home…</span></div></div>
    </div>`;
  document.body.prepend(gate);

  const $=id=>document.getElementById(id);
  const els={
    title:$("page-title"),subtitle:$("page-subtitle"),back:$("auth-back-login"),message:$("auth-message"),
    login:$("login-section"),signup:$("signup-section"),setup:$("password-setup-section"),
    passTab:$("tab-login-pass"),otpTab:$("tab-login-otp"),signupPassTab:$("tab-signup-pass"),signupOtpTab:$("tab-signup-otp"),
    passForm:$("form-login-pass"),otpForm:$("form-login-otp"),signupForm:$("form-signup"),signupOtpForm:$("form-signup-otp"),setupForm:$("form-password-setup"),
    loginEmail:$("login-email"),loginPassword:$("login-password"),loginOtpEmail:$("login-otp-email"),loginOtpCode:$("login-otp-code"),
    signupName:$("signup-name"),signupEmail:$("signup-email"),signupPassword:$("signup-password"),signupConfirm:$("signup-password-confirm"),signupOtp:$("signup-otp"),signupOtpWrap:$("signup-password-otp-wrap"),
    signupOtpName:$("signup-otp-name"),signupOtpEmail:$("signup-otp-email"),signupOtpCode:$("signup-otp-code"),
    setupPassword:$("setup-password"),setupConfirm:$("setup-password-confirm"),setupCopy:$("password-setup-copy"),
    googleLogin:$("google-login"),googleSignup:$("google-signup")
  };

  let pendingAuthData=null,pendingAuthMethod=null,refreshPromise=null;

  function syncViewport(){
    const viewport=window.visualViewport;
    const height=Math.max(320,Math.round(viewport?.height||window.innerHeight||document.documentElement.clientHeight||640));
    gate.style.setProperty("--auth-viewport-height",height+"px");
    gate.classList.toggle("auth-keyboard-open",Boolean(viewport&&window.innerHeight-height>120));
  }
  syncViewport();
  window.addEventListener("resize",syncViewport,{passive:true});
  window.visualViewport?.addEventListener("resize",syncViewport,{passive:true});
  window.visualViewport?.addEventListener("scroll",syncViewport,{passive:true});
  gate.addEventListener("focusin",event=>{if(event.target.matches("input"))setTimeout(()=>event.target.scrollIntoView({block:"center",inline:"nearest"}),120)});

  const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||"").trim());
  const cleanOtp=value=>String(value||"").replace(/\D/g,"").slice(0,6);
  const currentAccessToken=()=>String(localStorage.getItem(TOKEN_KEY)||"").trim();
  const accessTokenFrom=data=>String(data?.token||data?.accessToken||data?.access_token||data?.data?.token||data?.data?.accessToken||data?.data?.access_token||"").trim();
  const refreshTokenFrom=data=>String(data?.refreshToken||data?.refresh_token||data?.data?.refreshToken||data?.data?.refresh_token||"").trim();
  const needsPasswordSetup=data=>Boolean((data?.user||data?.data?.user)?.password_configured===false);

  function clearMessage(){els.message.textContent="";els.message.className="auth-message"}
  function showMessage(text,type="error"){els.message.textContent=text||"";els.message.className="auth-message "+type}
  function resetScroll(){requestAnimationFrame(()=>{gate.scrollTop=0})}
  function clearSessionTokens(){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(REFRESH_TOKEN_KEY)}
  function storeSessionTokens(data){
    const access=accessTokenFrom(data),refresh=refreshTokenFrom(data);
    if(access)localStorage.setItem(TOKEN_KEY,access);
    if(refresh)localStorage.setItem(REFRESH_TOKEN_KEY,refresh);
    return access;
  }
  function saveSession(data,method){
    const token=storeSessionTokens(data);
    if(!token)throw new Error("Login response did not include a secure token");
    localStorage.setItem(AUTH_METHOD_KEY,method||"account");
    localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user||data?.data?.user||null,subscription:data.subscription||data?.data?.subscription||null}));
  }
  async function readResponse(response){
    const text=await response.text();let data={};
    try{data=text?JSON.parse(text):{}}catch(_){const error=new Error("The server returned an invalid response");error.status=response.status;throw error}
    if(!response.ok||data.success===false){const error=new Error(data.message||"Request failed");error.status=response.status;throw error}
    return data;
  }
  async function refreshAccessToken(signal,isActive=()=>true){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      const refresh=String(localStorage.getItem(REFRESH_TOKEN_KEY)||"").trim(),access=currentAccessToken();
      if(!refresh&&!access)return "";
      try{
        const headers={"Content-Type":"application/json","Accept":"application/json"};if(access)headers.Authorization="Bearer "+access;
        const response=await fetch(API_BASE+"/auth/refresh",{method:"POST",headers,body:JSON.stringify(refresh?{refreshToken:refresh}:{}),signal});
        if(!response.ok)return "";
        const data=await response.json().catch(()=>({}));if(data.success===false)return "";
        if(!isActive()||signal?.aborted)return "";
        const next=storeSessionTokens(data);if(!next)return "";
        const user=data.user||data?.data?.user||null,subscription=data.subscription||data?.data?.subscription||null;
        if(user||subscription){let cached={};try{cached=JSON.parse(localStorage.getItem(ACCOUNT_KEY)||"{}")||{}}catch(_){}localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:user||cached.user||null,subscription:subscription||cached.subscription||null}))}
        return next;
      }catch(_){return ""}
    })();
    try{return await refreshPromise}finally{refreshPromise=null}
  }
  async function authFetch(input,init={}){
    const base=new Request(input,init),headers=new Headers(base.headers),token=currentAccessToken();
    if(token&&!headers.has("Authorization"))headers.set("Authorization","Bearer "+token);
    const first=new Request(base,{headers}),retryTemplate=first.clone();
    let response=await fetch(first);
    const url=String(first.url||input);
    if(response.status!==401||/\/auth\/(?:login|register|request-otp|verify-otp|google|refresh)(?:\?|$)/.test(url))return response;
    const next=await refreshAccessToken();if(!next)return response;
    const retryHeaders=new Headers(retryTemplate.headers);retryHeaders.set("Authorization","Bearer "+next);
    return fetch(new Request(retryTemplate,{headers:retryHeaders}));
  }
  window.vyaparAuthFetch=authFetch;
  window.vyaparRefreshAuthToken=refreshAccessToken;

  function completeLogin(data,method){
    saveSession(data,method);showMessage("Login successful. Opening home…","success");gate.classList.add("auth-loading");document.documentElement.classList.add("vy861-auth-handoff");
    try{window.scrollTo(0,0)}catch(_){}
    setTimeout(()=>{try{location.replace(location.href)}catch(_){location.reload()}},180);
  }
  function showLogin(){
    clearMessage();els.login.classList.remove("hidden");els.signup.classList.add("hidden");els.setup.classList.add("hidden");els.back.classList.add("hidden");els.title.textContent="Welcome Back";els.subtitle.textContent="Sign in to manage your smart business.";resetScroll();
    if(window.vyaparMotion) window.vyaparMotion.enter(els.login,-1);
  }
  function showSignup(){
    clearMessage();els.login.classList.add("hidden");els.signup.classList.remove("hidden");els.setup.classList.add("hidden");els.back.classList.remove("hidden");els.title.textContent="Create Account";els.subtitle.textContent="Create your Vyapar AI account and start managing your business.";switchSignupMode("password");resetScroll();
    if(window.vyaparMotion) window.vyaparMotion.enter(els.signup,1);
  }
  function switchLoginMode(mode){
    const otp=mode==="otp";els.passForm.classList.toggle("hidden",otp);els.otpForm.classList.toggle("hidden",!otp);els.passTab.classList.toggle("active",!otp);els.otpTab.classList.toggle("active",otp);els.passTab.setAttribute("aria-selected",String(!otp));els.otpTab.setAttribute("aria-selected",String(otp));els.passTab.tabIndex=otp?-1:0;els.otpTab.tabIndex=otp?0:-1;
    if(otp&&els.loginEmail.value.trim()&&!els.loginOtpEmail.value.trim())els.loginOtpEmail.value=els.loginEmail.value.trim();clearMessage();
    if(window.vyaparMotion) window.vyaparMotion.enter(otp?els.otpForm:els.passForm,otp?1:-1);
  }
  function switchSignupMode(mode){
    const otp=mode==="otp";els.signupForm.classList.toggle("hidden",otp);els.signupOtpForm.classList.toggle("hidden",!otp);els.signupPassTab.classList.toggle("active",!otp);els.signupOtpTab.classList.toggle("active",otp);els.signupPassTab.setAttribute("aria-selected",String(!otp));els.signupOtpTab.setAttribute("aria-selected",String(otp));els.signupPassTab.tabIndex=otp?-1:0;els.signupOtpTab.tabIndex=otp?0:-1;clearMessage();
    if(window.vyaparMotion) window.vyaparMotion.enter(otp?els.signupOtpForm:els.signupForm,otp?1:-1);
  }
  function showPasswordSetup(data,method,recovery){
    saveSession(data,method);pendingAuthData=data;pendingAuthMethod=method;els.login.classList.add("hidden");els.signup.classList.add("hidden");els.setup.classList.remove("hidden");els.back.classList.add("hidden");els.title.textContent=recovery?"Recreate your password":"Create your password";els.subtitle.textContent=recovery?"Email verified. Set a new password to continue.":"Email verified. Create a password to finish setup.";els.setupCopy.textContent=els.subtitle.textContent;els.setupPassword.value="";els.setupConfirm.value="";clearMessage();resetScroll();
    if(window.vyaparMotion) window.vyaparMotion.enter(els.setup,1);
  }

  els.passTab.addEventListener("click",()=>switchLoginMode("password"));
  els.otpTab.addEventListener("click",()=>switchLoginMode("otp"));
  els.signupPassTab.addEventListener("click",()=>switchSignupMode("password"));
  els.signupOtpTab.addEventListener("click",()=>switchSignupMode("otp"));
  $("show-signup").addEventListener("click",showSignup);$("show-login").addEventListener("click",showLogin);els.back.addEventListener("click",showLogin);
  $("forgot-password").addEventListener("click",()=>{if(els.loginEmail.value.trim())els.loginOtpEmail.value=els.loginEmail.value.trim();switchLoginMode("otp");showMessage("Use Email OTP to securely recover access.","success")});

  els.passForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const email=els.loginEmail.value.trim().toLowerCase(),password=els.loginPassword.value;
    if(!validEmail(email))return showMessage("Enter a valid email address");if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");
    const button=$("login-password-submit");button.disabled=true;button.textContent="Signing in…";
    try{completeLogin(await readResponse(await fetch(API_BASE+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})})),"password")}catch(error){showMessage(error.message||"Unable to sign in")}finally{button.disabled=false;button.textContent="Sign in"}
  });

  async function requestOtp(button,email,successFocus){
    clearMessage();if(!validEmail(email))return showMessage("Enter a valid email address");button.disabled=true;button.textContent="Sending…";
    try{const data=await readResponse(await fetch(API_BASE+"/auth/request-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})}));showMessage(data.message||"Verification code sent","success");successFocus?.();return true}catch(error){showMessage(error.message||"Unable to send verification code");return false}finally{button.disabled=false;button.textContent="Get OTP"}
  }
  $("login-send-otp").addEventListener("click",function(){requestOtp(this,els.loginOtpEmail.value.trim().toLowerCase(),()=>els.loginOtpCode.focus())});
  els.otpForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const email=els.loginOtpEmail.value.trim().toLowerCase(),code=cleanOtp(els.loginOtpCode.value);
    if(!validEmail(email))return showMessage("Enter a valid email address");if(code.length!==6)return showMessage("Enter the 6-digit verification code");
    const button=$("login-otp-submit");button.disabled=true;button.textContent="Verifying…";
    try{const data=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code})}));needsPasswordSetup(data)?showPasswordSetup(data,"otp",true):completeLogin(data,"otp")}catch(error){showMessage(error.message||"Verification failed")}finally{button.disabled=false;button.textContent="Verify & Sign in"}
  });

  $("signup-send-otp").addEventListener("click",async function(){
    const name=els.signupName.value.trim(),email=els.signupEmail.value.trim().toLowerCase();if(name.length<2)return showMessage("Enter your full name");
    const sent=await requestOtp(this,email,()=>{els.signupOtpWrap.classList.remove("hidden");els.signupOtp.focus()});if(sent)$("signup-submit").textContent="Verify & Create Account";
  });
  els.signupForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const name=els.signupName.value.trim(),email=els.signupEmail.value.trim().toLowerCase(),password=els.signupPassword.value,confirm=els.signupConfirm.value,code=cleanOtp(els.signupOtp.value);
    if(name.length<2)return showMessage("Enter your full name");if(!validEmail(email))return showMessage("Enter a valid email address");if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");if(password!==confirm)return showMessage("Passwords do not match");
    if(els.signupOtpWrap.classList.contains("hidden")||code.length!==6){const sent=await requestOtp($("signup-send-otp"),email,()=>{els.signupOtpWrap.classList.remove("hidden");els.signupOtp.focus()});if(sent)$("signup-submit").textContent="Verify & Create Account";return}
    const button=$("signup-submit");button.disabled=true;button.textContent="Creating account…";
    try{const verified=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code,name})}));saveSession(verified,"otp");const updated=await readResponse(await authFetch(API_BASE+"/auth/password",{method:"PUT",headers:{"Content-Type":"application/json","Authorization":"Bearer "+currentAccessToken()},body:JSON.stringify({password})}));completeLogin({...verified,user:updated.user||verified.user,subscription:updated.subscription||verified.subscription},"password")}catch(error){showMessage(error.message||"Unable to create account")}finally{button.disabled=false;button.textContent="Verify & Create Account"}
  });

  $("signup-otp-send").addEventListener("click",function(){const name=els.signupOtpName.value.trim();if(name.length<2)return showMessage("Enter your full name");requestOtp(this,els.signupOtpEmail.value.trim().toLowerCase(),()=>els.signupOtpCode.focus())});
  els.signupOtpForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const name=els.signupOtpName.value.trim(),email=els.signupOtpEmail.value.trim().toLowerCase(),code=cleanOtp(els.signupOtpCode.value);
    if(name.length<2)return showMessage("Enter your full name");if(!validEmail(email))return showMessage("Enter a valid email address");if(code.length!==6)return showMessage("Enter the 6-digit verification code");
    const button=$("signup-otp-submit");button.disabled=true;button.textContent="Verifying…";
    try{const verified=await readResponse(await fetch(API_BASE+"/auth/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,code,name})}));needsPasswordSetup(verified)?showPasswordSetup(verified,"otp",false):completeLogin(verified,"otp")}catch(error){showMessage(error.message||"Unable to create account")}finally{button.disabled=false;button.textContent="Verify & Create Account"}
  });

  els.setupForm.addEventListener("submit",async event=>{
    event.preventDefault();clearMessage();const password=els.setupPassword.value,confirm=els.setupConfirm.value;if(password.length<8||password.length>72)return showMessage("Password must be 8-72 characters");if(password!==confirm)return showMessage("Passwords do not match");const token=currentAccessToken();if(!token)return showMessage("Secure session missing. Verify your email again.");
    const button=$("setup-password-submit");button.disabled=true;button.textContent="Saving…";
    try{const updated=await readResponse(await authFetch(API_BASE+"/auth/password",{method:"PUT",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({password})}));completeLogin({...pendingAuthData,token,user:updated.user||pendingAuthData?.user||null,subscription:updated.subscription||pendingAuthData?.subscription||null},pendingAuthMethod||"password")}catch(error){showMessage(error.message||"Unable to save password")}finally{button.disabled=false;button.textContent="Save Password & Continue"}
  });

  function setGoogleBusy(busy,label){[els.googleLogin,els.googleSignup].forEach(button=>{button.disabled=busy;const span=button.querySelector("span:last-child");if(span&&label)span.textContent=label})}
  function resetGoogleLabels(){els.googleLogin.querySelector("span:last-child").textContent="Sign in with Google";els.googleSignup.querySelector("span:last-child").textContent="Continue with Google";setGoogleBusy(false)}
  function startGoogle(){clearMessage();if(window.AndroidApp&&typeof window.AndroidApp.startGoogleSignIn==="function"){setGoogleBusy(true,"Opening Google…");try{window.AndroidApp.startGoogleSignIn()}catch(_){resetGoogleLabels();showMessage("Could not open Google sign-in")}return}showMessage("Google sign-in is available in the Android app. On web, use Password or Email OTP.")}
  els.googleLogin.addEventListener("click",startGoogle);els.googleSignup.addEventListener("click",startGoogle);
  window.onNativeGoogleSignInResult=async payload=>{
    let result=payload;if(typeof payload==="string"){try{result=JSON.parse(payload)}catch(_){result={success:false,message:"Google sign-in returned an invalid response"}}}
    if(!result||result.success===false||!result.idToken){resetGoogleLabels();return showMessage(result?.message||"Google sign-in was cancelled")}
    showMessage("Google account verified. Finishing sign in…","success");
    try{const data=await readResponse(await fetch(API_BASE+"/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:result.idToken})}));needsPasswordSetup(data)?showPasswordSetup(data,"google",false):completeLogin(data,"google")}catch(error){resetGoogleLabels();showMessage(error.message||"Google login is unavailable")}
  };

  function hasCachedLocalAccess(){try{if(JSON.parse(localStorage.getItem(ACCOUNT_KEY)||"null")?.user)return true}catch(_){}try{const state=JSON.parse(localStorage.getItem("vyapar_ai_prod_v1")||"{}");return Boolean(state.sales?.length||state.stocks?.length||state.monthly?.length||state.daily?.length)}catch(_){return false}}
  function finishSessionRestore(status){
    if(status==='login')gate.style.removeProperty('visibility');
    else gate.remove();
    document.documentElement.setAttribute('data-vyapar-session',status);
    window.dispatchEvent(new CustomEvent('vyapar:session-ready',{detail:{status}}));
  }

  async function restoreSession(){
    const token=currentAccessToken();
    if(!token){finishSessionRestore('login');return}
    document.documentElement.setAttribute('data-vyapar-session','restoring');
    let active=true,timer=null,rejectedStatus=0;
    const controller=typeof AbortController==='function'?new AbortController():null;
    const signal=controller?controller.signal:undefined;
    const stillActive=()=>active;
    try{
      const request=(async()=>{
        let response=await fetch(API_BASE+"/auth/me",{headers:{Authorization:"Bearer "+token},signal});
        if(!active)throw new Error('Session check ended');
        if(response.status===401){
          rejectedStatus=401;
          const next=await refreshAccessToken(signal,stillActive);
          if(!active)throw new Error('Session check ended');
          if(next)response=await fetch(API_BASE+"/auth/me",{headers:{Authorization:"Bearer "+next},signal});
        }
        if(response.status===401||response.status===403)rejectedStatus=response.status;
        // A successful refresh must also pass /me before clearing rejection.
        const data=await readResponse(response);
        rejectedStatus=0;
        return data;
      })();
      const deadline=new Promise((_,reject)=>{
        timer=setTimeout(()=>{
          active=false;
          const error=new Error('Session check timed out');
          if(rejectedStatus)error.status=rejectedStatus;
          reject(error);
          if(controller)controller.abort();
        },6000);
      });
      const data=await Promise.race([request,deadline]);
      active=false;
      localStorage.setItem(ACCOUNT_KEY,JSON.stringify({user:data.user,subscription:data.subscription}));
      finishSessionRestore('authenticated');
    }catch(error){
      active=false;
      const rejected=error&&(error.status===401||error.status===403);
      if(rejected){
        clearSessionTokens();localStorage.removeItem(ACCOUNT_KEY);showLogin();
        showMessage("Your session expired. Sign in again.");finishSessionRestore('login');
      }else if(hasCachedLocalAccess()){
        // Preserve the existing offline/local-data fallback, never grant a new
        // subscription or bypass a server rejection from the current check.
        finishSessionRestore('cached');
      }else{
        showLogin();showMessage("Server is temporarily unavailable. Check your internet connection and try again.");
        finishSessionRestore('login');
      }
    }finally{
      clearTimeout(timer);
    }
  }

  switchLoginMode("otp");showLogin();restoreSession();
})();
