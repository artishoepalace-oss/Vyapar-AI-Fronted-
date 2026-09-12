package com.vyaparai.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Public releases only. No GitHub token is bundled. All install actions require Android consent. */
final class GitHubUpdater {
    static final String REPO = "artishoepalace-oss/Vyapar-AI-Fronted-";
    private static final String API = "https://api.github.com/repos/" + REPO + "/releases/latest";
    private static final String ASSET_PREFIX = "https://github.com/" + REPO + "/releases/download/";
    private static final long MAX_APK = 250L * 1024 * 1024;
    private final Activity activity;
    private final WebView web;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean(false);
    private final AtomicBoolean installing = new AtomicBoolean(false);
    private volatile JSONObject release;
    private volatile String state = "{\"status\":\"idle\"}";
    private volatile boolean closed;
    private boolean waitingPermission;
    private boolean installerOpen;
    private final File apk;

    GitHubUpdater(Activity activity, WebView web) {
        this.activity=activity; this.web=web;
        apk = new File(activity.getFilesDir(), "updates/latest.apk");
        if (apk.isFile()) {
            worker.execute(() -> {
                try { validateApk(apk); progress("ready", "Downloaded update is ready. Tap Install update.", 0, 0); }
                catch (Exception ignored) { progress("idle", "Check for the latest published GitHub release.", 0, 0); }
            });
        }
    }
    String getState() { return state; }
    private void callback(String name, JSONObject data) {
        if(closed)return;
        activity.runOnUiThread(() -> { if(!closed)web.evaluateJavascript("window."+name+" && window."+name+"("+data.toString()+");", null); });
    }
    private void progress(String status, String message, long bytes, long total) {
        try {
            JSONObject data=new JSONObject().put("status",status).put("message",message).put("bytes",bytes).put("total",total);
            state=data.toString(); callback("onGitHubUpdateProgress",data);
        } catch(Exception ignored) { }
    }
    void check(int requestId) {
        worker.execute(() -> {
            JSONObject result=new JSONObject();
            try { result.put("requestId",requestId); } catch(Exception ignored) { }
            HttpURLConnection connection=null;
            try {
                connection=open(API,false);
                try(InputStream input=connection.getInputStream()) {
                    ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] buffer=new byte[8192]; int n;
                    while((n=input.read(buffer))!=-1) { if(out.size()+n>1024*1024)throw new Exception("Release response is too large.");out.write(buffer,0,n); }
                    JSONObject data=new JSONObject(out.toString("UTF-8"));
                    if(data.optBoolean("draft") || data.optBoolean("prerelease"))throw new Exception("No stable release is published yet.");
                    String version=data.optString("tag_name").replaceFirst("^v", "");
                    if(!version.matches("\\d+(\\.\\d+)*"))throw new Exception("Unsupported release version.");
                    release=data;result.put("release",data);
                }
            } catch(Exception e) { try{result.put("error",e.getMessage()==null?"GitHub update check failed.":e.getMessage());}catch(Exception ignored){} }
            finally { if(connection!=null)connection.disconnect(); }
            callback("onGitHubUpdateCheck",result);
        });
    }
    private HttpURLConnection open(String address, boolean asset) throws Exception {
        URL url=new URL(address);
        for(int redirects=0; redirects<6; redirects++) {
            String host=url.getHost();
            boolean allowed=asset ? (url.toString().startsWith(ASSET_PREFIX) || "release-assets.githubusercontent.com".equals(host) || "objects.githubusercontent.com".equals(host)) : API.equals(url.toString());
            if(!"https".equals(url.getProtocol()) || !allowed || url.getUserInfo()!=null || (url.getPort()!=-1 && url.getPort()!=443))throw new Exception("Untrusted update download address.");
            HttpURLConnection c=(HttpURLConnection)url.openConnection(); c.setInstanceFollowRedirects(false);c.setConnectTimeout(12000);c.setReadTimeout(15000);
            c.setRequestProperty("User-Agent","VyaparAI-Android-Updater");c.setRequestProperty("Accept",asset?"application/octet-stream":"application/vnd.github+json");
            int code=c.getResponseCode();
            if(code>=300 && code<400) {String location=c.getHeaderField("Location");c.disconnect();if(location==null)throw new Exception("Invalid update redirect.");url=new URL(url,location);continue;}
            if(code!=200) {c.disconnect();throw new Exception(code==403||code==429?"GitHub rate limit reached. Try again later.":code==404?"No published release or APK was found.":"GitHub download failed (HTTP "+code+").");}
            return c;
        }
        throw new Exception("Too many update redirects.");
    }
    private JSONObject asset() throws Exception {
        JSONObject data=release;if(data==null)throw new Exception("Check for updates before downloading.");
        String version=data.getString("tag_name").replaceFirst("^v", "");
        JSONArray assets=data.optJSONArray("assets");JSONObject candidate=null;int count=0;
        if(assets!=null)for(int i=0;i<assets.length();i++) {
            JSONObject a=assets.getJSONObject(i);String name=a.optString("name");
            if(!"uploaded".equals(a.optString("state")) || !name.toLowerCase(java.util.Locale.US).endsWith(".apk") || !a.optString("browser_download_url").startsWith(ASSET_PREFIX) || a.optLong("size")<=0)continue;
            if(name.equals("VyaparAI-"+version+".apk"))return a;
            candidate=a;count++;
        }
        if(count!=1)throw new Exception("A matching APK has not been uploaded to this release.");return candidate;
    }
    void download() {
        if(!downloading.compareAndSet(false,true))return;
        worker.execute(() -> {
            File part=new File(apk.getParentFile(),"latest.part");HttpURLConnection connection=null;
            try {
                JSONObject selected=asset();long expected=selected.getLong("size");
                if(expected>MAX_APK)throw new Exception("Update exceeds the download size limit.");
                String expectedVersion=release.getString("tag_name").replaceFirst("^v", "");
                if(!apk.getParentFile().isDirectory() && !apk.getParentFile().mkdirs())throw new Exception("Unable to create update storage.");
                if(apk.getParentFile().getUsableSpace()<expected+10*1024*1024)throw new Exception("Not enough free space to download this update.");
                progress("downloading","Downloading APK…",0,expected);
                connection=open(selected.getString("browser_download_url"),true);
                MessageDigest digest=MessageDigest.getInstance("SHA-256");long total=0,last=0,started=System.currentTimeMillis();
                try(InputStream input=connection.getInputStream();FileOutputStream output=new FileOutputStream(part)) {
                    byte[] bytes=new byte[32768];int n;
                    while((n=input.read(bytes))!=-1) {
                        if(closed || Thread.currentThread().isInterrupted())throw new Exception("Download interrupted. Tap download to retry.");
                        if(System.currentTimeMillis()-started>10*60*1000)throw new Exception("Download timed out. Please retry.");
                        total+=n;if(total>expected || total>MAX_APK)throw new Exception("APK size does not match the release.");
                        output.write(bytes,0,n);digest.update(bytes,0,n);
                        long now=System.currentTimeMillis();if(now-last>500){progress("downloading","Downloading APK · "+(total*100/expected)+"%",total,expected);last=now;}
                    }
                    output.getFD().sync();
                }
                if(total!=expected)throw new Exception("Download was incomplete. Please retry.");
                String hash=selected.optString("digest");
                if(!hash.isEmpty() && !"null".equals(hash)) {
                    StringBuilder actual=new StringBuilder("sha256:");for(byte b:digest.digest())actual.append(String.format(java.util.Locale.US,"%02x",b&255));
                    if(!actual.toString().equalsIgnoreCase(hash))throw new Exception("APK checksum did not match. Download rejected.");
                }
                progress("verifying","Verifying APK, version and signing certificate…",total,expected);
                PackageInfo info=validateApk(part);
                if(!expectedVersion.equals(info.versionName))throw new Exception("APK version does not match the published release.");
                if(!part.renameTo(apk))throw new Exception("Unable to save the downloaded APK.");
                progress("ready","Download verified. Confirm installation in Android.",total,expected);
                activity.runOnUiThread(this::install);
            } catch(Exception e) { progress("error",e.getMessage()==null?"Download failed. Please retry.":e.getMessage(),0,0); }
            finally { downloading.set(false);if(connection!=null)connection.disconnect();if(part.isFile())part.delete(); }
        });
    }
    @SuppressWarnings("deprecation")
    private PackageInfo validateApk(File file) throws Exception {
        PackageManager pm=activity.getPackageManager();
        PackageInfo candidate=pm.getPackageArchiveInfo(file.getAbsolutePath(),PackageManager.GET_SIGNATURES);
        PackageInfo installed=pm.getPackageInfo(activity.getPackageName(),PackageManager.GET_SIGNATURES);
        if(candidate==null || !activity.getPackageName().equals(candidate.packageName))throw new Exception("This APK is not Vyapar AI. Installation blocked.");
        long next=Build.VERSION.SDK_INT>=28?candidate.getLongVersionCode():candidate.versionCode;
        long current=Build.VERSION.SDK_INT>=28?installed.getLongVersionCode():installed.versionCode;
        if(next<=current)throw new Exception("This APK is not newer than the installed app.");
        if(candidate.signatures==null || installed.signatures==null || candidate.signatures.length==0 || candidate.signatures.length!=installed.signatures.length)throw new Exception("APK signing certificate is missing or different.");
        for(Signature signature:installed.signatures)if(!Arrays.asList(candidate.signatures).contains(signature))throw new Exception("APK signing key differs from this app. Ask for an update signed with the original key. Do not uninstall: that would remove local data.");
        return candidate;
    }
    void install() {
        if(closed || !installing.compareAndSet(false,true))return;
        // APK parsing / certificate verification stays off the UI thread.
        worker.execute(() -> {
            try { validateApk(apk);activity.runOnUiThread(this::launchInstaller); }
            catch(Exception e){installing.set(false);progress("error",e.getMessage(),0,0);}
        });
    }
    private void launchInstaller() {
        if(closed)return;
        try {
            if(Build.VERSION.SDK_INT>=26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                waitingPermission=true;
                progress("permission","Allow updates from Vyapar AI on the next Android screen, then return to install.",0,0);
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));
                return;
            }
            Uri uri=Uri.parse("content://"+activity.getPackageName()+".updates/latest.apk");
            Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("Vyapar AI update",uri));
            activity.startActivity(intent);
            installerOpen=true;
            progress("installer","Android installer opened. Confirm installation; if cancelled, tap Install update to retry.",0,0);
        } catch(Exception e){installing.set(false);waitingPermission=false;progress("ready","Installer could not open. Tap Install update to retry.",0,0);}
    }
    void resume() {
        if(installerOpen){installerOpen=false;installing.set(false);progress("ready","Update is ready. If installation was cancelled, tap Install update to retry.",0,0);}
        if(!waitingPermission)return;waitingPermission=false;
        installing.set(false);
        if(Build.VERSION.SDK_INT<26 || activity.getPackageManager().canRequestPackageInstalls())install();
        else progress("permission","Install permission was not enabled. Tap Install update to try again.",0,0);
    }
    void close(){closed=true;worker.shutdownNow();}
}
